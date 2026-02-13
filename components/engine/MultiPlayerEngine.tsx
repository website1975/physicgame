
import React, { useState, useEffect, useRef } from 'react';
import { GameState, Teacher, MatchData } from '../../types';
import ProblemCard from '../ProblemCard';
import AnswerInput from '../AnswerInput';
import LatexRenderer from '../LatexRenderer';
import ConfirmModal from '../ConfirmModal';
import { supabase } from '../../services/supabaseService';

const INTRO_TIME = 10;
const FEEDBACK_TIME = 15;

interface MultiPlayerEngineProps {
  gameState: GameState;
  setGameState: (s: GameState) => void;
  playerName: string;
  currentTeacher: Teacher;
  matchData: MatchData;
  onExit: () => void;
}

const MultiPlayerEngine: React.FC<MultiPlayerEngineProps> = ({ gameState, setGameState, playerName, currentTeacher, matchData, onExit }) => {
  const [currentRoundIdx, setCurrentRoundIdx] = useState(0);
  const [currentProblemIdx, setCurrentProblemIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [opponentScores, setOpponentScores] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState(40);
  const [introTimer, setIntroTimer] = useState(INTRO_TIME);
  const [feedbackTimer, setFeedbackTimer] = useState(FEEDBACK_TIME);
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState<any>(null);
  const [buzzerWinner, setBuzzerWinner] = useState<string | null>(null);
  const [isHelpUsed, setIsHelpUsed] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showHelpConfirm, setShowHelpConfirm] = useState(false);
  
  const rounds = matchData.rounds;
  const currentRound = rounds[currentRoundIdx];
  const currentProblem = currentRound?.problems[currentProblemIdx];
  const myId = matchData.myId || 'temp';

  const channelRef = useRef<any>(null);

  const stateRef = useRef({
    gameState,
    currentRoundIdx,
    currentProblemIdx,
    buzzerWinner,
    myId
  });

  useEffect(() => {
    stateRef.current = { gameState, currentRoundIdx, currentProblemIdx, buzzerWinner, myId };
  }, [gameState, currentRoundIdx, currentProblemIdx, buzzerWinner, myId]);

  useEffect(() => {
    const channelName = `match_${matchData.joinedRoom.code}_${currentTeacher.id}`;
    const channel = supabase.channel(channelName);

    channel
      .on('broadcast', { event: 'buzzer_signal' }, ({ payload }) => {
        if (!stateRef.current.buzzerWinner) {
          setBuzzerWinner(payload.playerId);
          setGameState('ANSWERING');
        }
      })
      .on('broadcast', { event: 'sync_start_answering' }, () => {
        if (stateRef.current.gameState === 'ROUND_INTRO') {
           setGameState('WAITING_FOR_BUZZER');
        }
      })
      .on('broadcast', { event: 'match_result' }, ({ payload }) => {
        if (payload.playerId !== stateRef.current.myId) {
          const oppName = matchData.opponents?.find(o => o.id === payload.playerId)?.name || "ĐỐI THỦ";
          setOpponentScores(prev => ({ ...prev, [payload.playerId]: (prev[payload.playerId] || 0) + payload.points }));
          const currentProb = rounds[stateRef.current.currentRoundIdx]?.problems[stateRef.current.currentProblemIdx];
          setFeedback({ 
            isCorrect: payload.isCorrect, 
            text: `${oppName} đã trả lời ${payload.isCorrect ? 'Đúng' : 'Sai'}. Đáp án: ${currentProb?.correctAnswer}` 
          });
          setGameState('FEEDBACK');
        }
      })
      .on('broadcast', { event: 'sync_next' }, ({ payload }) => {
        setCurrentRoundIdx(payload.roundIdx);
        setCurrentProblemIdx(payload.probIdx);
        setBuzzerWinner(null);
        setFeedback(null);
        setUserAnswer('');
        setIsHelpUsed(false);
        setTimeLeft(payload.timeLimit || 40);
        setGameState(payload.nextState || 'WAITING_FOR_BUZZER');
      })
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [matchData.joinedRoom.code, currentTeacher.id, matchData.opponents]);

  useEffect(() => {
    let t: any;
    if (gameState === 'ROUND_INTRO') {
      setIntroTimer(INTRO_TIME);
      t = setInterval(() => {
        setIntroTimer(p => {
          if (p <= 1) {
            clearInterval(t);
            triggerStartAnswering();
            return 0;
          }
          return p - 1;
        });
      }, 1000);
    }
    return () => { if (t) clearInterval(t); };
  }, [gameState, currentRoundIdx]);

  useEffect(() => {
    let t: any;
    if (gameState === 'FEEDBACK') {
      setFeedbackTimer(FEEDBACK_TIME);
      t = setInterval(() => {
        setFeedbackTimer(p => {
          if (p <= 1) {
            clearInterval(t);
            handleNextSync(); 
            return 0;
          }
          return p - 1;
        });
      }, 1000);
    }
    return () => { if (t) clearInterval(t); };
  }, [gameState]);

  useEffect(() => {
    if ((gameState === 'WAITING_FOR_BUZZER' || gameState === 'ANSWERING') && timeLeft > 0) {
      const t = setInterval(() => setTimeLeft(p => p - 1), 1000);
      return () => clearInterval(t);
    } else if (timeLeft === 0 && (gameState === 'WAITING_FOR_BUZZER' || gameState === 'ANSWERING')) {
      if (gameState === 'ANSWERING' && buzzerWinner === myId) {
         submitAnswer();
      } else if (gameState === 'WAITING_FOR_BUZZER') {
         setFeedback({ isCorrect: false, text: "HẾT GIỜ! Chưa ai giành chuông." });
         setGameState('FEEDBACK');
      }
    }
  }, [gameState, timeLeft]);

  const triggerStartAnswering = () => {
    if (gameState !== 'ROUND_INTRO') return;
    channelRef.current?.send({ type: 'broadcast', event: 'sync_start_answering', payload: {} });
    setGameState('WAITING_FOR_BUZZER');
  };

  const handleBuzzer = () => {
    if (!buzzerWinner && gameState === 'WAITING_FOR_BUZZER' && channelRef.current) {
      channelRef.current.send({ type: 'broadcast', event: 'buzzer_signal', payload: { playerId: myId } });
      setBuzzerWinner(myId);
      setGameState('ANSWERING');
    }
  };

  const submitAnswer = () => {
    const correct = (currentProblem?.correctAnswer || "").trim().toUpperCase();
    const isPerfect = userAnswer.trim().toUpperCase() === correct;
    
    // Logic tính điểm theo yêu cầu trợ giúp
    const points = isPerfect 
      ? (isHelpUsed ? 60 : 100) 
      : (isHelpUsed ? -40 : -50);
    
    setScore(s => s + points);
    setFeedback({ 
      isCorrect: isPerfect, 
      text: isPerfect 
        ? `CHÍNH XÁC! (+${points}đ)` 
        : `SAI RỒI! (${points}đ). Đáp án là: ${correct}` 
    });
    setGameState('FEEDBACK');
    
    channelRef.current?.send({ type: 'broadcast', event: 'match_result', payload: { playerId: myId, points, isCorrect: isPerfect } });
  };

  const handleNextSync = () => {
    if (gameState !== 'FEEDBACK') return;

    let nextP = currentProblemIdx + 1;
    let nextR = currentRoundIdx;
    let nextState: GameState = 'WAITING_FOR_BUZZER';

    if (nextP >= (rounds[nextR]?.problems?.length || 0)) {
      nextP = 0;
      nextR++;
      nextState = 'ROUND_INTRO';
    }

    if (nextR < rounds.length) {
      const nextProb = rounds[nextR].problems[nextP];
      channelRef.current?.send({ 
        type: 'broadcast', 
        event: 'sync_next', 
        payload: { roundIdx: nextR, probIdx: nextP, nextState, timeLimit: nextProb.timeLimit || 40 } 
      });
      
      setCurrentRoundIdx(nextR);
      setCurrentProblemIdx(nextP);
      setBuzzerWinner(null);
      setFeedback(null);
      setUserAnswer('');
      setIsHelpUsed(false);
      setTimeLeft(nextProb.timeLimit || 40);
      setGameState(nextState);
    } else {
      setGameState('GAME_OVER');
    }
  };

  if (gameState === 'ROUND_INTRO') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-purple-900/20 to-transparent pointer-events-none" />
        <div className="relative z-10 animate-in zoom-in duration-500">
          <div className="text-9xl mb-12 flex justify-center gap-12">
             <span className="inline-block transform -rotate-45 animate-bounce">⚔️</span>
             <span className="inline-block transform rotate-45 animate-bounce [animation-delay:200ms]">⚔️</span>
          </div>
          <h1 className="text-6xl font-black text-white italic uppercase tracking-tighter mb-4 drop-shadow-2xl">VÒNG {currentRound?.number || currentRoundIdx + 1}</h1>
          <div className="max-w-2xl mx-auto mb-16">
            <p className="text-purple-400 font-bold uppercase text-xs tracking-[0.4em] mb-6 italic">Chuẩn bị giành quyền trả lời</p>
            <div className="bg-white/5 backdrop-blur-sm border-2 border-white/10 p-10 rounded-[3rem] shadow-2xl">
               <div className="text-2xl text-slate-300 font-medium italic leading-relaxed">
                  <LatexRenderer content={currentRound?.description || "Hãy tập trung để giành chuông sớm nhất!"} />
               </div>
            </div>
          </div>
          <div className="flex flex-col items-center gap-6">
             <div className="text-4xl font-black text-purple-500 italic tabular-nums">{introTimer}s</div>
             <div className="w-64 h-2 bg-slate-900 rounded-full overflow-hidden border border-white/10">
                <div className="h-full bg-purple-600 transition-all duration-1000 ease-linear" style={{ width: `${(introTimer / INTRO_TIME) * 100}%` }} />
             </div>
             <button onClick={triggerStartAnswering} className="mt-4 px-10 py-4 bg-white text-slate-900 rounded-2xl font-black uppercase italic text-sm hover:scale-105 transition-all shadow-xl">Bắt đầu ngay ⚡</button>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'GAME_OVER') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-md w-full text-center border-b-[15px] border-purple-600 animate-in zoom-in">
          <div className="text-8xl mb-6">🏆</div>
          <h2 className="text-3xl font-black uppercase italic mb-4">KẾT THÚC!</h2>
          <div className="space-y-4 mb-10">
             <div className="flex justify-between items-center p-4 bg-blue-50 rounded-2xl">
                <span className="font-black italic text-slate-400 text-[10px] uppercase">BẠN:</span>
                <span className="text-3xl font-black text-blue-600">{score}đ</span>
             </div>
             {Object.entries(opponentScores).map(([id, s]) => {
               const oppName = matchData.opponents?.find(o => o.id === id)?.name || "ĐỐI THỦ";
               return (
                 <div key={id} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                    <span className="font-black italic text-slate-400 text-[10px] uppercase">{oppName}:</span>
                    <span className="text-3xl font-black text-slate-700">{s}đ</span>
                 </div>
               );
             })}
          </div>
          <button onClick={onExit} className="w-full py-6 bg-slate-900 text-white rounded-3xl font-black uppercase italic shadow-xl hover:scale-105 transition-all">Quay về sảnh</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col p-4">
      <ConfirmModal isOpen={showHelpConfirm} title="Sử dụng trợ giúp?" message="Rào cản sẽ biến mất. Điểm sẽ thay đổi: Đúng +60đ, Sai -40đ. Bạn đồng ý?" onConfirm={() => { setIsHelpUsed(true); setShowHelpConfirm(false); }} onCancel={() => setShowHelpConfirm(false)} />
      <ConfirmModal isOpen={showExitConfirm} title="Thoát trận đấu?" message="Bạn sẽ bị coi là thua cuộc nếu thoát bây giờ!" onConfirm={onExit} onCancel={() => setShowExitConfirm(false)} isDestructive />

      <header className="bg-white px-10 py-6 rounded-full shadow-lg mb-6 flex justify-between items-center border-b-8 border-slate-200/50">
        <div className="flex items-center gap-4">
           <div className="bg-blue-600 text-white px-8 py-2.5 rounded-full font-black italic shadow-lg">BẠN: {score}đ</div>
           {Object.entries(opponentScores).map(([id, s]) => {
             const oppName = matchData.opponents?.find(o => o.id === id)?.name || "ĐỐI THỦ";
             return (
               <div key={id} className="bg-slate-800 text-white px-6 py-2.5 rounded-full font-black italic shadow-md hidden sm:block">
                 {oppName}: {s}đ
               </div>
             );
           })}
        </div>
        
        <div className="flex items-center gap-8">
           <div className="flex items-center gap-3">
              <span className="text-blue-600 text-4xl font-['Caveat']">Time :</span>
              <div className="flex items-baseline">
                <span className={`text-5xl font-black italic tabular-nums leading-none ${timeLeft <= 5 ? 'text-rose-500 animate-pulse' : 'text-slate-900'}`}>
                   {timeLeft}
                </span>
                <span className="text-xl font-bold ml-1 text-slate-900 italic">s</span>
              </div>
           </div>
           <button onClick={() => setShowExitConfirm(true)} className="w-12 h-12 bg-[#FFEBEE] text-[#FF5252] rounded-[1.2rem] shadow-sm flex items-center justify-center hover:scale-110 active:scale-90 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
              </svg>
           </button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 min-h-0">
        <div className="lg:col-span-7 h-full">
           <ProblemCard problem={currentProblem} isHelpUsed={isHelpUsed} isPaused={gameState !== 'WAITING_FOR_BUZZER' && gameState !== 'ANSWERING'} />
        </div>
        
        <div className="lg:col-span-5 bg-white rounded-[3.5rem] p-10 shadow-2xl flex flex-col border-4 border-slate-50 relative overflow-hidden items-center justify-center">
           {gameState === 'WAITING_FOR_BUZZER' ? (
             <div className="flex flex-col items-center animate-in zoom-in duration-300 w-full">
                <div 
                  className="text-[12rem] mb-12 animate-swing cursor-pointer hover:scale-110 transition-transform active:scale-90 drop-shadow-2xl" 
                  onClick={handleBuzzer}
                >
                   🔔
                </div>
                <h3 className="text-2xl font-black text-slate-400 uppercase italic tracking-widest mb-10 text-center">Giành quyền nhanh nhất!</h3>
                <button 
                  onClick={handleBuzzer}
                  className="w-full py-10 bg-red-600 text-white rounded-[3rem] font-black text-4xl italic shadow-[0_15px_0_rgb(153,27,27)] hover:shadow-[0_10px_0_rgb(153,27,27)] active:shadow-none active:translate-y-4 transition-all uppercase tracking-tighter"
                >
                  GIÀNH QUYỀN! 🎯
                </button>
             </div>
           ) : gameState === 'ANSWERING' ? (
             <div className="flex flex-col h-full w-full animate-in slide-in-from-bottom-10 duration-500">
                {buzzerWinner === myId ? (
                   <>
                     <div className="flex justify-between items-center mb-8 bg-blue-50 p-4 rounded-3xl border-2 border-blue-100">
                        <div className="bg-blue-600 text-white px-6 py-2 rounded-2xl font-black uppercase italic text-[10px] shadow-md">
                           ⚡ QUYỀN CỦA BẠN
                        </div>
                        {!isHelpUsed && (
                          <button 
                            onClick={() => setShowHelpConfirm(true)} 
                            className="bg-amber-100 text-amber-600 px-6 py-2 rounded-2xl font-black text-[10px] uppercase italic border-b-4 border-amber-200 hover:scale-105 active:translate-y-1 active:border-b-0 transition-all"
                          >
                            Dùng trợ giúp 💡
                          </button>
                        )}
                     </div>
                     <div className="flex-1 overflow-y-auto no-scrollbar">
                        <AnswerInput problem={currentProblem} value={userAnswer} onChange={setUserAnswer} onSubmit={submitAnswer} disabled={false} />
                     </div>
                     <button 
                       onClick={submitAnswer} 
                       disabled={!userAnswer} 
                       className={`w-full py-7 rounded-[2rem] font-black italic text-2xl mt-8 shadow-2xl border-b-[10px] transition-all active:translate-y-2 active:border-b-0
                         ${userAnswer ? 'bg-blue-600 text-white border-blue-800' : 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed'}`}
                     >
                       XÁC NHẬN ĐÁP ÁN ✅
                     </button>
                   </>
                ) : (
                   <div className="flex flex-col items-center justify-center h-full">
                      <div className="text-[10rem] mb-8 grayscale opacity-20">📡</div>
                      <p className="text-3xl font-black text-slate-400 uppercase italic text-center leading-tight">
                        {(matchData.opponents?.find(o => o.id === buzzerWinner)?.name || "ĐỐI THỦ").toUpperCase()} ĐÃ NHANH TAY HƠN!<br/>
                        <span className="text-sm tracking-widest opacity-50 block mt-4 font-bold">Vui lòng đợi kết quả...</span>
                      </p>
                      <div className="mt-12 w-64 h-3 bg-slate-100 rounded-full overflow-hidden border-2 border-white shadow-inner">
                         <div className="h-full bg-blue-500 animate-loading"></div>
                      </div>
                   </div>
                )}
             </div>
           ) : (
             <div className="flex flex-col h-full w-full animate-in slide-in-from-right duration-500">
                <div className={`text-4xl font-black uppercase italic mb-6 ${feedback?.isCorrect ? 'text-emerald-500' : 'text-rose-500'}`}>
                   {feedback?.isCorrect ? '✨ CHÍNH XÁC!' : '💥 RẤT TIẾC!'}
                </div>
                
                <div className="bg-slate-50 p-8 rounded-[2.5rem] border-2 border-slate-100 italic font-bold text-slate-700 mb-8 shadow-inner">
                   <LatexRenderer content={feedback?.text || ""} />
                </div>

                <div className="flex-1 bg-emerald-50/50 p-10 rounded-[3rem] border-2 border-emerald-100 overflow-y-auto no-scrollbar">
                   <h4 className="text-emerald-600 font-black uppercase text-[10px] mb-4 tracking-widest italic">Phân tích chuyên sâu:</h4>
                   <div className="text-slate-600 italic leading-relaxed text-lg">
                      <LatexRenderer content={currentProblem?.explanation || "Không có lời giải chi tiết."} />
                   </div>
                </div>

                <div className="mt-10 space-y-3 w-full">
                   <div className="flex justify-between items-center px-4">
                      <span className="text-[10px] font-black text-slate-400 uppercase italic">Tự động chuyển câu sau:</span>
                      <span className="text-2xl font-black text-blue-600 italic tabular-nums">{feedbackTimer}s</span>
                   </div>
                   <div className="h-6 bg-slate-100 rounded-full overflow-hidden border-4 border-white shadow-inner">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-400 to-indigo-600 transition-all duration-1000 ease-linear" 
                        style={{ width: `${(feedbackTimer / FEEDBACK_TIME) * 100}%` }}
                      ></div>
                   </div>
                </div>
             </div>
           )}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes swing {
          0% { transform: rotate(0deg); }
          10% { transform: rotate(20deg); }
          20% { transform: rotate(-20deg); }
          30% { transform: rotate(15deg); }
          40% { transform: rotate(-15deg); }
          50% { transform: rotate(0deg); }
          100% { transform: rotate(0deg); }
        }
        .animate-swing {
          animation: swing 2s ease-in-out infinite;
          transform-origin: top center;
        }
        .animate-loading {
          animation: loading 2s infinite ease-in-out;
        }
      `}} />
    </div>
  );
};

export default MultiPlayerEngine;
