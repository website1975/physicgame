
import React, { useState, useEffect, useRef } from 'react';
import { GameState, Teacher, MatchData } from '../../types';
import ProblemCard from '../ProblemCard';
import AnswerInput from '../AnswerInput';
import LatexRenderer from '../LatexRenderer';
import { supabase } from '../../services/supabaseService';

const INTRO_TIME = 10;

interface TeacherEngineProps {
  gameState: GameState;
  setGameState: (s: GameState) => void;
  playerName: string;
  currentTeacher: Teacher;
  matchData: MatchData;
  onExit: () => void;
}

const TeacherEngine: React.FC<TeacherEngineProps> = ({ gameState, setGameState, playerName, currentTeacher, matchData, onExit }) => {
  const [currentRoundIdx, setCurrentRoundIdx] = useState(0);
  const [currentProblemIdx, setCurrentProblemIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(40);
  const [introTimer, setIntroTimer] = useState(INTRO_TIME);
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState<any>(null);
  const [buzzerWinner, setBuzzerWinner] = useState<string | null>(null);
  const [isHelpUsed, setIsHelpUsed] = useState(false);
  const [stopMessage, setStopMessage] = useState<string | null>(null);

  const rounds = matchData.rounds;
  const currentRound = rounds[currentRoundIdx];
  const allProblems = rounds.flatMap(r => r.problems);
  
  const flatIndex = rounds.slice(0, currentRoundIdx).reduce((acc, r) => acc + (r.problems?.length || 0), 0) + currentProblemIdx;
  const currentProblem = allProblems[flatIndex];
  
  const myId = matchData.myId || 'temp';
  const tId = currentTeacher?.id?.trim();
  const channelRef = useRef<any>(null);

  const stateRef = useRef({ gameState, currentRoundIdx, currentProblemIdx, buzzerWinner, score });
  useEffect(() => { 
    stateRef.current = { gameState, currentRoundIdx, currentProblemIdx, buzzerWinner, score };
  }, [gameState, currentRoundIdx, currentProblemIdx, buzzerWinner, score]);

  // Báo cáo về Bảng điều khiển của Thầy thông qua kênh arena_live
  const reportProgress = () => {
    if (!channelRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'student_score_update',
      payload: { 
        name: playerName, 
        uniqueId: myId, 
        score: stateRef.current.score,
        progress: `Câu ${flatIndex + 1}/${allProblems.length}`
      }
    });
  };

  useEffect(() => {
    if (!tId) return;
    const channelName = `arena_live_${tId}`;
    const channel = supabase.channel(channelName);

    channel
      .on('broadcast', { event: 'buzzer_signal' }, ({ payload }) => {
        if (!stateRef.current.buzzerWinner && stateRef.current.gameState === 'WAITING_FOR_BUZZER' && !stopMessage) {
          setBuzzerWinner(payload.playerId);
          setGameState('ANSWERING');
        }
      })
      .on('broadcast', { event: 'match_result' }, ({ payload }) => {
        if (payload.playerId !== myId && stateRef.current.gameState === 'ANSWERING') {
          setFeedback({ 
            isCorrect: payload.isCorrect, 
            text: `Bạn khác đã trả lời ${payload.isCorrect ? 'Đúng' : 'Sai'}. Đáp án đúng là: ${currentProblem?.correctAnswer}` 
          });
          setGameState('FEEDBACK');
        }
      })
      .on('broadcast', { event: 'teacher_command' }, (msg) => {
        if (msg.payload.type === 'SYNC_NEXT') {
           handleNextQuestion();
        } else if (msg.payload.type === 'STOP') {
           setStopMessage(msg.payload.message || "Các em ngừng, nghe thầy giảng");
        } else if (msg.payload.type === 'RESUME') {
           setStopMessage(null);
        }
      })
      .subscribe();

    channelRef.current = channel;
    reportProgress();
    return () => { supabase.removeChannel(channel); };
  }, [tId, currentProblem?.id, stopMessage]);

  useEffect(() => {
    let t: any;
    if (gameState === 'ROUND_INTRO' && !stopMessage) {
      setIntroTimer(INTRO_TIME);
      t = setInterval(() => {
        setIntroTimer(p => {
          if (p <= 1) {
            clearInterval(t);
            setGameState('WAITING_FOR_BUZZER');
            return 0;
          }
          return p - 1;
        });
      }, 1000);
    }
    return () => { if (t) clearInterval(t); };
  }, [gameState, currentRoundIdx, stopMessage]);

  useEffect(() => {
    if ((gameState === 'WAITING_FOR_BUZZER' || gameState === 'ANSWERING') && timeLeft > 0 && !stopMessage) {
      const t = setInterval(() => setTimeLeft(p => p - 1), 1000);
      return () => clearInterval(t);
    } else if (timeLeft === 0 && (gameState === 'WAITING_FOR_BUZZER' || gameState === 'ANSWERING') && !stopMessage) {
      if (gameState === 'ANSWERING' && buzzerWinner === myId) {
         submitAnswer();
      } else {
         setFeedback({ isCorrect: false, text: "Hết thời gian! Đáp án là: " + currentProblem?.correctAnswer });
         setGameState('FEEDBACK');
      }
    }
  }, [gameState, timeLeft, stopMessage]);

  const handleBuzzer = () => {
    if (gameState === 'WAITING_FOR_BUZZER' && !buzzerWinner && !stopMessage && channelRef.current) {
      channelRef.current.send({ type: 'broadcast', event: 'buzzer_signal', payload: { playerId: myId } });
      setBuzzerWinner(myId);
      setGameState('ANSWERING');
    }
  };

  const submitAnswer = () => {
    if (stopMessage) return;
    const correct = (currentProblem?.correctAnswer || "").trim().toUpperCase();
    const isPerfect = userAnswer.trim().toUpperCase() === correct;
    const points = isPerfect ? (isHelpUsed ? 60 : 100) : (isHelpUsed ? -40 : -50);
    
    setScore(s => s + points);
    setFeedback({ isCorrect: isPerfect, text: isPerfect ? `CHÍNH XÁC! (+${points}đ)` : `SAI RỒI! (${points}đ). Đáp án: ${correct}` });
    setGameState('FEEDBACK');
    
    channelRef.current?.send({ 
      type: 'broadcast', 
      event: 'match_result', 
      payload: { playerId: myId, points, isCorrect: isPerfect } 
    });
    reportProgress();
  };

  const handleNextQuestion = () => {
    let nextP = currentProblemIdx + 1;
    let nextR = currentRoundIdx;
    let nextState: GameState = 'WAITING_FOR_BUZZER';

    if (nextP >= (rounds[nextR]?.problems?.length || 0)) {
      nextP = 0;
      nextR++;
      nextState = 'ROUND_INTRO';
    }

    if (nextR < rounds.length) {
      setCurrentRoundIdx(nextR);
      setCurrentProblemIdx(nextP);
      setBuzzerWinner(null);
      setFeedback(null);
      setUserAnswer('');
      setIsHelpUsed(false);
      setTimeLeft(rounds[nextR].problems[nextP].timeLimit || 40);
      setGameState(nextState);
      reportProgress();
    } else {
      setGameState('GAME_OVER');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col p-4 relative overflow-hidden">
      {stopMessage && (
        <div className="fixed inset-0 z-[1000] bg-slate-900/95 backdrop-blur-2xl flex items-center justify-center p-8 animate-in fade-in zoom-in duration-300">
           <div className="bg-white rounded-[4rem] p-16 shadow-2xl max-w-2xl w-full text-center border-b-[20px] border-amber-500 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-4 bg-amber-500 animate-pulse"></div>
              <div className="text-9xl mb-12 animate-bounce">📢</div>
              <h2 className="text-5xl font-black text-slate-800 uppercase italic mb-8 tracking-tighter leading-none">THÔNG BÁO TỪ THẦY</h2>
              <div className="bg-amber-50 p-10 rounded-[3rem] border-4 border-amber-100 shadow-inner">
                 <p className="text-3xl font-black text-amber-700 uppercase italic leading-tight">"{stopMessage}"</p>
              </div>
              <div className="mt-12 flex flex-col items-center gap-4">
                 <div className="flex gap-2">
                    <div className="w-3 h-3 bg-amber-500 rounded-full animate-bounce"></div>
                    <div className="w-3 h-3 bg-amber-500 rounded-full animate-bounce [animation-delay:200ms]"></div>
                    <div className="w-3 h-3 bg-amber-500 rounded-full animate-bounce [animation-delay:400ms]"></div>
                 </div>
                 <p className="text-[12px] font-black text-slate-400 uppercase italic tracking-widest">Máy đang tạm khóa tương tác...</p>
              </div>
           </div>
        </div>
      )}

      <header className="bg-white px-10 py-6 rounded-full shadow-lg mb-6 flex justify-between items-center border-b-8 border-slate-200">
        <div className="flex items-center gap-6">
           <div className="bg-blue-600 text-white px-8 py-3 rounded-full font-black italic shadow-lg text-lg">ĐIỂM: {score}</div>
           <div className="hidden md:flex flex-col">
              <span className="text-[9px] font-black text-slate-300 uppercase italic">LIVE: {currentTeacher?.tengv}</span>
              <span className="text-sm font-black text-slate-800 italic uppercase">Câu {flatIndex + 1} / {allProblems.length}</span>
           </div>
        </div>
        <div className="flex items-center gap-8">
           <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase italic">THỜI GIAN:</span>
              <span className={`text-5xl font-black italic tabular-nums leading-none ${timeLeft <= 5 ? 'text-rose-500 animate-pulse' : 'text-blue-600'}`}>{timeLeft}s</span>
           </div>
           <button onClick={onExit} className="bg-red-50 text-red-500 w-12 h-12 rounded-2xl flex items-center justify-center font-bold shadow-md">✕</button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-12 gap-8 min-h-0">
        <div className="col-span-12 lg:col-span-7">
           <ProblemCard problem={currentProblem!} isPaused={gameState !== 'WAITING_FOR_BUZZER' && gameState !== 'ANSWERING' || !!stopMessage} />
        </div>
        
        <div className="col-span-12 lg:col-span-5 bg-white rounded-[3.5rem] p-10 shadow-2xl flex flex-col border-4 border-slate-50 relative overflow-hidden items-center justify-center">
           {gameState === 'ROUND_INTRO' ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                 <h2 className="text-4xl font-black text-slate-800 uppercase italic mb-4">VÒNG {currentRound?.number}</h2>
                 <div className="text-6xl font-black text-blue-600 italic">{introTimer}s</div>
              </div>
           ) : gameState === 'WAITING_FOR_BUZZER' ? (
             <div className="flex flex-col items-center w-full animate-in zoom-in">
                <div className="text-[10rem] mb-12 cursor-pointer animate-bounce hover:scale-110 transition-transform active:scale-90" onClick={handleBuzzer}>🔔</div>
                <button onClick={handleBuzzer} className="w-full py-10 bg-red-600 text-white rounded-[3rem] font-black text-4xl italic shadow-[0_15px_0_rgb(153,27,27)] active:shadow-none active:translate-y-4 transition-all uppercase tracking-tighter">GIÀNH QUYỀN! 🎯</button>
             </div>
           ) : gameState === 'ANSWERING' ? (
             <div className="flex flex-col h-full w-full animate-in slide-in-from-bottom-10">
                {buzzerWinner === myId ? (
                   <>
                     <div className="flex justify-between items-center mb-6">
                        <span className="bg-blue-600 text-white px-6 py-2 rounded-2xl font-black uppercase italic text-[10px]">⚡ QUYỀN CỦA BẠN</span>
                        {!isHelpUsed && <button onClick={() => setIsHelpUsed(true)} className="bg-amber-100 text-amber-600 px-6 py-2 rounded-2xl font-black text-[10px] uppercase italic">Trợ giúp 💡</button>}
                     </div>
                     <div className="flex-1 overflow-y-auto no-scrollbar">
                        <AnswerInput problem={currentProblem!} value={userAnswer} onChange={setUserAnswer} onSubmit={submitAnswer} disabled={false} />
                     </div>
                     <button onClick={submitAnswer} disabled={!userAnswer} className={`w-full py-7 rounded-[2rem] font-black italic text-2xl mt-8 shadow-2xl border-b-[10px] transition-all active:translate-y-2 active:border-b-0 ${userAnswer ? 'bg-blue-600 text-white border-blue-800' : 'bg-slate-100 text-slate-300 border-slate-200'}`}>XÁC NHẬN ✅</button>
                   </>
                ) : (
                   <div className="flex flex-col items-center justify-center h-full opacity-50">
                      <div className="text-8xl mb-8">📡</div>
                      <p className="text-2xl font-black text-slate-400 uppercase italic text-center leading-tight">ĐỐI THỦ ĐANG TRẢ LỜI...<br/><span className="text-sm italic mt-2 block">Hãy chuẩn bị cho câu tiếp theo</span></p>
                   </div>
                )}
             </div>
           ) : (
             <div className="flex flex-col h-full w-full animate-in slide-in-from-right">
                <div className={`text-4xl font-black uppercase italic mb-6 ${feedback?.isCorrect ? 'text-emerald-500' : 'text-rose-500'}`}>{feedback?.isCorrect ? '✨ CHÍNH XÁC!' : '💥 SAI MẤT RỒI!'}</div>
                <div className="bg-slate-50 p-8 rounded-[2.5rem] border-2 border-slate-100 italic font-bold text-slate-700 mb-8 shadow-inner"><LatexRenderer content={feedback?.text || ""} /></div>
                <div className="flex-1 bg-emerald-50/50 p-10 rounded-[3rem] border-2 border-emerald-100 overflow-y-auto no-scrollbar"><div className="text-slate-600 italic leading-relaxed text-lg"><LatexRenderer content={currentProblem?.explanation || "Không có giải chi tiết."} /></div></div>
                
                <div className="mt-10 p-6 bg-blue-600 text-white rounded-[2rem] shadow-xl animate-pulse flex flex-col items-center gap-2">
                   <div className="text-xs font-black uppercase italic tracking-widest">ĐANG ĐỢI LỆNH TỪ THẦY</div>
                   <div className="text-[10px] font-bold opacity-80 text-center">Thầy sẽ bấm chuyển câu sau khi giảng bài xong...</div>
                </div>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default TeacherEngine;
