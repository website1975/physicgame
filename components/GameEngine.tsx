
import React, { useState, useEffect, useRef, useCallback } from 'react';
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
    startIndex?: number,
    myId?: string
  };
  onExit: () => void;
}

interface OpponentData {
  name: string;
  shortId: string;
  score: number;
}

const GameEngine: React.FC<GameEngineProps> = ({ 
  gameState, setGameState, playerName, currentTeacher, matchData, onExit 
}) => {
  const [currentRoundIdx, setCurrentRoundIdx] = useState(0);
  const [currentProblemIdx, setCurrentProblemIdx] = useState(matchData.startIndex || 0); 
  const [score, setScore] = useState(0);
  const [opponentScores, setOpponentScores] = useState<Record<string, OpponentData>>({});
  const [timeLeft, setTimeLeft] = useState(DEFAULT_TIME);
  const [feedbackTimer, setFeedbackTimer] = useState(FEEDBACK_TIME);
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState<any>(null);
  const [buzzerWinner, setBuzzerWinner] = useState<'YOU' | 'OPPONENT' | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isMaster, setIsMaster] = useState(false);
  const [isPresenceSynced, setIsPresenceSynced] = useState(false);
  
  const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);
  
  const roomCode = matchData.joinedRoom?.code || '';
  const isTeacherRoom = roomCode === 'TEACHER_ROOM';
  const isArenaA = roomCode === 'ARENA_A';

  const myUniqueId = matchData.myId || 'temp_id';
  const myPresenceKey = `${playerName}_${myUniqueId}`;

  const channelRef = useRef<any>(null);
  const controlChannelRef = useRef<any>(null);
  const presenceKey = useRef(myPresenceKey);
  
  const currentProblemIdxRef = useRef(currentProblemIdx);
  const currentRoundIdxRef = useRef(currentRoundIdx);
  const gameStateRef = useRef(gameState);
  const isTransitioning = useRef(false);

  useEffect(() => { currentProblemIdxRef.current = currentProblemIdx; }, [currentProblemIdx]);
  useEffect(() => { currentRoundIdxRef.current = currentRoundIdx; }, [currentRoundIdx]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  const rounds = matchData.rounds;
  const currentProblem = rounds[currentRoundIdx]?.problems[currentProblemIdx];

  const handleNext = useCallback(() => {
    if (isTransitioning.current) return;
    isTransitioning.current = true;

    const nextProb = currentProblemIdxRef.current + 1;
    const currentRound = rounds[currentRoundIdxRef.current];

    if (nextProb < (currentRound?.problems.length || 0)) {
      setCurrentProblemIdx(nextProb);
      startProblem();
    } else if (currentRoundIdxRef.current + 1 < rounds.length) {
      setCurrentRoundIdx(prev => prev + 1);
      setCurrentProblemIdx(0);
      setGameState('ROUND_INTRO');
    } else {
      setGameState('GAME_OVER');
    }

    setTimeout(() => { isTransitioning.current = false; }, 1000);
  }, [rounds]);

  const startProblem = useCallback(() => {
    setUserAnswer('');
    setFeedback(null);
    setBuzzerWinner(null);
    setGameState('STARTING_ROUND');
    setCountdown(3);
    setFeedbackTimer(FEEDBACK_TIME);
    
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev !== null && prev <= 1) {
          clearInterval(interval);
          const nextState = (isArenaA || isTeacherRoom) ? 'ANSWERING' : 'WAITING_FOR_BUZZER';
          setGameState(nextState);
          return null;
        }
        return prev !== null ? prev - 1 : null;
      });
    }, 1000);
  }, [isArenaA, isTeacherRoom, setGameState]);

  useEffect(() => {
    if (gameState === 'ANSWERING' || gameState === 'WAITING_FOR_BUZZER') {
        setTimeLeft(currentProblem?.timeLimit || DEFAULT_TIME);
        if (isArenaA || isTeacherRoom) setBuzzerWinner('YOU');
    }
  }, [gameState, currentProblem?.id, isArenaA, isTeacherRoom]);

  useEffect(() => {
    if (!isArenaA && matchData.joinedRoom && !isTeacherRoom) {
      const channel = supabase.channel(`match_${matchData.joinedRoom.code}_${currentTeacher.id}`, {
        config: { presence: { key: presenceKey.current } }
      });
      
      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const keys = Object.keys(state).sort();
          setIsMaster(keys[0] === presenceKey.current);
          setIsPresenceSynced(true);
        })
        .on('broadcast', { event: 'match_start_problem' }, () => {
          if (gameStateRef.current === 'ROUND_INTRO') startProblem();
        })
        .on('broadcast', { event: 'match_next_question' }, () => {
          handleNext();
        })
        .on('broadcast', { event: 'buzzer_signal' }, ({ payload }) => {
          if (payload.playerId !== myUniqueId && !buzzerWinner && (gameStateRef.current === 'WAITING_FOR_BUZZER' || gameStateRef.current === 'ANSWERING')) {
            setBuzzerWinner('OPPONENT');
            setGameState('ANSWERING');
            setTimeLeft(20);
          }
        })
        .on('broadcast', { event: 'match_result' }, ({ payload }) => {
          if (payload.playerId !== myUniqueId) {
            setOpponentScores(prev => {
              const currentData = prev[payload.playerId] || { name: payload.player, shortId: payload.playerId.slice(-3).toUpperCase(), score: 0 };
              return {
                ...prev,
                [payload.playerId]: {
                  ...currentData,
                  score: currentData.score + (payload.points || 0)
                }
              };
            });
            if (gameStateRef.current !== 'FEEDBACK') {
              setFeedback({ 
                ...payload.feedback, 
                winner: 'OPPONENT', 
                winnerName: `${payload.player} #${payload.playerId.slice(-3).toUpperCase()}` 
              });
              setGameState('FEEDBACK');
              setFeedbackTimer(FEEDBACK_TIME);
            }
          }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ role: 'player', joined_at: new Date().toISOString() });
          }
        });

      channelRef.current = channel;
      return () => { supabase.removeChannel(channel); };
    }
  }, [isArenaA, isTeacherRoom, matchData.joinedRoom, playerName, myUniqueId, handleNext, startProblem]);

  useEffect(() => {
    if (isTeacherRoom) {
      const channel = supabase.channel(`control_TEACHER_ROOM_${currentTeacher.id}`, {
        config: { presence: { key: presenceKey.current } }
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
        .on('broadcast', { event: 'teacher_toggle_whiteboard' }, ({ payload }) => setIsWhiteboardActive(payload.active))
        .on('broadcast', { event: 'teacher_reset_room' }, () => onExit())
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') await channel.track({ role: 'student', online_at: new Date().toISOString() });
        });
      controlChannelRef.current = channel;
      return () => { supabase.removeChannel(channel); };
    }
  }, [isTeacherRoom, currentTeacher.id, handleNext, startProblem, onExit]);

  useEffect(() => {
    if (gameState === 'FEEDBACK') {
      const timer = setInterval(() => setFeedbackTimer(p => (p > 0 ? p - 1 : 0)), 1000);
      return () => clearInterval(timer);
    }
  }, [gameState]);

  useEffect(() => {
    if (gameState === 'FEEDBACK' && feedbackTimer === 0) {
      if (isArenaA) {
        handleNext();
      } else if (!isTeacherRoom) {
        if (isMaster) {
          channelRef.current?.send({ type: 'broadcast', event: 'match_next_question' });
          handleNext();
        } else {
          const safety = setTimeout(() => { if (gameStateRef.current === 'FEEDBACK') handleNext(); }, 2500);
          return () => clearTimeout(safety);
        }
      }
    }
  }, [feedbackTimer, gameState, isArenaA, isMaster, isTeacherRoom, handleNext]);

  useEffect(() => {
    if (gameState === 'ROUND_INTRO') {
      if (isArenaA) {
        const t = setTimeout(startProblem, ROUND_INTRO_TIME * 1000);
        return () => clearTimeout(t);
      } else if (!isTeacherRoom && isPresenceSynced) {
        if (isMaster) {
          const t = setTimeout(() => {
            channelRef.current?.send({ type: 'broadcast', event: 'match_start_problem' });
            startProblem();
          }, ROUND_INTRO_TIME * 1000);
          return () => clearTimeout(t);
        } else {
          const safety = setTimeout(() => {
            if (gameStateRef.current === 'ROUND_INTRO') startProblem();
          }, (ROUND_INTRO_TIME + 2) * 1000);
          return () => clearTimeout(safety);
        }
      }
    }
  }, [gameState, isArenaA, isMaster, isTeacherRoom, isPresenceSynced, startProblem]);

  useEffect(() => {
    if ((gameState === 'WAITING_FOR_BUZZER' || gameState === 'ANSWERING') && timeLeft > 0 && !isWhiteboardActive) {
      const t = setInterval(() => setTimeLeft(p => p - 1), 1000);
      return () => clearInterval(t);
    }
    if (timeLeft === 0 && !isWhiteboardActive) {
      if (gameState === 'ANSWERING' && buzzerWinner === 'YOU') {
        submitAnswer();
      } else if (gameState === 'WAITING_FOR_BUZZER') {
        setFeedback({ isCorrect: false, text: "HẾT GIỜ! KHÔNG AI GIÀNH QUYỀN TRẢ LỜI.", winner: 'NONE' });
        setGameState('FEEDBACK');
        setFeedbackTimer(FEEDBACK_TIME);
      }
    }
  }, [gameState, timeLeft, buzzerWinner, isWhiteboardActive]);

  const handleBuzzerClick = () => {
    if (gameState === 'WAITING_FOR_BUZZER' && !buzzerWinner) {
      channelRef.current?.send({ type: 'broadcast', event: 'buzzer_signal', payload: { player: playerName, playerId: myUniqueId } });
      setBuzzerWinner('YOU');
      setGameState('ANSWERING');
      setTimeLeft(20);
    }
  };

  const submitAnswer = () => {
    const prob = rounds[currentRoundIdxRef.current]?.problems[currentProblemIdxRef.current];
    const correct = (prob?.correctAnswer || "").trim().toUpperCase();
    const user = userAnswer.trim().toUpperCase();
    const isPerfect = user === correct;
    const fb = { isCorrect: isPerfect, text: isPerfect ? "CHÍNH XÁC! BẠN GIÀNH ĐƯỢC ĐIỂM." : `SAI RỒI! Đáp án đúng là: ${correct}`, winner: 'YOU' };
    
    if (isPerfect) setScore(s => s + 100);
    setFeedback(fb);
    setGameState('FEEDBACK');
    setFeedbackTimer(FEEDBACK_TIME);
    
    if (isTeacherRoom) {
        controlChannelRef.current?.send({ type: 'broadcast', event: 'student_answer', payload: { playerName, playerId: myUniqueId, isCorrect: isPerfect } });
    } else {
        channelRef.current?.send({ type: 'broadcast', event: 'match_result', payload: { player: playerName, playerId: myUniqueId, points: isPerfect ? 100 : 0, feedback: fb } });
    }
  };

  if (gameState === 'ROUND_INTRO') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-center p-6">
        <div className="bg-white rounded-[4rem] p-16 shadow-2xl max-w-3xl w-full border-b-[12px] border-blue-600 animate-in zoom-in duration-500">
          <h2 className="text-5xl font-black text-slate-800 uppercase italic mb-6">VÒNG {currentRoundIdx + 1}</h2>
          <p className="text-slate-500 font-bold text-xl italic mb-10">{rounds[currentRoundIdx]?.description}</p>
          <div className="text-blue-600 font-black animate-pulse uppercase tracking-widest text-2xl">Sẵn sàng thi đấu...</div>
          {!isArenaA && !isTeacherRoom && (
            <div className="mt-8 text-[10px] font-black text-slate-500 uppercase italic tracking-widest opacity-50">
              {isMaster ? "Bạn là chủ phòng - Đang đồng bộ..." : "Đang đợi máy chủ đồng bộ..."}
            </div>
          )}
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

      {/* Header Nâng Cấp: Hiển thị điểm số cho nhiều người chơi */}
      <header className="bg-white px-8 py-4 rounded-[2.5rem] shadow-lg mb-4 shrink-0 flex items-center gap-4 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-3 shrink-0">
           <div className="bg-blue-600 text-white px-5 py-2.5 rounded-[1.5rem] shadow-md border-b-4 border-blue-800 flex flex-col items-center min-w-[100px]">
              <div className="text-[8px] font-black uppercase tracking-tighter italic opacity-80 leading-none mb-1">BẠN</div>
              <div className="text-2xl font-black leading-none">{score}đ</div>
           </div>
        </div>

        {!isArenaA && !isTeacherRoom && (
           <div className="flex items-center gap-2 border-l-2 border-slate-100 pl-4 shrink-0">
              {(Object.entries(opponentScores) as [string, OpponentData][]).length > 0 ? (
                 (Object.entries(opponentScores) as [string, OpponentData][]).map(([id, data], index) => (
                    <div key={id} className="bg-slate-900 text-white px-4 py-2.5 rounded-[1.5rem] shadow-md border-b-4 border-slate-800 flex flex-col items-center min-w-[90px] animate-in slide-in-from-left">
                       <div className="text-[7px] font-black uppercase tracking-tighter italic opacity-60 leading-none mb-1">Đ.THỦ {index + 1}</div>
                       <div className="text-xl font-black leading-none">{data.score}đ</div>
                       <div className="text-[6px] font-bold opacity-30 mt-1 uppercase truncate max-w-[60px]">{data.name}</div>
                    </div>
                 ))
              ) : (
                <div className="bg-slate-100 text-slate-300 px-4 py-2.5 rounded-[1.5rem] border-2 border-dashed border-slate-200 flex flex-col items-center min-w-[90px]">
                   <div className="text-[7px] font-black uppercase leading-none mb-1">ĐỐI THỦ</div>
                   <div className="text-xl font-black leading-none">0đ</div>
                </div>
              )}
           </div>
        )}

        <div className="flex-1"></div>

        <div className="flex items-center gap-4 shrink-0">
           <div className="flex flex-col items-center">
             <div className="text-[8px] font-black text-slate-400 uppercase italic mb-0.5">THỜI GIAN</div>
             <div className={`text-4xl font-black italic tabular-nums leading-none ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-slate-900'}`}>{timeLeft}s</div>
           </div>
           
           <div className="flex gap-2">
             {isTeacherRoom && <div className="bg-amber-500 text-white px-4 py-2 rounded-xl font-black text-[9px] uppercase italic border-b-4 border-amber-700 shadow-md flex items-center">LIVE</div>}
             <button onClick={() => setShowExitConfirm(true)} className="w-12 h-12 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center font-black hover:bg-red-500 hover:text-white transition-all shadow-sm">✕</button>
           </div>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0 overflow-hidden">
        <div className="lg:col-span-7 h-full overflow-hidden">
           <ProblemCard problem={currentProblem} isPaused={isWhiteboardActive} />
        </div>
        <div className="lg:col-span-5 bg-white rounded-[3rem] p-8 shadow-xl flex flex-col relative h-full overflow-hidden">
          
          {gameState === 'FEEDBACK' ? (
            <div className="h-full flex flex-col animate-in fade-in zoom-in overflow-hidden">
              <div className="flex justify-between items-center mb-2 shrink-0 px-2">
                 <div className={`text-3xl font-black uppercase italic ${feedback?.isCorrect ? 'text-emerald-500' : 'text-blue-500'}`}>
                    {feedback?.isCorrect ? 'CHÍNH XÁC!' : 'SAI RỒI!'}
                 </div>
                 <div className="bg-slate-900 text-white px-4 py-1.5 rounded-xl font-black italic text-[10px] flex items-center gap-2">
                    <span className="opacity-40 uppercase">{isMaster ? 'MASTER SYNC' : 'ĐỒNG BỘ'}:</span>
                    <span className="text-yellow-400 text-sm">{feedbackTimer}s</span>
                 </div>
              </div>

              <div className="w-full h-1.5 bg-slate-100 rounded-full mb-4 overflow-hidden shrink-0">
                 <div 
                   className="h-full bg-yellow-400 transition-all duration-1000 ease-linear"
                   style={{ width: `${(feedbackTimer / FEEDBACK_TIME) * 100}%` }}
                 />
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 px-2 pb-4">
                 {feedback?.winnerName && (
                    <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 text-[10px] font-black uppercase italic text-blue-600">
                       🔥 {feedback.winnerName} ĐÃ GIÀNH QUYỀN TRẢ LỜI
                    </div>
                 )}
                 <div className="bg-slate-50 p-5 rounded-3xl border-2 border-slate-100 italic text-base font-bold text-slate-700">
                    <LatexRenderer content={feedback?.text || ""} />
                 </div>
                 <div className="bg-emerald-50/50 p-6 rounded-[2rem] border-2 border-emerald-100 mb-4">
                    <h4 className="text-emerald-600 font-black uppercase text-[10px] mb-3 flex items-center gap-2">
                       <span>📖</span> LỜI GIẢI CHI TIẾT
                    </h4>
                    <div className="text-slate-600 font-medium leading-relaxed italic text-sm">
                       <LatexRenderer content={currentProblem?.explanation || "Chưa có lời giải chi tiết cho câu hỏi này."} />
                    </div>
                 </div>
              </div>
            </div>
          ) : gameState === 'WAITING_FOR_BUZZER' ? (
            <div className="h-full flex flex-col items-center justify-center text-center animate-in fade-in px-4">
               <div className="text-5xl mb-4 animate-bounce">🔔</div>
               <h3 className="text-2xl font-black text-slate-800 uppercase italic mb-2">SẴN SÀNG CHƯA?</h3>
               <p className="text-slate-400 font-bold text-[9px] uppercase mb-8 italic tracking-widest">Nhấn chuông để giành quyền trả lời!</p>
               
               <button 
                onClick={handleBuzzerClick}
                className="w-44 h-44 bg-red-600 rounded-full border-[12px] border-red-800 shadow-[0_15px_0_#991b1b,0_25px_50px_rgba(220,38,38,0.3)] hover:scale-105 active:translate-y-3 active:shadow-none transition-all flex items-center justify-center group"
               >
                  <span className="text-white font-black text-2xl uppercase italic group-active:scale-90 transition-transform text-center px-4 leading-tight">GIÀNH<br/>QUYỀN!</span>
               </button>
               <p className="mt-8 text-slate-300 font-black uppercase italic text-[8px] tracking-[0.2em] animate-pulse">NHẤN CHUÔNG ĐỂ MỞ BÀN PHÍM</p>
            </div>
          ) : gameState === 'ANSWERING' && buzzerWinner === 'OPPONENT' ? (
            <div className="h-full flex flex-col items-center justify-center text-center animate-in slide-in-from-right px-4">
               <div className="w-20 h-20 border-6 border-slate-100 border-t-blue-600 rounded-full animate-spin mb-8"></div>
               <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-2xl w-full">
                  <h3 className="text-xl font-black uppercase italic mb-1 text-blue-400">TẠM DỪNG!</h3>
                  <p className="font-bold text-slate-400 italic text-xs leading-relaxed">
                    Đối thủ đang giành quyền trả lời...
                  </p>
               </div>
               <p className="mt-8 text-slate-300 font-black uppercase italic tracking-widest text-[9px] animate-pulse">ĐANG CHỜ KẾT QUẢ ĐỒNG BỘ</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0">
                 <AnswerInput problem={currentProblem} value={userAnswer} onChange={setUserAnswer} onSubmit={submitAnswer} disabled={false} />
              </div>
              <button onClick={submitAnswer} className="w-full py-5 bg-slate-900 text-white rounded-[1.8rem] font-black italic text-lg mt-4 shrink-0 shadow-lg active:scale-95 transition-all border-b-6 border-slate-950">NỘP ĐÁP ÁN ✅</button>
            </div>
          )}
        </div>
      </div>
      <ConfirmModal isOpen={showExitConfirm} title="Dừng trận đấu?" message="Bạn muốn rời khỏi đấu trường ngay bây giờ?" onConfirm={onExit} onCancel={() => setShowExitConfirm(false)} isDestructive={true} />
    </div>
  );
};

export default GameEngine;
