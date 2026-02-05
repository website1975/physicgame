
import React, { useState, useEffect, useRef } from 'react';
import { GameState, Teacher, Round, QuestionType } from '../types';
import ProblemCard from './ProblemCard';
import AnswerInput from './AnswerInput';
import LatexRenderer from './LatexRenderer';
import ConfirmModal from './ConfirmModal';
import { supabase } from '../services/supabaseService';

const DEFAULT_TIME = 40;
const FEEDBACK_TIME = 15;
const ROUND_INTRO_TIME = 5;

interface GameEngineProps {
  gameState: GameState;
  setGameState: (s: GameState) => void;
  playerName: string;
  currentTeacher: Teacher;
  matchData: { setId: string, title: string, rounds: Round[], opponentName?: string, joinedRoom?: any };
  onExit: () => void;
}

const GameEngine: React.FC<GameEngineProps> = ({ 
  gameState, setGameState, playerName, currentTeacher, matchData, onExit 
}) => {
  const [currentRoundIdx, setCurrentRoundIdx] = useState(0);
  const [currentProblemIdx, setCurrentProblemIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(DEFAULT_TIME);
  const [feedbackTimer, setFeedbackTimer] = useState(FEEDBACK_TIME);
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState<any>(null);
  const [buzzerWinner, setBuzzerWinner] = useState<'YOU' | 'OPPONENT' | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const channelRef = useRef<any>(null);
  const isArenaA = matchData.joinedRoom?.code === 'ARENA_A';
  const rounds = matchData.rounds;
  const currentProblem = rounds[currentRoundIdx]?.problems[currentProblemIdx];

  useEffect(() => {
    if (!isArenaA && matchData.joinedRoom) {
      const channel = supabase.channel(`match_${matchData.joinedRoom.code}_${currentTeacher.id}`);
      
      channel
        .on('broadcast', { event: 'buzzer' }, ({ payload }) => {
          if (payload.player !== playerName && !buzzerWinner) {
            setBuzzerWinner('OPPONENT');
            setGameState('ANSWERING');
          }
        })
        .on('broadcast', { event: 'result' }, ({ payload }) => {
          if (payload.player !== playerName) {
            // Cập nhật điểm của đối thủ (người vừa trả lời)
            setOpponentScore(s => s + (payload.points || 0));
            // Nếu đối thủ trả lời sai/không hoàn thiện, mình được nhận điểm trọn vẹn
            if (payload.opponentPoints) {
              setScore(s => s + payload.opponentPoints);
            }
            setFeedback({ ...payload.feedback, winner: 'OPPONENT' });
            setGameState('FEEDBACK');
            setFeedbackTimer(FEEDBACK_TIME);
          }
        })
        .subscribe();

      channelRef.current = channel;
      return () => { supabase.removeChannel(channel); };
    }
  }, [isArenaA, matchData.joinedRoom, playerName]);

  const startProblem = () => {
    if (!currentProblem) return;
    setBuzzerWinner(isArenaA ? 'YOU' : null);
    setUserAnswer('');
    setFeedback(null);
    setGameState('STARTING_ROUND');
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev && prev <= 1) {
          clearInterval(interval);
          setGameState(isArenaA ? 'ANSWERING' : 'WAITING_FOR_BUZZER');
          setTimeLeft(currentProblem?.timeLimit || DEFAULT_TIME);
          return null;
        }
        return prev ? prev - 1 : null;
      });
    }, 1000);
  };

  const handleNext = () => {
    const nextProb = currentProblemIdx + 1;
    if (nextProb < (rounds[currentRoundIdx]?.problems.length || 0)) {
      setCurrentProblemIdx(nextProb);
      startProblem();
    } else if (currentRoundIdx + 1 < rounds.length) {
      setCurrentRoundIdx(prev => prev + 1);
      setCurrentProblemIdx(0);
      setGameState('ROUND_INTRO');
    } else {
      setGameState('GAME_OVER');
    }
  };

  useEffect(() => {
    if (gameState === 'ROUND_INTRO') {
      const timer = setTimeout(startProblem, ROUND_INTRO_TIME * 1000);
      return () => clearTimeout(timer);
    }
    if (gameState === 'FEEDBACK') {
      const countdownInterval = setInterval(() => {
        setFeedbackTimer(p => Math.max(0, p - 1));
      }, 1000);
      const nextTimeout = setTimeout(handleNext, FEEDBACK_TIME * 1000);
      return () => {
        clearInterval(countdownInterval);
        clearTimeout(nextTimeout);
      };
    }
  }, [gameState]);

  useEffect(() => {
    if ((gameState === 'WAITING_FOR_BUZZER' || gameState === 'ANSWERING') && timeLeft > 0) {
      const t = setInterval(() => setTimeLeft(p => p - 1), 1000);
      return () => clearInterval(t);
    }
    if (timeLeft === 0 && gameState === 'ANSWERING' && buzzerWinner === 'YOU') {
      submitAnswer();
    }
  }, [gameState, timeLeft]);

  const handleBuzzer = () => {
    if (gameState !== 'WAITING_FOR_BUZZER' || buzzerWinner) return;
    
    setBuzzerWinner('YOU');
    setGameState('ANSWERING');
    
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'buzzer',
        payload: { player: playerName }
      });
    }
  };

  const submitAnswer = () => {
    const type = currentProblem?.type;
    const correct = (currentProblem?.correctAnswer || "").trim().toUpperCase();
    const user = userAnswer.replace(/\s/g, '').toUpperCase(); // Loại bỏ khoảng trắng để so sánh chuẩn
    
    let maxPoints = 100;
    let earnedPoints = 0;

    if (type === QuestionType.TRUE_FALSE) {
      maxPoints = 400;
      // Đáp án chuẩn có 4 ký tự, VD: ĐSĐĐ
      const correctArr = correct.split('');
      const userArr = user.padEnd(4, ' ').split(''); // Đảm bảo đủ 4 ký tự
      
      let matches = 0;
      for (let i = 0; i < 4; i++) {
        if (userArr[i] === correctArr[i]) {
          matches++;
        }
      }
      earnedPoints = matches * 100;
    } else {
      maxPoints = 100;
      earnedPoints = (user === correct) ? 100 : 0;
    }

    const isPerfect = earnedPoints === maxPoints;
    const ptsForMe = earnedPoints;
    // Nếu không hoàn thiện (sai ít nhất 1 ý) và là thi đối kháng, đối thủ nhận trọn vẹn điểm tối đa
    const ptsForOpponent = (!isPerfect && !isArenaA) ? maxPoints : 0;

    const fb = { 
      isCorrect: isPerfect, 
      text: isPerfect 
        ? `CHÍNH XÁC HOÀN TOÀN! Bạn ghi ${ptsForMe}đ.` 
        : (ptsForOpponent > 0 
            ? `TRẢ LỜI SAI/CHƯA ĐỦ! Bạn nhận ${ptsForMe}đ, nhưng ${matchData.opponentName} được tặng trọn vẹn ${maxPoints}đ!` 
            : `CHƯA CHÍNH XÁC! Bạn ghi được ${ptsForMe}đ.`),
      winner: 'YOU',
      earnedPoints: ptsForMe,
      maxPoints: maxPoints
    };
    
    setScore(s => s + ptsForMe);
    if (ptsForOpponent > 0) {
      setOpponentScore(s => s + ptsForOpponent);
    }

    setFeedback(fb);
    setGameState('FEEDBACK');
    setFeedbackTimer(FEEDBACK_TIME);
    
    if (channelRef.current) {
      channelRef.current.send({ 
        type: 'broadcast', 
        event: 'result', 
        payload: { 
          player: playerName, 
          points: ptsForMe, 
          opponentPoints: ptsForOpponent, // Gửi để bên kia cộng điểm cho chính họ
          feedback: fb 
        } 
      });
    }
  };

  if (gameState === 'ROUND_INTRO') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-center p-6">
        <div className="bg-white rounded-[4rem] p-16 shadow-2xl max-w-3xl w-full border-b-[12px] border-blue-600 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-slate-100"><div className="h-full bg-blue-600 animate-[loading_5s_linear_infinite]"></div></div>
          <div className="text-8xl mb-8">🏆</div>
          <h2 className="text-5xl font-black text-slate-800 uppercase italic mb-6">VÒNG {currentRoundIdx + 1}</h2>
          <p className="text-slate-500 font-bold text-xl italic mb-10">{rounds[currentRoundIdx]?.description}</p>
          <div className="text-blue-600 font-black uppercase italic text-xs animate-pulse">Đang chuẩn bị đấu trường...</div>
        </div>
      </div>
    );
  }

  if (gameState === 'STARTING_ROUND') {
    return <div className="fixed inset-0 bg-slate-950 flex items-center justify-center z-[9999]"><div className="text-[20rem] font-black italic text-white animate-ping">{countdown}</div></div>;
  }

  if (gameState === 'GAME_OVER') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 text-center">
         <div className="bg-white rounded-[4rem] p-16 shadow-2xl max-w-2xl w-full border-b-[12px] border-emerald-500">
            <div className="text-[8rem] mb-6">👑</div>
            <h2 className="text-6xl font-black text-slate-800 uppercase italic mb-10 tracking-tighter">HOÀN THÀNH!</h2>
            <div className="flex justify-center gap-12 mb-10 bg-slate-50 p-10 rounded-[3rem]">
               <div className="flex flex-col"><span className="text-blue-500 font-black text-xs uppercase">BẠN</span><div className="text-6xl font-black text-slate-900">{score}</div></div>
               {matchData.opponentName && <div className="flex flex-col"><span className="text-red-500 font-black text-xs uppercase">{matchData.opponentName}</span><div className="text-6xl font-black text-slate-900">{opponentScore}</div></div>}
            </div>
            <button onClick={onExit} className="w-full py-6 bg-slate-900 text-white font-black rounded-[2rem] uppercase italic text-2xl shadow-xl hover:scale-105 transition-all">THOÁT RA</button>
         </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col p-4 overflow-hidden">
      <ConfirmModal 
        isOpen={showExitConfirm}
        title="Dừng trận đấu?"
        message="Bạn muốn rời khỏi đấu trường ngay bây giờ?"
        onConfirm={onExit}
        onCancel={() => setShowExitConfirm(false)}
        isDestructive={true}
      />

      <header className="flex justify-between items-center bg-white p-6 rounded-[2.5rem] shadow-lg mb-4">
        <div className="flex items-center gap-10">
           <div className="text-center"><div className="text-[10px] font-black text-blue-500 uppercase">BẠN</div><div className="text-3xl font-black text-slate-800 italic">{score}đ</div></div>
           {matchData.opponentName && <><div className="text-2xl font-black text-slate-100 italic">VS</div><div className="text-center"><div className="text-[10px] font-black text-red-500 uppercase">{matchData.opponentName}</div><div className="text-3xl font-black text-slate-800 italic">{opponentScore}đ</div></div></>}
        </div>
        <div className="text-6xl font-black italic text-slate-900 w-24 text-center">{timeLeft}s</div>
        <button onClick={() => setShowExitConfirm(true)} className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center font-black hover:bg-red-500 hover:text-white transition-all">✕</button>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
        <div className="lg:col-span-7"><ProblemCard problem={currentProblem} /></div>
        <div className="lg:col-span-5 bg-white rounded-[3rem] p-8 shadow-xl flex flex-col relative">
          {gameState === 'FEEDBACK' ? (
            <div className="h-full flex flex-col animate-in fade-in zoom-in duration-300">
              <div className="flex justify-between items-center mb-6">
                 <div className={`text-4xl font-black uppercase italic ${feedback?.isCorrect ? 'text-emerald-500' : 'text-blue-500'}`}>
                    {feedback?.winner === 'YOU' ? (feedback?.isCorrect ? 'CHÍNH XÁC!' : 'SAI RỒI!') : `${matchData.opponentName?.toUpperCase()} ĐÃ ĐÁP`}
                 </div>
                 <div className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2 rounded-2xl font-black italic text-sm">
                    KẾ TIẾP: <span className="text-yellow-400 w-6 text-center">{feedbackTimer}s</span>
                 </div>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar space-y-6">
                 <div className="bg-slate-50 p-6 rounded-3xl border-2 border-slate-100 italic text-lg font-bold">
                   <LatexRenderer content={feedback?.text || ""} />
                 </div>
                 <div className="bg-emerald-50/50 p-8 rounded-[2.5rem] border-2 border-emerald-100 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-bl-full flex items-center justify-center text-4xl">💡</div>
                    <h4 className="text-emerald-600 font-black uppercase text-xs mb-4">Lời giải chi tiết</h4>
                    <div className="text-sm md:text-base text-slate-600 font-medium leading-relaxed italic">
                       <LatexRenderer content={currentProblem?.explanation || "Chưa có lời giải cụ thể."} />
                    </div>
                 </div>
              </div>

              <div className="mt-8">
                 <div className="flex justify-between text-[10px] font-black text-slate-300 uppercase italic mb-2 tracking-widest">
                    <span>Chuẩn bị câu hỏi kế tiếp...</span>
                    <span>{Math.round((feedbackTimer / FEEDBACK_TIME) * 100)}%</span>
                 </div>
                 <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden border-2 border-slate-50">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-1000" 
                      style={{ width: `${(feedbackTimer / FEEDBACK_TIME) * 100}%` }}
                    />
                 </div>
              </div>
            </div>
          ) : gameState === 'WAITING_FOR_BUZZER' ? (
            <div className="flex-1 flex items-center justify-center">
              <button 
                onClick={handleBuzzer} 
                className="w-64 h-64 bg-red-600 rounded-full border-[20px] border-red-800 shadow-2xl text-white font-black text-4xl italic hover:scale-110 active:scale-95 transition-all animate-bounce"
              >
                BẤM CHUÔNG!
              </button>
            </div>
          ) : buzzerWinner === 'YOU' ? (
            <div className="flex-1 flex flex-col">
              <AnswerInput problem={currentProblem} value={userAnswer} onChange={setUserAnswer} onSubmit={submitAnswer} disabled={false} />
              <button onClick={submitAnswer} className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black italic text-xl mt-4 border-b-8 border-slate-800 active:translate-y-1 transition-all">NỘP ĐÁP ÁN ✅</button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center animate-pulse">
              <div className="text-9xl mb-10 grayscale">👤</div>
              <h3 className="text-3xl font-black text-red-600 uppercase italic">{matchData.opponentName} ĐANG TRẢ LỜI...</h3>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameEngine;
