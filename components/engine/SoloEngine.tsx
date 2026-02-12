
import React, { useState, useEffect } from 'react';
import { GameState, Round, MatchData } from '../../types';
import ProblemCard from '../ProblemCard';
import AnswerInput from '../AnswerInput';
import LatexRenderer from '../LatexRenderer';
import ConfirmModal from '../ConfirmModal';

const FEEDBACK_TIME = 15;
const INTRO_TIME = 10; 

interface SoloEngineProps {
  gameState: GameState;
  setGameState: (s: GameState) => void;
  matchData: MatchData;
  onExit: () => void;
}

const SoloEngine: React.FC<SoloEngineProps> = ({ gameState, setGameState, matchData, onExit }) => {
  const [currentRoundIdx, setCurrentRoundIdx] = useState(0);
  const [currentProblemIdx, setCurrentProblemIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(40);
  const [feedbackTimer, setFeedbackTimer] = useState(FEEDBACK_TIME);
  const [introTimer, setIntroTimer] = useState(INTRO_TIME);
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState<any>(null);
  const [isHelpUsed, setIsHelpUsed] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showHelpConfirm, setShowHelpConfirm] = useState(false);

  const rounds = matchData.rounds;
  const currentRound = rounds[currentRoundIdx];
  const currentProblem = currentRound?.problems[currentProblemIdx];

  useEffect(() => {
    let t: any;
    if (gameState === 'ROUND_INTRO') {
      setIntroTimer(INTRO_TIME);
      t = setInterval(() => {
        setIntroTimer(p => {
          if (p <= 1) {
            clearInterval(t);
            setGameState('ANSWERING');
            return 0;
          }
          return p - 1;
        });
      }, 1000);
    }
    return () => { if (t) clearInterval(t); };
  }, [gameState, currentRoundIdx]);

  useEffect(() => {
    if (currentProblem && gameState === 'ANSWERING') {
      if (timeLeft === 0) {
         setTimeLeft(currentProblem.timeLimit || 40);
      }
      setUserAnswer('');
      setFeedback(null);
      setIsHelpUsed(false);
      setFeedbackTimer(FEEDBACK_TIME);
    }
  }, [currentRoundIdx, currentProblemIdx, currentProblem?.id, gameState]);

  useEffect(() => {
    if (gameState === 'ANSWERING' && timeLeft > 0) {
      const t = setInterval(() => setTimeLeft(p => p - 1), 1000);
      return () => clearInterval(t);
    } else if (timeLeft === 0 && gameState === 'ANSWERING') {
      submitAnswer();
    }
  }, [gameState, timeLeft]);

  useEffect(() => {
    let t: any;
    if (gameState === 'FEEDBACK') {
      t = setInterval(() => {
        setFeedbackTimer(p => {
          if (p <= 1) {
            clearInterval(t);
            nextQuestion();
            return FEEDBACK_TIME;
          }
          return p - 1;
        });
      }, 1000);
    }
    return () => { if (t) clearInterval(t); };
  }, [gameState]);

  const submitAnswer = () => {
    const correct = (currentProblem?.correctAnswer || "").trim().toUpperCase();
    const isPerfect = userAnswer.trim().toUpperCase() === correct;
    
    // Logic tính điểm theo yêu cầu mới
    let points = isPerfect 
      ? (isHelpUsed ? 60 : 100) 
      : (isHelpUsed ? -40 : 0);
    
    setScore(s => s + points);
    setFeedback({ 
      isCorrect: isPerfect, 
      text: isPerfect ? `CHÍNH XÁC! (+${points}đ)` : `SAI RỒI! (${points}đ). Đáp án là: ${correct}` 
    });
    setGameState('FEEDBACK');
  };

  const nextQuestion = () => {
    let nextProbIdx = currentProblemIdx;
    let nextRoundIdx = currentRoundIdx;
    let nextGameState: GameState = 'ANSWERING';

    if (currentProblemIdx + 1 < (rounds[currentRoundIdx]?.problems?.length || 0)) {
      nextProbIdx = currentProblemIdx + 1;
    } else if (currentRoundIdx + 1 < rounds.length) {
      nextProbIdx = 0;
      nextRoundIdx = currentRoundIdx + 1;
      nextGameState = 'ROUND_INTRO';
    } else {
      setGameState('GAME_OVER');
      return;
    }

    const nextProblem = rounds[nextRoundIdx].problems[nextProbIdx];
    setTimeLeft(nextProblem.timeLimit || 40); 
    
    setCurrentRoundIdx(nextRoundIdx);
    setCurrentProblemIdx(nextProbIdx);
    setUserAnswer('');
    setFeedback(null);
    setIsHelpUsed(false);
    setGameState(nextGameState);
  };

  if (gameState === 'ROUND_INTRO') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-900/20 to-transparent pointer-events-none" />
        <div className="relative z-10 animate-in zoom-in duration-500">
          <div className="text-9xl mb-12 animate-bounce flex justify-center gap-4">
             <span className="inline-block transform -rotate-12">⚔️</span>
          </div>
          <h1 className="text-6xl font-black text-white italic uppercase tracking-tighter mb-4 drop-shadow-2xl">
            VÒNG {currentRound?.number || currentRoundIdx + 1}
          </h1>
          <div className="max-w-2xl mx-auto mb-16">
            <p className="text-blue-400 font-bold uppercase text-xs tracking-[0.4em] mb-6 italic">Chuẩn bị bước vào trận chiến</p>
            <div className="bg-white/5 backdrop-blur-sm border-2 border-white/10 p-10 rounded-[3rem] shadow-2xl">
               <div className="text-2xl text-slate-300 font-medium italic leading-relaxed">
                  <LatexRenderer content={currentRound?.description || "Chào mừng bạn đến với thử thách tiếp theo!"} />
               </div>
            </div>
          </div>
          <div className="flex flex-col items-center gap-6">
             <div className="text-4xl font-black text-blue-500 italic tabular-nums">
                {introTimer}s
             </div>
             <div className="w-64 h-2 bg-slate-900 rounded-full overflow-hidden border border-white/10">
                <div 
                  className="h-full bg-blue-600 transition-all duration-1000 ease-linear"
                  style={{ width: `${(introTimer / INTRO_TIME) * 100}%` }}
                />
             </div>
             <button 
               onClick={() => {
                 const prob = rounds[currentRoundIdx].problems[0];
                 setTimeLeft(prob.timeLimit || 40);
                 setGameState('ANSWERING');
               }}
               className="mt-4 px-10 py-4 bg-white text-slate-900 rounded-2xl font-black uppercase italic text-sm hover:scale-105 transition-all shadow-xl"
             >
               Bắt đầu ngay ⚡
             </button>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'GAME_OVER') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-md w-full text-center border-b-[15px] border-blue-600 animate-in zoom-in">
          <div className="text-8xl mb-6">🏆</div>
          <h2 className="text-3xl font-black uppercase italic mb-4">HOÀN THÀNH!</h2>
          <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mb-10 italic">Tổng điểm Arena của bạn</p>
          <div className="text-7xl font-black text-blue-600 mb-12 drop-shadow-lg">{score}đ</div>
          <button onClick={onExit} className="w-full py-6 bg-slate-900 text-white rounded-3xl font-black uppercase italic shadow-xl hover:scale-105 active:scale-95 transition-all">Quay về sảnh</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col p-4">
      <ConfirmModal isOpen={showHelpConfirm} title="Sử dụng trợ giúp?" message="Các rào cản sẽ biến mất. Điểm sẽ thay đổi: Đúng +60đ, Sai -40đ. Bạn đồng ý?" onConfirm={() => { setIsHelpUsed(true); setShowHelpConfirm(false); }} onCancel={() => setShowHelpConfirm(false)} />
      <ConfirmModal isOpen={showExitConfirm} title="Dừng cuộc chơi?" message="Kết quả hiện tại sẽ không được lưu nếu bạn thoát bây giờ!" onConfirm={onExit} onCancel={() => setShowExitConfirm(false)} isDestructive />

      <header className="bg-white px-10 py-6 rounded-full shadow-lg mb-6 flex justify-between items-center border-b-8 border-slate-200/50">
        <div className="flex items-center gap-4">
           <div className="bg-blue-600 text-white px-8 py-2.5 rounded-full font-black italic shadow-lg">{score}đ</div>
           <div className="text-[10px] font-black text-slate-300 uppercase italic tracking-widest hidden md:block">
              Vòng {currentRoundIdx + 1} / {rounds.length}
           </div>
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
           <button 
             onClick={() => setShowExitConfirm(true)} 
             className="w-12 h-12 bg-[#FFEBEE] text-[#FF5252] rounded-[1.2rem] shadow-sm flex items-center justify-center hover:scale-110 active:scale-90 transition-all"
           >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
              </svg>
           </button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 min-h-0">
        <div className="lg:col-span-7 h-full">
           <ProblemCard problem={currentProblem} isHelpUsed={isHelpUsed} />
        </div>
        
        <div className="lg:col-span-5 bg-white rounded-[3.5rem] p-10 shadow-2xl flex flex-col border-4 border-slate-50 relative overflow-hidden">
           {gameState === 'ANSWERING' ? (
             <div className="flex flex-col h-full animate-in zoom-in duration-300">
                <div className="flex justify-between items-center mb-8">
                   <h3 className="text-sm font-black text-slate-400 uppercase italic tracking-widest">Khu vực phản ứng:</h3>
                   {!isHelpUsed && (
                     <button 
                       onClick={() => setShowHelpConfirm(true)} 
                       className="bg-amber-100 text-amber-600 px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase italic border-b-4 border-amber-200 hover:scale-105 active:translate-y-1 transition-all"
                     >
                       Kích hoạt trợ giúp 💡
                     </button>
                   )}
                </div>
                
                <div className="flex-1 overflow-y-auto no-scrollbar">
                   <AnswerInput 
                     problem={currentProblem} 
                     value={userAnswer} 
                     onChange={setUserAnswer} 
                     onSubmit={submitAnswer} 
                     disabled={false} 
                   />
                </div>

                <button 
                  onClick={submitAnswer} 
                  disabled={!userAnswer} 
                  className={`w-full py-7 rounded-[2rem] font-black italic text-2xl mt-8 shadow-2xl border-b-[10px] transition-all active:translate-y-2 active:border-b-0
                    ${userAnswer 
                      ? 'bg-blue-600 text-white border-blue-800' 
                      : 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed'}`}
                >
                  XÁC NHẬN ĐÁP ÁN ✅
                </button>
             </div>
           ) : (
             <div className="flex flex-col h-full animate-in slide-in-from-right duration-500">
                <div className={`text-4xl font-black uppercase italic mb-6 ${feedback?.isCorrect ? 'text-emerald-500' : 'text-rose-500'}`}>
                   {feedback?.isCorrect ? '✨ TUYỆT VỜI!' : '💥 RẤT TIẾC!'}
                </div>
                
                <div className="bg-slate-50 p-8 rounded-[2.5rem] border-2 border-slate-100 italic font-bold text-slate-700 mb-8 shadow-inner">
                   <LatexRenderer content={feedback?.text || ""} />
                </div>

                <div className="flex-1 bg-emerald-50/50 p-10 rounded-[3rem] border-2 border-emerald-100 overflow-y-auto no-scrollbar relative">
                   <div className="absolute top-4 right-8 opacity-10 text-6xl">📖</div>
                   <h4 className="text-emerald-600 font-black uppercase text-[10px] mb-4 tracking-widest italic">Phân tích chuyên sâu:</h4>
                   <div className="text-slate-600 italic leading-relaxed text-lg">
                      <LatexRenderer content={currentProblem?.explanation || "Không có lời giải chi tiết cho câu hỏi này."} />
                   </div>
                </div>

                <div className="mt-10 space-y-3">
                   <div className="flex justify-between items-center px-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase italic">Tự động chuyển câu sau:</span>
                      <span className="text-xl font-black text-blue-600 italic tabular-nums">{feedbackTimer}s</span>
                   </div>
                   <div className="h-4 bg-slate-100 rounded-full overflow-hidden border-2 border-white shadow-inner">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-400 to-indigo-600 transition-all duration-1000 ease-linear" 
                        style={{ width: `${(feedbackTimer / FEEDBACK_TIME) * 100}%` }}
                      ></div>
                   </div>
                   <button 
                     onClick={nextQuestion} 
                     className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase italic text-xs mt-2 hover:bg-blue-600 transition-colors"
                   >
                     Tiếp theo ngay ⏩
                   </button>
                </div>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default SoloEngine;
