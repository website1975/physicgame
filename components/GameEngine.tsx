
import React, { useState, useEffect, useRef } from 'react';
import { GameState, Teacher, Round, QuestionType } from '../types';
import ProblemCard from './ProblemCard';
import AnswerInput from './AnswerInput';
import Whiteboard from './Whiteboard';
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
  matchData: { 
    setId: string, 
    title: string, 
    rounds: Round[], 
    opponentName?: string, 
    joinedRoom?: any,
    startIndex?: number 
  };
  onExit: () => void;
}

const GameEngine: React.FC<GameEngineProps> = ({ 
  gameState, setGameState, playerName, currentTeacher, matchData, onExit 
}) => {
  const [currentRoundIdx, setCurrentRoundIdx] = useState(0);
  const [currentProblemIdx, setCurrentProblemIdx] = useState(matchData.startIndex || 0); 
  const [score, setScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(DEFAULT_TIME);
  const [feedbackTimer, setFeedbackTimer] = useState(FEEDBACK_TIME);
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState<any>(null);
  const [buzzerWinner, setBuzzerWinner] = useState<'YOU' | 'OPPONENT' | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  
  const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);
  const isTeacherRoom = matchData.joinedRoom?.code === 'TEACHER_ROOM';
  const isArenaA = matchData.joinedRoom?.code === 'ARENA_A';

  const channelRef = useRef<any>(null);
  const controlChannelRef = useRef<any>(null);
  const rounds = matchData.rounds;
  const currentProblem = rounds[currentRoundIdx]?.problems[currentProblemIdx];

  useEffect(() => {
    startProblem();
  }, []);

  // Kênh điều khiển cho phòng Giáo Viên
  useEffect(() => {
    if (isTeacherRoom) {
      const channel = supabase.channel(`control_TEACHER_ROOM_${currentTeacher.id}`, {
        config: { presence: { key: `${playerName}_${Math.random().toString(36).substring(7)}` } }
      });

      channel
        .on('broadcast', { event: 'teacher_next_question' }, ({ payload }) => {
          if (payload && typeof payload.nextIndex === 'number') {
             setCurrentProblemIdx(payload.nextIndex);
             startProblem();
          } else {
             handleNext();
          }
        })
        .on('broadcast', { event: 'teacher_toggle_whiteboard' }, ({ payload }) => {
          setIsWhiteboardActive(payload.active);
        })
        .on('broadcast', { event: 'teacher_reset_room' }, () => {
          onExit();
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ role: 'student', online_at: new Date().toISOString() });
          }
        });

      controlChannelRef.current = channel;
      return () => { supabase.removeChannel(channel); };
    }
  }, [isTeacherRoom, currentTeacher.id, playerName]);

  // Kênh thi đấu cho Arena (Đấu đối kháng)
  useEffect(() => {
    if (!isArenaA && matchData.joinedRoom && !isTeacherRoom) {
      // Sử dụng mã phòng + ID GV để tạo kênh riêng biệt cho trận đấu
      const channel = supabase.channel(`match_${matchData.joinedRoom.code}_${currentTeacher.id}`);
      
      channel
        .on('broadcast', { event: 'buzzer_signal' }, ({ payload }) => {
          if (payload.player !== playerName && !buzzerWinner && gameState === 'WAITING_FOR_BUZZER') {
            setBuzzerWinner('OPPONENT');
            setGameState('ANSWERING');
            setTimeLeft(20); // Đối thủ có 20s để trả lời khi bấm chuông
          }
        })
        .on('broadcast', { event: 'match_result' }, ({ payload }) => {
          if (payload.player !== playerName) {
            setOpponentScore(s => s + (payload.points || 0));
            setFeedback({ ...payload.feedback, winner: 'OPPONENT' });
            setGameState('FEEDBACK');
            setFeedbackTimer(FEEDBACK_TIME);
          }
        })
        .subscribe();

      channelRef.current = channel;
      return () => { supabase.removeChannel(channel); };
    }
  }, [isArenaA, isTeacherRoom, matchData.joinedRoom, playerName, gameState]);

  const startProblem = () => {
    setUserAnswer('');
    setFeedback(null);
    setBuzzerWinner(null);
    setGameState('STARTING_ROUND');
    setCountdown(3);
    
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev && prev <= 1) {
          clearInterval(interval);
          const nextState = (isArenaA || isTeacherRoom) ? 'ANSWERING' : 'WAITING_FOR_BUZZER';
          setGameState(nextState);
          setTimeLeft(currentProblem?.timeLimit || DEFAULT_TIME); 
          if (isArenaA || isTeacherRoom) setBuzzerWinner('YOU');
          return null;
        }
        return prev ? prev - 1 : null;
      });
    }, 1000);
  };

  const handleBuzzerClick = () => {
    if (gameState !== 'WAITING_FOR_BUZZER' || buzzerWinner) return;
    
    setBuzzerWinner('YOU');
    setGameState('ANSWERING');
    setTimeLeft(20); // Có 20s để giải sau khi bấm chuông

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'buzzer_signal',
        payload: { player: playerName }
      });
    }
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

  // Đếm ngược Feedback 15s và tự động qua câu
  useEffect(() => {
    if (gameState === 'ROUND_INTRO') {
      const timer = setTimeout(startProblem, ROUND_INTRO_TIME * 1000);
      return () => clearTimeout(timer);
    }
    
    if (gameState === 'FEEDBACK') {
      const countdownInterval = setInterval(() => {
        setFeedbackTimer(p => {
          if (p <= 1) {
            clearInterval(countdownInterval);
            // Nếu là phòng GV thì đợi GV điều khiển, còn Arena thì tự nhảy
            if (!isTeacherRoom) handleNext();
            return 0;
          }
          return p - 1;
        });
      }, 1000);
      return () => clearInterval(countdownInterval);
    }
  }, [gameState, isTeacherRoom]);

  // Đếm ngược thời gian làm bài
  useEffect(() => {
    if ((gameState === 'WAITING_FOR_BUZZER' || gameState === 'ANSWERING') && timeLeft > 0) {
      const t = setInterval(() => setTimeLeft(p => p - 1), 1000);
      return () => clearInterval(t);
    }
    
    if (timeLeft === 0) {
      if (gameState === 'ANSWERING' && buzzerWinner === 'YOU') {
        submitAnswer();
      } else if (gameState === 'WAITING_FOR_BUZZER') {
        // Hết giờ mà không ai bấm chuông
        setFeedback({ isCorrect: false, text: "HẾT GIỜ! KHÔNG AI GIÀNH QUYỀN TRẢ LỜI.", winner: 'NONE' });
        setGameState('FEEDBACK');
        setFeedbackTimer(FEEDBACK_TIME);
      }
    }
  }, [gameState, timeLeft, buzzerWinner]);

  const submitAnswer = () => {
    const prob = rounds[currentRoundIdx]?.problems[currentProblemIdx];
    const correct = (prob?.correctAnswer || "").trim().toUpperCase();
    const user = userAnswer.trim().toUpperCase();
    const isPerfect = user === correct;
    
    const fb = { 
      isCorrect: isPerfect, 
      text: isPerfect ? "CHÍNH XÁC! BẠN GIÀNH ĐƯỢC ĐIỂM." : `SAI RỒI! Đáp án đúng là: ${correct}`, 
      winner: 'YOU' 
    };
    
    if (isPerfect) setScore(s => s + 100);
    setFeedback(fb);
    setGameState('FEEDBACK');
    setFeedbackTimer(FEEDBACK_TIME);
    
    if (isTeacherRoom && controlChannelRef.current) {
        controlChannelRef.current.send({
            type: 'broadcast',
            event: 'student_answer',
            payload: { playerName, isCorrect: isPerfect }
        });
    }

    if (channelRef.current && !isTeacherRoom) {
      channelRef.current.send({ 
        type: 'broadcast', 
        event: 'match_result', 
        payload: { player: playerName, points: isPerfect ? 100 : 0, feedback: fb } 
      });
    }
  };

  if (gameState === 'ROUND_INTRO') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-center p-6">
        <div className="bg-white rounded-[4rem] p-16 shadow-2xl max-w-3xl w-full border-b-[12px] border-blue-600">
          <h2 className="text-5xl font-black text-slate-800 uppercase italic mb-6">VÒNG {currentRoundIdx + 1}</h2>
          <p className="text-slate-500 font-bold text-xl italic mb-10">{rounds[currentRoundIdx]?.description}</p>
          <div className="text-blue-600 font-black animate-pulse uppercase tracking-widest">Sẵn sàng thi đấu...</div>
        </div>
      </div>
    );
  }

  if (gameState === 'STARTING_ROUND') {
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center z-[9999]">
        <div className="text-[15rem] font-black text-white animate-ping drop-shadow-[0_0_50px_rgba(255,255,255,0.3)]">{countdown}</div>
      </div>
    );
  }

  if (gameState === 'GAME_OVER') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
         <div className="bg-white rounded-[4rem] p-16 shadow-2xl max-w-2xl w-full text-center border-b-[12px] border-emerald-500">
            <h2 className="text-6xl font-black text-slate-800 uppercase italic mb-10">HOÀN THÀNH!</h2>
            <div className="bg-slate-50 p-10 rounded-[3rem] mb-10">
               <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">TỔNG ĐIỂM CHIẾN BINH</div>
               <div className="text-8xl font-black text-slate-900">{score}đ</div>
            </div>
            <button onClick={onExit} className="w-full py-6 bg-slate-900 text-white font-black rounded-[2rem] uppercase italic text-2xl shadow-xl hover:scale-105 active:scale-95 transition-all">THOÁT RA SẢNH</button>
         </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col p-4 overflow-hidden relative">
      {isWhiteboardActive && (
        <div className="fixed inset-0 z-[10000] p-4 md:p-8 bg-slate-950/98 backdrop-blur-3xl animate-in zoom-in flex flex-col items-center justify-center">
          <div className="w-full h-full max-w-[95vw] max-h-[90vh] relative shadow-[0_0_100px_rgba(0,0,0,0.5)]">
             <Whiteboard isTeacher={false} channel={controlChannelRef.current} roomCode="TEACHER_ROOM" />
          </div>
        </div>
      )}

      <header className="flex justify-between items-center bg-white p-6 rounded-[2.5rem] shadow-lg mb-4 shrink-0">
        <div className="flex items-center gap-10">
           <div className="text-center">
              <div className="text-[10px] font-black text-blue-500 uppercase italic">BẠN</div>
              <div className="text-3xl font-black text-slate-800 italic leading-none">{score}đ</div>
           </div>
           {!isArenaA && !isTeacherRoom && (
              <div className="text-center border-l-4 border-slate-100 pl-10">
                 <div className="text-[10px] font-black text-red-500 uppercase italic">ĐỐI THỦ</div>
                 <div className="text-3xl font-black text-slate-800 italic leading-none">{opponentScore}đ</div>
              </div>
           )}
        </div>
        <div className="text-6xl font-black italic text-slate-900 w-24 text-center">{timeLeft}s</div>
        <div className="flex gap-4">
           {isTeacherRoom && <div className="bg-amber-100 text-amber-600 px-6 py-4 rounded-2xl font-black text-[10px] uppercase italic border border-amber-200">PHÒNG LIVE</div>}
           <button onClick={() => setShowExitConfirm(true)} className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center font-black hover:bg-red-500 hover:text-white transition-all shadow-sm">✕</button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0 overflow-hidden">
        <div className="lg:col-span-7 h-full overflow-hidden">
           <ProblemCard problem={currentProblem} isPaused={isWhiteboardActive} />
        </div>
        <div className="lg:col-span-5 bg-white rounded-[3rem] p-8 shadow-xl flex flex-col relative h-full overflow-hidden">
          
          {/* TRẠNG THÁI 1: FEEDBACK KHI TRẢ LỜI XONG */}
          {gameState === 'FEEDBACK' ? (
            <div className="h-full flex flex-col animate-in fade-in zoom-in overflow-hidden">
              <div className="flex justify-between items-center mb-6 shrink-0">
                 <div className={`text-4xl font-black uppercase italic ${feedback?.isCorrect ? 'text-emerald-500' : 'text-blue-500'}`}>
                    {feedback?.isCorrect ? 'CHÍNH XÁC!' : 'SAI RỒI!'}
                 </div>
                 <div className="bg-slate-900 text-white px-5 py-2 rounded-2xl font-black italic text-[10px] flex items-center gap-3">
                    <span className="opacity-40 uppercase">KẾ TIẾP SAU:</span>
                    <span className="text-yellow-400 text-base">{feedbackTimer}s</span>
                 </div>
              </div>
              <div className="flex-1 overflow-y-auto no-scrollbar space-y-6">
                 <div className="bg-slate-50 p-6 rounded-3xl border-2 border-slate-100 italic text-lg font-bold">
                    <LatexRenderer content={feedback?.text || ""} />
                 </div>
                 <div className="bg-emerald-50/50 p-8 rounded-[2.5rem] border-2 border-emerald-100">
                    <h4 className="text-emerald-600 font-black uppercase text-xs mb-4 flex items-center gap-2">
                       <span>📖</span> LỜI GIẢI CHI TIẾT
                    </h4>
                    <div className="text-slate-600 font-medium leading-relaxed italic">
                       <LatexRenderer content={currentProblem?.explanation || "Chưa có lời giải chi tiết cho câu hỏi này."} />
                    </div>
                 </div>
              </div>
            </div>
          ) : gameState === 'WAITING_FOR_BUZZER' ? (
            /* TRẠNG THÁI 2: ĐỢI BẤM CHUÔNG GIÀNH QUYỀN */
            <div className="h-full flex flex-col items-center justify-center text-center animate-in fade-in">
               <div className="text-[10rem] mb-6 animate-bounce">🔔</div>
               <h3 className="text-3xl font-black text-slate-800 uppercase italic mb-4">SẴN SÀNG CHƯA?</h3>
               <p className="text-slate-400 font-bold text-xs uppercase mb-12 italic">Nhấn chuông ngay khi bạn có câu trả lời!</p>
               
               <button 
                onClick={handleBuzzerClick}
                className="w-64 h-64 bg-red-600 rounded-full border-[15px] border-red-800 shadow-[0_20px_0_#991b1b,0_40px_60px_rgba(220,38,38,0.3)] hover:scale-105 active:translate-y-4 active:shadow-none transition-all flex items-center justify-center group"
               >
                  <span className="text-white font-black text-4xl uppercase italic group-active:scale-90 transition-transform">BẤM CHUÔNG!</span>
               </button>
            </div>
          ) : gameState === 'ANSWERING' && buzzerWinner === 'OPPONENT' ? (
            /* TRẠNG THÁI 3: ĐỐI THỦ ĐÃ GIÀNH QUYỀN - TẠM DỪNG */
            <div className="h-full flex flex-col items-center justify-center text-center animate-in slide-in-from-right">
               <div className="w-32 h-32 border-8 border-slate-100 border-t-blue-600 rounded-full animate-spin mb-10"></div>
               <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl">
                  <h3 className="text-2xl font-black uppercase italic mb-2 text-blue-400">TẠM DỪNG!</h3>
                  <p className="font-bold text-slate-400 italic text-sm">{matchData.opponentName || 'Đối thủ'} đang giành quyền trả lời...</p>
               </div>
               <p className="mt-12 text-slate-300 font-black uppercase italic tracking-widest text-[10px] animate-pulse">Vui lòng đợi kết quả lượt thi đấu này</p>
            </div>
          ) : (
            /* TRẠNG THÁI 4: ĐANG TRẢ LỜI (DÀNH CHO NGƯỜI GIÀNH ĐƯỢC CHUÔNG) */
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0">
                 <AnswerInput problem={currentProblem} value={userAnswer} onChange={setUserAnswer} onSubmit={submitAnswer} disabled={false} />
              </div>
              <button onClick={submitAnswer} className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black italic text-xl mt-4 shrink-0 shadow-lg active:scale-95 transition-all border-b-8 border-slate-950">NỘP ĐÁP ÁN ✅</button>
            </div>
          )}
        </div>
      </div>
      <ConfirmModal isOpen={showExitConfirm} title="Dừng trận đấu?" message="Bạn muốn rời khỏi đấu trường ngay bây giờ?" onConfirm={onExit} onCancel={() => setShowExitConfirm(false)} isDestructive={true} />
    </div>
  );
};

export default GameEngine;
