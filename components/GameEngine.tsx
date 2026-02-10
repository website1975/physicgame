
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, Teacher, Round, QuestionType, DisplayChallenge, MatchData } from '../types';
import ProblemCard from './ProblemCard';
import AnswerInput from './AnswerInput';
import Whiteboard from './Whiteboard';
import LatexRenderer from './LatexRenderer';
import ConfirmModal from './ConfirmModal';
import { supabase } from '../services/supabaseService';

const DEFAULT_TIME = 40;
const FEEDBACK_TIME = 15;
const ROUND_INTRO_TIME = 10; 

interface GameEngineProps {
  gameState: GameState;
  setGameState: (s: GameState) => void;
  playerName: string;
  currentTeacher: Teacher;
  matchData: MatchData;
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
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showHelpConfirm, setShowHelpConfirm] = useState(false);
  const [isMaster, setIsMaster] = useState(false);
  const [isPresenceSynced, setIsPresenceSynced] = useState(false);
  const [isHelpUsed, setIsHelpUsed] = useState(false); 
  const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);
  
  const roomCode = matchData.joinedRoom?.code || '';
  const isTeacherRoom = roomCode === 'TEACHER_ROOM';
  const isArenaA = roomCode === 'ARENA_A';
  const myUniqueId = matchData.myId || 'temp_id';
  const myPresenceKey = `${playerName}_${myUniqueId}`;

  const channelRef = useRef<any>(null);
  const gameStateRef = useRef(gameState);
  const isTransitioning = useRef(false);

  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  const rounds = matchData.rounds;
  const currentRound = rounds[currentRoundIdx];
  const currentProblem = currentRound?.problems[currentProblemIdx];

  const handleNext = useCallback((syncTime?: number) => {
    if (isTransitioning.current) return;
    isTransitioning.current = true;
    
    const nextProb = currentProblemIdx + 1;
    if (nextProb < (currentRound?.problems.length || 0)) {
      setCurrentProblemIdx(nextProb);
      startProblemSync(syncTime);
    } else if (currentRoundIdx + 1 < rounds.length) {
      setCurrentRoundIdx(prev => prev + 1);
      setCurrentProblemIdx(0);
      setGameState('ROUND_INTRO');
    } else {
      setGameState('GAME_OVER');
    }
    setTimeout(() => { isTransitioning.current = false; }, 1000);
  }, [rounds, currentRound, currentRoundIdx, currentProblemIdx, setGameState]);

  const startProblemSync = useCallback((syncTime?: number) => {
    setUserAnswer(''); setFeedback(null); setBuzzerWinner(null); setIsHelpUsed(false);
    const delay = syncTime ? Math.max(0, syncTime - Date.now()) : 0;
    
    setTimeout(() => {
      setGameState('STARTING_ROUND');
      let count = 3;
      const interval = setInterval(() => {
        count--;
        if (count <= 0) {
          clearInterval(interval);
          setGameState((isArenaA || isTeacherRoom) ? 'ANSWERING' : 'WAITING_FOR_BUZZER');
        }
      }, 1000);
    }, delay);
  }, [isArenaA, isTeacherRoom, setGameState]);

  useEffect(() => {
    if (!isArenaA && matchData.joinedRoom && !isTeacherRoom) {
      const channel = supabase.channel(`match_${matchData.joinedRoom.code}_${currentTeacher.id}`, {
        config: { presence: { key: myPresenceKey } }
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const keys = Object.keys(state).sort();
          setIsMaster(keys[0] === myPresenceKey);
          setIsPresenceSynced(true);
        })
        .on('broadcast', { event: 'sync_phase' }, ({ payload }) => {
           if (payload.phase === 'ROUND_INTRO') {
              setCurrentRoundIdx(payload.roundIdx);
              setCurrentProblemIdx(0);
              setGameState('ROUND_INTRO');
           } else if (payload.phase === 'START_PROBLEM') {
              startProblemSync(payload.syncTime);
           } else if (payload.phase === 'NEXT_QUESTION') {
              handleNext(payload.syncTime);
           }
        })
        .on('broadcast', { event: 'buzzer_signal' }, ({ payload }) => {
          if (payload.playerId !== myUniqueId && !buzzerWinner && (gameStateRef.current === 'WAITING_FOR_BUZZER')) {
            setBuzzerWinner('OPPONENT');
            setGameState('ANSWERING');
            setTimeLeft(20);
          }
        })
        .on('broadcast', { event: 'match_result' }, ({ payload }) => {
          if (payload.playerId !== myUniqueId) {
            setOpponentScores(prev => ({ ...prev, [payload.playerId]: { ...prev[payload.playerId], score: (prev[payload.playerId]?.score || 0) + (payload.points || 0) } }));
            setFeedback({ ...payload.feedback, winner: 'OPPONENT', winnerName: payload.player });
            setGameState('FEEDBACK');
            setFeedbackTimer(FEEDBACK_TIME);
          }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') await channel.track({ role: 'player' });
        });

      channelRef.current = channel;
      return () => { supabase.removeChannel(channel); };
    }
  }, [isArenaA, isTeacherRoom, matchData.joinedRoom, myPresenceKey, myUniqueId, handleNext, startProblemSync, buzzerWinner]);

  useEffect(() => {
    if (gameState === 'ROUND_INTRO') {
       if (isMaster || isArenaA) {
          setTimeout(() => {
             const syncTime = Date.now() + 1500;
             if (isMaster) channelRef.current?.send({ type: 'broadcast', event: 'sync_phase', payload: { phase: 'START_PROBLEM', syncTime } });
             startProblemSync(syncTime);
          }, ROUND_INTRO_TIME * 1000);
       }
    }
  }, [gameState, isMaster, isArenaA, startProblemSync]);

  useEffect(() => {
    if (gameState === 'FEEDBACK') {
      const timer = setInterval(() => setFeedbackTimer(p => (p > 0 ? p - 1 : 0)), 1000);
      if (feedbackTimer === 0) {
        clearInterval(timer);
        if (isMaster || isArenaA) {
          const syncTime = Date.now() + 1500;
          if (isMaster) channelRef.current?.send({ type: 'broadcast', event: 'sync_phase', payload: { phase: 'NEXT_QUESTION', syncTime } });
          handleNext(syncTime);
        }
      }
      return () => clearInterval(timer);
    }
  }, [gameState, feedbackTimer, isMaster, isArenaA, handleNext]);

  useEffect(() => {
    if ((gameState === 'WAITING_FOR_BUZZER' || gameState === 'ANSWERING') && timeLeft > 0 && !isWhiteboardActive) {
      const t = setInterval(() => setTimeLeft(p => p - 1), 1000);
      return () => clearInterval(t);
    }
    if (timeLeft === 0 && !isWhiteboardActive) {
      if (gameState === 'ANSWERING' && buzzerWinner === 'YOU') submitAnswer();
      else if (gameState === 'WAITING_FOR_BUZZER' && (isMaster || isArenaA)) {
         setFeedback({ isCorrect: false, text: "HẾT GIỜ! KHÔNG AI GIÀNH QUYỀN.", winner: 'NONE' });
         setGameState('FEEDBACK');
         setFeedbackTimer(FEEDBACK_TIME);
      }
    }
  }, [gameState, timeLeft, buzzerWinner, isWhiteboardActive]);

  const submitAnswer = () => {
    const correct = (currentProblem?.correctAnswer || "").trim().toUpperCase();
    const isPerfect = userAnswer.trim().toUpperCase() === correct;
    const points = isPerfect ? (isHelpUsed ? 60 : 100) : 0;
    const fb = { isCorrect: isPerfect, text: isPerfect ? `CHÍNH XÁC! (+${points}đ)` : `SAI RỒI! Đáp án: ${correct}`, winner: 'YOU' };
    
    if (isPerfect) setScore(s => s + points);
    setFeedback(fb); setGameState('FEEDBACK'); setFeedbackTimer(FEEDBACK_TIME);
    
    channelRef.current?.send({ type: 'broadcast', event: 'match_result', payload: { player: playerName, playerId: myUniqueId, points, feedback: fb } });
  };

  if (gameState === 'GAME_OVER') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
        <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-2xl w-full border-b-[12px] border-blue-600">
          <div className="text-8xl mb-8">🏆</div>
          <h2 className="text-4xl font-black text-slate-800 uppercase italic mb-8">KẾT THÚC TRẬN</h2>
          <div className="text-6xl font-black text-blue-600 italic mb-12">{score}đ</div>
          <button onClick={onExit} className="w-full py-6 bg-slate-900 text-white rounded-3xl font-black uppercase italic text-xl shadow-xl">RỜI ARENA 🚪</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-100 flex flex-col p-3 overflow-hidden relative text-left">
      <ConfirmModal isOpen={showHelpConfirm} title="Sử dụng Trợ giúp?" message="Bạn chỉ nhận được tối đa 60% số điểm nếu trả lời đúng!" onConfirm={() => { setIsHelpUsed(true); setShowHelpConfirm(false); }} onCancel={() => setShowHelpConfirm(false)} />
      
      <header className="bg-white px-5 py-3 rounded-[2rem] shadow-md mb-3 flex items-center justify-between border-b-4 border-slate-200 relative z-50 shrink-0">
        <div className="flex items-center gap-3">
           <div className="bg-blue-600 text-white px-5 py-2 rounded-[1.5rem] shadow-sm border-b-4 border-blue-800 flex flex-col items-center">
              <div className="text-[8px] font-black uppercase italic opacity-80 leading-none mb-1">BẠN</div>
              <div className="text-xl font-black leading-none">{score}đ</div>
           </div>
           {(gameState === 'WAITING_FOR_BUZZER' || gameState === 'ANSWERING') && currentProblem?.challenge !== DisplayChallenge.NORMAL && !isHelpUsed && (
             <button onClick={() => setShowHelpConfirm(true)} className="px-4 py-2 bg-emerald-100 text-emerald-600 rounded-xl font-black uppercase italic text-[10px] border-b-2 border-emerald-200 hover:bg-emerald-500 hover:text-white transition-all">💡 Trợ giúp</button>
           )}
        </div>
        <div className="flex flex-col items-center">
           <div className="text-[8px] font-black text-slate-400 uppercase italic mb-0.5">TIME</div>
           <div className={`text-3xl font-black italic tabular-nums leading-none ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-slate-900'}`}>{timeLeft}s</div>
        </div>
        <button onClick={() => setShowExitConfirm(true)} className="w-10 h-10 bg-red-50 text-red-500 rounded-xl flex items-center justify-center font-black">✕</button>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0 overflow-hidden">
        <div className="lg:col-span-7 h-full min-h-0">
          {gameState === 'ROUND_INTRO' ? (
            <div className="h-full bg-white rounded-[2.5rem] p-8 shadow-inner flex flex-col items-center justify-center text-center animate-in zoom-in">
               <div className="text-7xl mb-6 animate-bounce">⚔️</div>
               <h2 className="text-4xl font-black text-slate-800 uppercase italic mb-4">VÒNG {currentRound?.number}</h2>
               <div className="bg-slate-50 p-6 rounded-[2rem] border-4 border-slate-100 max-w-xl">
                 <p className="text-slate-600 font-bold text-lg italic uppercase tracking-widest leading-relaxed">
                   {currentRound?.description || "Hãy sẵn sàng cho thử thách tiếp theo!"}
                 </p>
               </div>
            </div>
          ) : (
            <ProblemCard problem={currentProblem} isPaused={isWhiteboardActive} isHelpUsed={isHelpUsed} />
          )}
        </div>

        <div className="lg:col-span-5 bg-white rounded-[2.5rem] p-6 shadow-xl flex flex-col h-full overflow-hidden relative min-h-0">
          {gameState === 'ROUND_INTRO' ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
               <div className="text-xl font-black text-blue-600 uppercase italic mb-4">ĐANG ĐỒNG BỘ...</div>
               <div className="w-16 h-16 border-6 border-slate-100 border-t-blue-600 rounded-full animate-spin"></div>
            </div>
          ) : gameState === 'WAITING_FOR_BUZZER' ? (
            <div className="h-full flex flex-col items-center justify-center text-center animate-in fade-in">
               <div className="text-4xl mb-4 animate-bounce">🔔</div>
               <h3 className="text-2xl font-black text-slate-800 uppercase italic mb-8">NHẤN CHUÔNG GIÀNH QUYỀN</h3>
               <button 
                onClick={() => {
                  if (!buzzerWinner) {
                    channelRef.current?.send({ type: 'broadcast', event: 'buzzer_signal', payload: { playerId: myUniqueId, player: playerName } });
                    setBuzzerWinner('YOU');
                    setGameState('ANSWERING');
                    setTimeLeft(20);
                  }
                }}
                className="w-48 h-48 bg-red-600 rounded-full border-[12px] border-red-800 shadow-[0_12px_0_#991b1b,0_20px_40px_rgba(220,38,38,0.4)] hover:scale-105 active:translate-y-4 transition-all flex items-center justify-center group"
               >
                 <span className="text-white font-black text-3xl uppercase italic drop-shadow-lg">BẤM!</span>
               </button>
            </div>
          ) : gameState === 'ANSWERING' && buzzerWinner === 'YOU' ? (
            <div className="flex-1 flex flex-col overflow-hidden animate-in zoom-in min-h-0">
               <div className="flex-1 overflow-y-auto no-scrollbar min-h-0">
                  <AnswerInput problem={currentProblem} value={userAnswer} onChange={setUserAnswer} onSubmit={submitAnswer} disabled={false} />
               </div>
               <button onClick={submitAnswer} className="w-full py-5 bg-blue-600 text-white rounded-[1.5rem] font-black italic text-lg mt-3 shadow-lg border-b-6 border-blue-800 shrink-0">NỘP ĐÁP ÁN ✅</button>
            </div>
          ) : gameState === 'ANSWERING' && buzzerWinner === 'OPPONENT' ? (
            <div className="h-full flex flex-col items-center justify-center text-center animate-in slide-in-from-right">
               <div className="w-20 h-20 border-[8px] border-slate-100 border-t-red-600 rounded-full animate-spin mb-6"></div>
               <div className="bg-slate-900 text-white p-8 rounded-[2rem] border-b-[8px] border-slate-950">
                  <h3 className="text-xl font-black uppercase italic mb-2 text-red-400">ĐỐI THỦ ĐÃ GIÀNH QUYỀN!</h3>
                  <p className="font-bold text-slate-400 italic text-sm">Vui lòng đợi kết quả...</p>
               </div>
            </div>
          ) : gameState === 'FEEDBACK' ? (
             <div className="h-full flex flex-col animate-in zoom-in overflow-hidden min-h-0">
                <div className={`text-2xl font-black uppercase italic mb-3 ${feedback?.isCorrect ? 'text-emerald-500' : 'text-blue-500'}`}>
                  {feedback?.isCorrect ? 'CHÍNH XÁC!' : 'SAI RỒI!'}
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 min-h-0">
                   <div className="bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 italic font-bold text-slate-700">
                      <LatexRenderer content={feedback?.text || ""} />
                   </div>
                   <div className="bg-emerald-50/50 p-6 rounded-[1.5rem] border-2 border-emerald-100">
                      <h4 className="text-emerald-600 font-black uppercase text-[10px] mb-2">📖 GIẢI CHI TIẾT</h4>
                      <div className="text-slate-600 text-sm italic leading-relaxed">
                         <LatexRenderer content={currentProblem?.explanation || ""} />
                      </div>
                   </div>
                </div>
                <div className="mt-3 flex items-center justify-between bg-slate-900 p-3 rounded-xl text-white shrink-0">
                   <span className="font-black italic uppercase text-[8px] opacity-60">KẾ TIẾP SAU:</span>
                   <span className="text-xl font-black text-yellow-400 italic">{feedbackTimer}s</span>
                </div>
             </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center opacity-5">
               <div className="text-8xl">⏳</div>
            </div>
          )}
        </div>
      </div>
      <ConfirmModal isOpen={showExitConfirm} title="Thoát trận đấu?" message="Kết quả hiện tại sẽ không được lưu lại!" onConfirm={onExit} onCancel={() => setShowExitConfirm(false)} isDestructive={true} />
    </div>
  );
};

export default GameEngine;
