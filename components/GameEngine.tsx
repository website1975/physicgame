
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
  const [roundIntroTimer, setRoundIntroTimer] = useState(ROUND_INTRO_TIME);
  
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState<any>(null);
  const [buzzerWinner, setBuzzerWinner] = useState<'YOU' | 'OPPONENT' | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showHelpConfirm, setShowHelpConfirm] = useState(false);
  const [isMaster, setIsMaster] = useState(false);
  const [isHelpUsed, setIsHelpUsed] = useState(false); 
  const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);
  
  const roomCode = matchData.joinedRoom?.code || '';
  const isTeacherRoom = roomCode === 'TEACHER_ROOM';
  const isArenaA = roomCode === 'ARENA_A';
  const myUniqueId = matchData.myId || 'temp_id';

  const channelRef = useRef<any>(null);
  const gameStateRef = useRef(gameState);
  const isTransitioningRef = useRef(false);
  const syncSentRef = useRef<string>(''); 

  const currentQuestionKeyRef = useRef(`R${currentRoundIdx}P${currentProblemIdx}`);

  useEffect(() => { 
    gameStateRef.current = gameState; 
    currentQuestionKeyRef.current = `R${currentRoundIdx}P${currentProblemIdx}`;
  }, [gameState, currentRoundIdx, currentProblemIdx]);

  const rounds = matchData.rounds;
  const currentRound = rounds[currentRoundIdx];
  const currentProblem = currentRound?.problems[currentProblemIdx];

  const syncToProblem = useCallback((roundIdx: number, probIdx: number) => {
    isTransitioningRef.current = false;
    setRoundIntroTimer(0);
    setFeedbackTimer(0);

    setUserAnswer(''); 
    setFeedback(null); 
    setBuzzerWinner(null); 
    setIsHelpUsed(false);
    
    setCurrentRoundIdx(roundIdx);
    setCurrentProblemIdx(probIdx);
    
    const targetProblem = rounds[roundIdx]?.problems[probIdx];
    setTimeLeft(targetProblem?.timeLimit || DEFAULT_TIME);

    const nextState = (isArenaA || isTeacherRoom) ? 'ANSWERING' : 'WAITING_FOR_BUZZER';
    if (isArenaA) setBuzzerWinner('YOU');
    
    setGameState(nextState);
  }, [isArenaA, isTeacherRoom, rounds, setGameState]);

  useEffect(() => {
    if (!isArenaA && matchData.joinedRoom) {
      const channel = supabase.channel(`match_${matchData.joinedRoom.code}_${currentTeacher.id}`, {
        config: { presence: { key: myUniqueId } }
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const keys = Object.keys(state).sort();
          setIsMaster(keys[0] === myUniqueId);
        })
        .on('broadcast', { event: 'sync_phase' }, ({ payload }) => {
           if (payload.phase === 'NEXT_QUESTION') {
              if (payload.newRound) {
                setFeedback(null);
                setCurrentRoundIdx(payload.roundIdx);
                setCurrentProblemIdx(0);
                setRoundIntroTimer(ROUND_INTRO_TIME);
                setGameState('ROUND_INTRO');
              } else {
                syncToProblem(payload.roundIdx, payload.probIdx);
              }
           } else if (payload.phase === 'GAME_OVER') {
              setGameState('GAME_OVER');
           }
        })
        .on('broadcast', { event: 'buzzer_signal' }, ({ payload }) => {
          if (payload.playerId !== myUniqueId && (gameStateRef.current === 'WAITING_FOR_BUZZER')) {
            setBuzzerWinner('OPPONENT');
            setGameState('ANSWERING');
            setTimeLeft(20);
          }
        })
        .on('broadcast', { event: 'match_result' }, ({ payload }) => {
          if (payload.playerId !== myUniqueId) {
            setOpponentScores(prev => ({ 
              ...prev, 
              [payload.playerId]: { 
                name: payload.player || "Đối thủ",
                score: (prev[payload.playerId]?.score || 0) + (payload.points || 0) 
              } 
            }));
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
  }, [isArenaA, matchData.joinedRoom, myUniqueId, syncToProblem, currentTeacher.id]);

  useEffect(() => {
    if (gameState === 'ROUND_INTRO') {
      const timer = setInterval(() => {
        setRoundIntroTimer(prev => {
          if (prev <= 0.1) {
            clearInterval(timer);
            const syncKey = `INTRO_R${currentRoundIdx}`;
            if (syncSentRef.current !== syncKey && !isArenaA && channelRef.current) {
              syncSentRef.current = syncKey;
              channelRef.current.send({ 
                type: 'broadcast', 
                event: 'sync_phase', 
                payload: { phase: 'NEXT_QUESTION', roundIdx: currentRoundIdx, probIdx: 0 } 
              });
            }
            syncToProblem(currentRoundIdx, 0);
            return 0;
          }
          return prev - 0.1;
        });
      }, 100);
      return () => clearInterval(timer);
    }
  }, [gameState, isArenaA, syncToProblem, currentRoundIdx]);

  useEffect(() => {
    if (gameState === 'FEEDBACK') {
      const timer = setInterval(() => {
        setFeedbackTimer(p => {
          if (p <= 0.1) {
            clearInterval(timer);
            const nextProbIdx = currentProblemIdx + 1;
            const syncKey = `FB_R${currentRoundIdx}P${currentProblemIdx}`;

            if (syncSentRef.current !== syncKey && !isArenaA && channelRef.current) {
              syncSentRef.current = syncKey;
              if (nextProbIdx < (currentRound?.problems.length || 0)) {
                channelRef.current.send({ 
                  type: 'broadcast', 
                  event: 'sync_phase', 
                  payload: { phase: 'NEXT_QUESTION', roundIdx: currentRoundIdx, probIdx: nextProbIdx } 
                });
              } else if (currentRoundIdx + 1 < rounds.length) {
                channelRef.current.send({ 
                  type: 'broadcast', 
                  event: 'sync_phase', 
                  payload: { phase: 'NEXT_QUESTION', newRound: true, roundIdx: currentRoundIdx + 1 } 
                });
              } else {
                channelRef.current.send({ type: 'broadcast', event: 'sync_phase', payload: { phase: 'GAME_OVER' } });
              }
            }

            if (nextProbIdx < (currentRound?.problems.length || 0)) {
              syncToProblem(currentRoundIdx, nextProbIdx);
            } else if (currentRoundIdx + 1 < rounds.length) {
              setFeedback(null);
              setCurrentRoundIdx(prev => prev + 1);
              setCurrentProblemIdx(0);
              setRoundIntroTimer(ROUND_INTRO_TIME);
              setGameState('ROUND_INTRO');
            } else {
              setGameState('GAME_OVER');
            }
            return 0;
          }
          return p - 0.1;
        });
      }, 100);
      return () => clearInterval(timer);
    }
  }, [gameState, isArenaA, currentRound, currentRoundIdx, currentProblemIdx, rounds, syncToProblem]);

  useEffect(() => {
    if (((gameState as any) === 'WAITING_FOR_BUZZER' || (gameState as any) === 'ANSWERING') && timeLeft > 0 && !isWhiteboardActive) {
      const t = setInterval(() => setTimeLeft(p => Math.max(0, p - 1)), 1000);
      return () => clearInterval(t);
    }
    if (timeLeft === 0 && !isWhiteboardActive && (gameState as any) === 'ANSWERING') {
      if (buzzerWinner === 'YOU' || isArenaA) submitAnswer();
    }
  }, [gameState, timeLeft, buzzerWinner, isWhiteboardActive, isArenaA]);

  const submitAnswer = () => {
    if (gameStateRef.current === 'FEEDBACK') return;
    
    const correct = (currentProblem?.correctAnswer || "").trim().toUpperCase();
    const isPerfect = userAnswer.trim().toUpperCase() === correct;
    const points = isPerfect ? (isHelpUsed ? 60 : 100) : 0;
    const fb = { isCorrect: isPerfect, text: isPerfect ? `CHÍNH XÁC! (+${points}đ)` : `SAI RỜI! Đáp án: ${correct}`, winner: 'YOU' };
    
    if (isPerfect) setScore(s => s + points);
    setFeedback(fb); 
    setGameState('FEEDBACK'); 
    setFeedbackTimer(FEEDBACK_TIME);
    
    if (!isArenaA && channelRef.current) {
      channelRef.current.send({ 
        type: 'broadcast', 
        event: 'match_result', 
        payload: { player: playerName, playerId: myUniqueId, points, feedback: fb } 
      });
    }
  };

  if (gameState === 'GAME_OVER') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
        <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-2xl w-full border-b-[12px] border-blue-600">
          <div className="text-8xl mb-8">🏆</div>
          <h2 className="text-4xl font-black text-slate-800 uppercase italic mb-8">KẾT THÚC TRẬN</h2>
          <div className="text-6xl font-black text-blue-600 italic mb-12">{score}đ</div>
          <button onClick={onExit} className="w-full py-6 bg-slate-900 text-white rounded-3xl font-black uppercase italic text-xl shadow-xl hover:scale-105 active:scale-95 transition-all">RỜI ARENA 🚪</button>
        </div>
      </div>
    );
  }

  if (gameState === 'ROUND_INTRO') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-700">
        <div className="relative mb-12 animate-bounce">
           <span className="text-9xl drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]">⚔️</span>
        </div>
        <h2 className="text-6xl font-black text-white uppercase italic mb-8 tracking-tighter drop-shadow-xl">VÒNG {currentRound?.number}</h2>
        <div className="bg-white rounded-[3.5rem] p-10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] max-w-2xl w-full border-b-[12px] border-blue-600 animate-in zoom-in duration-500">
           <p className="text-slate-600 font-bold text-xl md:text-2xl italic uppercase tracking-widest leading-relaxed">{currentRound?.description || "Chuẩn bị cho thử thách AI!"}</p>
        </div>
        <div className="mt-16 w-full max-w-md">
           <div className="h-3 w-full bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 transition-all duration-100 ease-linear shadow-[0_0_15px_rgba(59,130,246,0.5)]" style={{ width: `${(roundIntroTimer / ROUND_INTRO_TIME) * 100}%` }} />
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col p-3 overflow-y-auto no-scrollbar relative text-left">
      <ConfirmModal isOpen={showHelpConfirm} title="Sử dụng Trợ giúp?" message="Bạn chỉ nhận được tối đa 60% số điểm nếu trả lời đúng!" onConfirm={() => { setIsHelpUsed(true); setShowHelpConfirm(false); }} onCancel={() => setShowHelpConfirm(false)} />
      
      <header className="bg-white px-5 py-3 rounded-[2rem] shadow-md mb-4 flex items-center justify-between border-b-4 border-slate-200 relative z-50 shrink-0 gap-4 overflow-x-auto no-scrollbar">
        {/* SCORE BOARD TRÊN HEADER */}
        <div className="flex items-center gap-2 shrink-0">
           {/* ĐIỂM CỦA BẠN */}
           <div className="bg-blue-600 text-white px-4 py-1.5 rounded-full shadow-sm border-b-4 border-blue-800 flex items-center gap-2">
              <span className="text-[8px] font-black uppercase italic opacity-70">BẠN</span>
              <span className="text-sm font-black italic">{score}đ</span>
           </div>

           {/* ĐIỂM ĐỐI THỦ (HIỆN NỐI TIẾP) */}
           {!isArenaA && Object.values(opponentScores).map((opp, idx) => (
             <div key={idx} className="bg-slate-900 text-white px-4 py-1.5 rounded-full shadow-sm border-b-4 border-slate-950 flex items-center gap-2 animate-in slide-in-from-left duration-300">
                <span className="text-[8px] font-black uppercase italic opacity-60 truncate max-w-[60px]">{opp.name}</span>
                <span className="text-sm font-black italic text-emerald-400">{opp.score}đ</span>
             </div>
           ))}

           {matchData.setId === 'ai_custom' && (
             <span className="bg-amber-100 text-amber-600 text-[8px] font-black px-3 py-1.5 rounded-full border border-amber-200 uppercase italic">Thách đấu AI ✨</span>
           )}
        </div>

        {/* TIMER CENTER */}
        <div className="flex flex-col items-center flex-1">
           <div className={`text-2xl md:text-3xl font-black italic tabular-nums leading-none flex items-center gap-2 ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-slate-900'}`}>
              <span className="text-xs text-slate-300">⏱️</span> {timeLeft}s
           </div>
        </div>

        {/* EXIT BUTTON */}
        <button onClick={() => setShowExitConfirm(true)} className="w-8 h-8 md:w-10 md:h-10 bg-red-50 text-red-500 rounded-xl flex items-center justify-center font-black shrink-0">✕</button>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 pb-10">
        <div className="lg:col-span-7 h-fit min-h-[400px]">
           <ProblemCard problem={currentProblem} isPaused={isWhiteboardActive} isHelpUsed={isHelpUsed} />
        </div>

        <div className="lg:col-span-5 bg-white rounded-[2.5rem] p-6 shadow-xl flex flex-col h-fit relative min-h-[400px]">
          {((gameState as any) === 'ANSWERING' && (buzzerWinner === 'YOU' || isArenaA || isTeacherRoom)) ? (
            <div className="flex flex-col animate-in zoom-in w-full h-auto">
               <AnswerInput problem={currentProblem} value={userAnswer} onChange={setUserAnswer} onSubmit={submitAnswer} disabled={(gameState as any) === 'FEEDBACK'} />
               <button onClick={submitAnswer} disabled={!userAnswer} className={`w-full py-5 rounded-[1.5rem] font-black italic text-lg mt-6 shadow-lg transition-all active:scale-95 shrink-0 border-b-6 ${userAnswer ? 'bg-blue-600 text-white border-blue-800' : 'bg-slate-100 text-slate-300 border-slate-200'}`}>XÁC NHẬN ĐÁP ÁN ✅</button>
            </div>
          ) : (gameState as any) === 'WAITING_FOR_BUZZER' ? (
            <div className="min-h-[400px] flex flex-col items-center justify-center text-center animate-in fade-in">
               <div className="text-4xl mb-4 animate-bounce">🔔</div>
               <h3 className="text-2xl font-black text-slate-800 uppercase italic mb-8">NHẤN CHUÔNG GIÀNH QUYỀN</h3>
               <button 
                onClick={() => {
                  if (!buzzerWinner && channelRef.current) {
                    channelRef.current.send({ 
                      type: 'broadcast', 
                      event: 'buzzer_signal', 
                      payload: { playerId: myUniqueId, player: playerName, questionKey: currentQuestionKeyRef.current } 
                    });
                    setBuzzerWinner('YOU');
                    setGameState('ANSWERING');
                    setTimeLeft(20);
                  }
                }}
                className="w-48 h-48 bg-red-600 rounded-full border-[12px] border-red-800 shadow-[0_12px_0_#991b1b,0_20px_40px_rgba(220,38,38,0.4)] hover:scale-105 active:translate-y-4 transition-all flex items-center justify-center"
               ><span className="text-white font-black text-3xl uppercase italic drop-shadow-lg">BẤM!</span></button>
            </div>
          ) : (gameState as any) === 'ANSWERING' && buzzerWinner === 'OPPONENT' ? (
            <div className="min-h-[400px] flex flex-col items-center justify-center text-center animate-in slide-in-from-right">
               <div className="w-20 h-20 border-[8px] border-slate-100 border-t-red-600 rounded-full animate-spin mb-6"></div>
               <div className="bg-slate-900 text-white p-8 rounded-[2rem] border-b-[8px] border-slate-950">
                  <h3 className="text-xl font-black uppercase italic mb-2 text-red-400">ĐỐI THỦ ĐÃ GIÀNH QUYỀN!</h3>
                  <p className="font-bold text-slate-400 italic text-sm">Vui lòng đợi kết quả...</p>
               </div>
            </div>
          ) : (gameState as any) === 'FEEDBACK' ? (
             <div className="flex flex-col animate-in zoom-in w-full h-auto">
                <div className={`text-2xl font-black uppercase italic mb-3 ${feedback?.isCorrect ? 'text-emerald-500' : 'text-blue-500'}`}>{feedback?.isCorrect ? 'CHÍNH XÁC!' : 'SAI RỜI!'}</div>
                
                <div className="space-y-4 w-full h-auto">
                   <div className="bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 italic font-bold text-slate-700"><LatexRenderer content={feedback?.text || ""} /></div>
                   <div className="bg-emerald-50/50 p-6 rounded-[1.5rem] border-2 border-emerald-100">
                      <h4 className="text-emerald-600 font-black uppercase text-[10px] mb-2">📖 GIẢI CHI TIẾT</h4>
                      <div className="text-slate-600 text-sm md:text-base italic leading-relaxed"><LatexRenderer content={currentProblem?.explanation || ""} /></div>
                   </div>
                </div>
                <div className="mt-8 flex flex-col gap-2">
                   <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                      <div className="h-full bg-blue-500 transition-all duration-100 ease-linear" style={{ width: `${(feedbackTimer / FEEDBACK_TIME) * 100}%` }} />
                   </div>
                </div>
             </div>
          ) : null}
        </div>
      </div>
      <ConfirmModal isOpen={showExitConfirm} title="Thoát trận đấu?" message="Kết quả hiện tại sẽ không được lưu lại!" onConfirm={onExit} onCancel={() => setShowExitConfirm(false)} isDestructive={true} />
    </div>
  );
};

export default GameEngine;
