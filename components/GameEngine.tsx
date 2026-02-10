
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
  id: string;
  name: string;
  score: number;
}

const GameEngine: React.FC<GameEngineProps> = ({ 
  gameState, setGameState, playerName, currentTeacher, matchData, onExit 
}) => {
  const [currentRoundIdx, setCurrentRoundIdx] = useState(0);
  const [currentProblemIdx, setCurrentProblemIdx] = useState(matchData.startIndex || 0); 
  const [score, setScore] = useState(0);
  const [opponents, setOpponents] = useState<OpponentData[]>([]);
  
  const [timeLeft, setTimeLeft] = useState(DEFAULT_TIME);
  const [feedbackTimer, setFeedbackTimer] = useState(FEEDBACK_TIME);
  const [roundIntroTimer, setRoundIntroTimer] = useState(ROUND_INTRO_TIME);
  const [syncCountdown, setSyncCountdown] = useState<number | null>(null);
  
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState<any>(null);
  const [buzzerWinner, setBuzzerWinner] = useState<'YOU' | 'OPPONENT' | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showHelpConfirm, setShowHelpConfirm] = useState(false);
  const [isMaster, setIsMaster] = useState(false);
  const [isHelpUsed, setIsHelpUsed] = useState(false); 
  const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);
  
  // Refs để lưu trữ trạng thái mà không gây re-render liên tục
  const channelRef = useRef<any>(null);
  const gameStateRef = useRef(gameState);
  const isTransitioningRef = useRef(false);
  const lastProcessedQuestionKey = useRef("");
  const clockOffsetRef = useRef<number>(0); 
  const syncIntervalRef = useRef<any>(null);
  const fallbackTimerRef = useRef<any>(null);

  useEffect(() => { 
    gameStateRef.current = gameState; 
  }, [gameState]);

  const rounds = matchData.rounds;
  const currentRound = rounds[currentRoundIdx];
  const currentProblem = currentRound?.problems[currentProblemIdx];

  const submitAnswer = useCallback((timeout = false) => {
    if (gameStateRef.current === 'FEEDBACK') return;
    
    const correct = (currentProblem?.correctAnswer || "").trim().toUpperCase();
    const isPerfect = !timeout && userAnswer.trim().toUpperCase() === correct;
    const points = isPerfect ? (isHelpUsed ? 60 : 100) : 0;
    
    let fbText = "";
    if (timeout) {
      fbText = `HẾT GIỜ! Đáp án đúng là: ${correct}`;
    } else {
      fbText = isPerfect ? `CHÍNH XÁC! (+${points}đ)` : `SAI RỜI! Đáp án: ${correct}`;
    }

    const fb = { isCorrect: isPerfect, text: fbText, winner: 'YOU', isTimeout: timeout };
    
    if (isPerfect) setScore(s => s + points);
    setFeedback(fb); 
    setGameState('FEEDBACK'); 
    setFeedbackTimer(FEEDBACK_TIME);
    isTransitioningRef.current = false;
    
    if (matchData.joinedRoom?.code !== 'ARENA_A' && channelRef.current) {
      channelRef.current.send({ 
        type: 'broadcast', 
        event: 'match_result', 
        payload: { player: playerName, playerId: matchData.myId, points, feedback: fb } 
      });
    }
  }, [currentProblem, userAnswer, isHelpUsed, playerName, matchData, setGameState]);

  const syncToProblem = useCallback((roundIdx: number, probIdx: number, syncTime: number) => {
    const qKey = `R${roundIdx}P${probIdx}`;
    // Nếu đã nạp câu này rồi thì không nạp lại (tránh loop)
    if (lastProcessedQuestionKey.current === qKey && gameStateRef.current === 'STARTING_ROUND') return;
    
    lastProcessedQuestionKey.current = qKey;
    isTransitioningRef.current = true;

    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);

    setUserAnswer(''); 
    setFeedback(null); 
    setBuzzerWinner(null); 
    setIsHelpUsed(false);
    setSyncCountdown(null);
    
    setGameState('STARTING_ROUND');
    setCurrentRoundIdx(roundIdx);
    setCurrentProblemIdx(probIdx);
    
    const targetProblem = rounds[roundIdx]?.problems[probIdx];
    const initialTime = targetProblem?.timeLimit || DEFAULT_TIME;
    setTimeLeft(initialTime);

    // Bỏ qua clock offset phức tạp, dùng delay cố định 1s để bắt đầu
    setTimeout(() => {
      if (matchData.joinedRoom?.code === 'ARENA_A') {
        setGameState('ANSWERING');
        setBuzzerWinner('YOU');
        isTransitioningRef.current = false;
      } else {
        let count = 3;
        setSyncCountdown(count);
        syncIntervalRef.current = setInterval(() => {
          count--;
          if (count <= 0) {
            clearInterval(syncIntervalRef.current);
            setSyncCountdown(null);
            setGameState(matchData.joinedRoom?.code === 'TEACHER_ROOM' ? 'ANSWERING' : 'WAITING_FOR_BUZZER');
            isTransitioningRef.current = false;
          } else {
            setSyncCountdown(count);
          }
        }, 1000);
      }
    }, 1000);
  }, [rounds, setGameState, matchData]);

  // Heartbeat định kỳ của Master
  useEffect(() => {
    if (isMaster && matchData.joinedRoom?.code !== 'ARENA_A') {
      const heartbeat = setInterval(() => {
        channelRef.current?.send({
          type: 'broadcast',
          event: 'heartbeat',
          payload: {
            roundIdx: currentRoundIdx,
            probIdx: currentProblemIdx,
            phase: gameStateRef.current,
            sentAt: Date.now()
          }
        });
      }, 2000);
      return () => clearInterval(heartbeat);
    }
  }, [isMaster, matchData, currentRoundIdx, currentProblemIdx, gameState]);

  // Xử lý chuyển từ ROUND_INTRO -> Câu 1
  useEffect(() => {
    if (gameState === 'ROUND_INTRO') {
      const timer = setInterval(() => {
        setRoundIntroTimer(prev => {
          if (prev <= 0.1) {
            clearInterval(timer);
            
            // Cơ chế đồng bộ mạnh mẽ: Master gửi lệnh, Slave đợi 2s nếu không thấy thì tự chạy
            const triggerStart = () => {
              if (isTransitioningRef.current) return;
              const syncTime = Date.now() + 1000;
              if (channelRef.current && matchData.joinedRoom?.code !== 'ARENA_A') {
                channelRef.current.send({ 
                  type: 'broadcast', 
                  event: 'sync_phase', 
                  payload: { phase: 'START_PROBLEM', roundIdx: currentRoundIdx, probIdx: 0, syncTime, sentAt: Date.now() } 
                });
              }
              syncToProblem(currentRoundIdx, 0, syncTime);
            };

            if (isMaster || matchData.joinedRoom?.code === 'ARENA_A') {
              triggerStart();
            } else {
              // Fallback cho Slave: Nếu 2s sau khi hết 0s mà chưa thấy Master lệnh, tự chuyển
              fallbackTimerRef.current = setTimeout(() => {
                if (gameStateRef.current === 'ROUND_INTRO') {
                  console.log("Master delay, Slave tự khởi động...");
                  triggerStart();
                }
              }, 2000);
            }
            return 0;
          }
          return prev - 0.1;
        });
      }, 100);
      return () => clearInterval(timer);
    }
  }, [gameState, isMaster, matchData, syncToProblem, currentRoundIdx]);

  // Kết nối Supabase Channel - Chỉ tạo 1 lần duy nhất
  useEffect(() => {
    const roomCode = matchData.joinedRoom?.code || '';
    const myUniqueId = matchData.myId || 'temp_id';
    
    if (roomCode !== 'ARENA_A' && matchData.joinedRoom) {
      const channelName = roomCode === 'TEACHER_ROOM' 
        ? `control_TEACHER_ROOM_${currentTeacher.id}` 
        : `arena_${roomCode}_${currentTeacher.id}`;

      const channel = supabase.channel(channelName, {
        config: { presence: { key: myUniqueId } }
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const keys = Object.keys(state).sort();
          setIsMaster(keys[0] === myUniqueId);
          
          const others = keys
            .filter(k => k !== myUniqueId)
            .map(k => ({
               id: k,
               name: (state[k][0] as any)?.name || k.split('_')[0] || "Đối thủ",
               score: (state[k][0] as any)?.score || 0
            }));
          setOpponents(others);
        })
        .on('broadcast', { event: 'heartbeat' }, ({ payload }) => {
          if (!isMaster) {
            const qKeyMaster = `R${payload.roundIdx}P${payload.probIdx}`;
            // Nếu Slave đang bị kẹt ở Intro trong khi Master đã vào trận, nhảy theo Master ngay
            if (qKeyMaster !== lastProcessedQuestionKey.current) {
               syncToProblem(payload.roundIdx, payload.probIdx, payload.sentAt + 500);
            } else if ((gameStateRef.current === 'STARTING_ROUND' || gameStateRef.current === 'ROUND_INTRO') && payload.phase !== gameStateRef.current) {
               if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
               setSyncCountdown(null);
               setGameState(payload.phase);
               isTransitioningRef.current = false;
            }
          }
        })
        .on('broadcast', { event: 'sync_phase' }, ({ payload }) => {
           if (payload.phase === 'START_PROBLEM') {
              syncToProblem(payload.roundIdx, payload.probIdx, payload.syncTime);
           } else if (payload.phase === 'NEXT_QUESTION') {
              if (payload.newRound) {
                setFeedback(null);
                setCurrentRoundIdx(payload.roundIdx);
                setCurrentProblemIdx(0);
                setRoundIntroTimer(ROUND_INTRO_TIME);
                setGameState('ROUND_INTRO');
                isTransitioningRef.current = false;
              } else {
                syncToProblem(payload.roundIdx, payload.probIdx, payload.syncTime);
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
            setOpponents(prev => prev.map(o => o.id === payload.playerId ? { ...o, score: (payload.totalScore || o.score + payload.points) } : o));
            setFeedback({ ...payload.feedback, winner: 'OPPONENT', winnerName: payload.player });
            setGameState('FEEDBACK');
            setFeedbackTimer(FEEDBACK_TIME);
            isTransitioningRef.current = false;
          }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') await channel.track({ role: 'player', name: playerName, score: 0 });
        });

      channelRef.current = channel;
      return () => { supabase.removeChannel(channel); };
    }
  }, [matchData.joinedRoom, currentTeacher.id, matchData.myId, playerName, isMaster, syncToProblem]);

  // Đồng bộ điểm số
  useEffect(() => {
    if (channelRef.current && matchData.joinedRoom?.code !== 'ARENA_A') {
      channelRef.current.track({ role: 'player', name: playerName, score: score });
    }
  }, [score, playerName, matchData]);

  // Hết FEEDBACK -> Qua câu mới
  useEffect(() => {
    if (gameState === 'FEEDBACK') {
      const timer = setInterval(() => {
        setFeedbackTimer(p => {
          if (p <= 0.1) {
            clearInterval(timer);
            if (isMaster || matchData.joinedRoom?.code === 'ARENA_A') {
              const nextProbIdx = currentProblemIdx + 1;
              const syncTime = Date.now() + 1000;

              if (nextProbIdx < (currentRound?.problems.length || 0)) {
                if (channelRef.current && matchData.joinedRoom?.code !== 'ARENA_A') {
                  channelRef.current.send({ 
                    type: 'broadcast', 
                    event: 'sync_phase', 
                    payload: { phase: 'NEXT_QUESTION', roundIdx: currentRoundIdx, probIdx: nextProbIdx, syncTime, sentAt: Date.now() } 
                  });
                }
                syncToProblem(currentRoundIdx, nextProbIdx, syncTime);
              } else if (currentRoundIdx + 1 < rounds.length) {
                if (channelRef.current && matchData.joinedRoom?.code !== 'ARENA_A') {
                  channelRef.current.send({ 
                    type: 'broadcast', 
                    event: 'sync_phase', 
                    payload: { phase: 'NEXT_QUESTION', newRound: true, roundIdx: currentRoundIdx + 1, sentAt: Date.now() } 
                  });
                }
                setFeedback(null);
                setCurrentRoundIdx(prev => prev + 1);
                setCurrentProblemIdx(0);
                setRoundIntroTimer(ROUND_INTRO_TIME);
                setGameState('ROUND_INTRO');
              } else {
                if (channelRef.current && matchData.joinedRoom?.code !== 'ARENA_A') {
                  channelRef.current.send({ type: 'broadcast', event: 'sync_phase', payload: { phase: 'GAME_OVER', sentAt: Date.now() } });
                }
                setGameState('GAME_OVER');
              }
            }
            return 0;
          }
          return p - 0.1;
        });
      }, 100);
      return () => clearInterval(timer);
    }
  }, [gameState, isMaster, matchData, currentRoundIdx, currentProblemIdx, rounds, currentRound, syncToProblem]);

  // Countdown của từng câu hỏi
  useEffect(() => {
    if (((gameState as any) === 'WAITING_FOR_BUZZER' || (gameState as any) === 'ANSWERING') && timeLeft > 0 && !isWhiteboardActive) {
      const t = setInterval(() => setTimeLeft(p => Math.max(0, p - 1)), 1000);
      return () => clearInterval(t);
    }
    if (timeLeft === 0 && !isWhiteboardActive && !isTransitioningRef.current) {
      if (gameStateRef.current === 'ANSWERING') {
        if (buzzerWinner === 'YOU' || matchData.joinedRoom?.code === 'ARENA_A' || matchData.joinedRoom?.code === 'TEACHER_ROOM') submitAnswer(true);
      } else if (gameStateRef.current === 'WAITING_FOR_BUZZER' && (isMaster || matchData.joinedRoom?.code === 'ARENA_A')) {
        submitAnswer(true);
      }
    }
  }, [gameState, timeLeft, buzzerWinner, isWhiteboardActive, matchData, isMaster, submitAnswer]);

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

  if (gameState === 'ROUND_INTRO') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-700">
        <div className="relative mb-12 animate-bounce">
           <span className="text-9xl drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]">⚔️</span>
        </div>
        <h2 className="text-6xl font-black text-white uppercase italic mb-8 tracking-tighter drop-shadow-xl">VÒNG {currentRound?.number}</h2>
        <div className="bg-white rounded-[3.5rem] p-10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] max-w-2xl w-full border-b-[12px] border-blue-600 animate-in zoom-in duration-500">
           <p className="text-slate-600 font-bold text-xl md:text-2xl italic uppercase tracking-widest leading-relaxed">{currentRound?.description || "Hãy chuẩn bị tinh thần!"}</p>
        </div>
        <div className="mt-16 w-full max-w-md">
           <div className="flex justify-between items-center px-4 mb-2">
              <span className="text-[10px] font-black text-blue-400 uppercase italic">CHUẨN BỊ...</span>
              <span className="text-[10px] font-black text-white uppercase italic">BẮT ĐẦU TRONG {Math.max(0, Math.ceil(roundIntroTimer))}s</span>
           </div>
           <div className="h-3 w-full bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 transition-all duration-100 ease-linear shadow-[0_0_10px_rgba(59,130,246,0.5)]" style={{ width: `${(roundIntroTimer / ROUND_INTRO_TIME) * 100}%` }} />
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col p-3 overflow-y-auto no-scrollbar relative text-left">
      <ConfirmModal isOpen={showHelpConfirm} title="Sử dụng Trợ giúp?" message="Bạn chỉ nhận được tối đa 60% số điểm!" onConfirm={() => { setIsHelpUsed(true); setShowHelpConfirm(false); }} onCancel={() => setShowHelpConfirm(false)} />
      
      <header className="bg-white px-5 py-3 rounded-[2rem] shadow-md mb-4 flex items-center justify-between border-b-4 border-slate-200 relative z-50 shrink-0">
        <div className="flex items-center gap-3">
           <div className="bg-blue-600 text-white px-5 py-2 rounded-[1.5rem] shadow-sm border-b-4 border-blue-800 flex flex-col items-center min-w-[80px]">
              <div className="text-[8px] font-black uppercase italic opacity-80 mb-1 truncate max-w-[60px]">{playerName}</div>
              <div className="text-xl font-black">{score}đ</div>
           </div>
           {opponents.map(opp => (
             <div key={opp.id} className="bg-rose-600 text-white px-5 py-2 rounded-[1.5rem] shadow-sm border-b-4 border-rose-800 flex flex-col items-center min-w-[80px] animate-in slide-in-from-left-2">
                <div className="text-[8px] font-black uppercase italic opacity-80 mb-1 truncate max-w-[60px]">{opp.name}</div>
                <div className="text-xl font-black">{opp.score}đ</div>
             </div>
           ))}
           {((gameState as any) === 'WAITING_FOR_BUZZER' || (gameState as any) === 'ANSWERING') && currentProblem?.challenge !== DisplayChallenge.NORMAL && !isHelpUsed && (
             <button onClick={() => setShowHelpConfirm(true)} className="px-4 py-2 bg-emerald-100 text-emerald-600 rounded-xl font-black uppercase italic text-[10px] border-b-2 border-emerald-200 ml-2">💡 Trợ giúp</button>
           )}
        </div>
        <div className="flex flex-col items-center">
           <div className="text-[8px] font-black text-slate-400 uppercase italic">TIME</div>
           <div className={`text-3xl font-black italic tabular-nums leading-none ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-slate-900'}`}>{timeLeft}s</div>
        </div>
        <button onClick={() => setShowExitConfirm(true)} className="w-10 h-10 bg-red-50 text-red-500 rounded-xl flex items-center justify-center font-black">✕</button>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 pb-10">
        <div className="lg:col-span-7 h-fit min-h-[400px]">
          <div className={`h-full relative transition-all duration-500 ${syncCountdown !== null ? 'blur-xl grayscale' : 'blur-0 grayscale-0'}`}>
             <ProblemCard problem={currentProblem} isPaused={isWhiteboardActive || syncCountdown !== null} isHelpUsed={isHelpUsed} />
             {syncCountdown !== null && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-30">
                   <div className="bg-slate-900/80 backdrop-blur-md px-10 py-6 rounded-[2rem] border-2 border-white/10 shadow-2xl">
                      <p className="text-white font-black uppercase italic tracking-widest text-xl animate-pulse">
                        ĐANG ĐỒNG BỘ TRẬN ĐẤU...
                      </p>
                   </div>
                </div>
             )}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white rounded-[2.5rem] p-6 shadow-xl flex flex-col h-fit relative min-h-[400px]">
          {syncCountdown !== null ? (
            <div className="min-h-[400px] flex flex-col items-center justify-center animate-in zoom-in duration-300">
               <div className="text-[12rem] font-black text-blue-600 drop-shadow-2xl italic animate-bounce">{syncCountdown}</div>
               <div className="text-xl font-black text-blue-400 uppercase italic mt-4 tracking-widest">SẴN SÀNG!</div>
            </div>
          ) : ((gameState as any) === 'ANSWERING' && (buzzerWinner === 'YOU' || matchData.joinedRoom?.code === 'ARENA_A' || matchData.joinedRoom?.code === 'TEACHER_ROOM')) ? (
            <div className="flex flex-col animate-in zoom-in w-full h-auto">
               <div className="w-full h-auto">
                  <AnswerInput problem={currentProblem} value={userAnswer} onChange={setUserAnswer} onSubmit={() => submitAnswer()} disabled={(gameState as any) === 'FEEDBACK'} />
               </div>
               <button 
                onClick={() => submitAnswer()} 
                disabled={!userAnswer}
                className={`w-full py-5 rounded-[1.5rem] font-black italic text-lg mt-6 shadow-lg transition-all active:scale-95 border-b-6 ${userAnswer ? 'bg-blue-600 text-white border-blue-800' : 'bg-slate-100 text-slate-300 border-slate-200'}`}
               >XÁC NHẬN ĐÁP ÁN ✅</button>
            </div>
          ) : (gameState as any) === 'WAITING_FOR_BUZZER' && matchData.joinedRoom?.code !== 'ARENA_A' && matchData.joinedRoom?.code !== 'TEACHER_ROOM' ? (
            <div className="min-h-[400px] flex flex-col items-center justify-center text-center animate-in fade-in">
               <div className="text-4xl mb-4 animate-bounce">🔔</div>
               <h3 className="text-2xl font-black text-slate-800 uppercase italic mb-8">NHẤN CHUÔNG GIÀNH QUYỀN</h3>
               <button 
                onClick={() => {
                  if (!buzzerWinner && channelRef.current) {
                    channelRef.current.send({ type: 'broadcast', event: 'buzzer_signal', payload: { playerId: matchData.myId, player: playerName } });
                    setBuzzerWinner('YOU');
                    setGameState('ANSWERING');
                    setTimeLeft(20);
                  }
                }}
                className="w-48 h-48 bg-red-600 rounded-full border-[12px] border-red-800 shadow-[0_12px_0_#991b1b,0_20px_40px_rgba(220,38,38,0.4)] hover:scale-105 active:translate-y-4 transition-all flex items-center justify-center"
               ><span className="text-white font-black text-3xl uppercase italic">BẤM!</span></button>
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
                <div className={`text-2xl font-black uppercase italic mb-3 ${feedback?.isCorrect ? 'text-emerald-500' : 'text-blue-500'}`}>
                  {feedback?.isTimeout ? 'HẾT GIỜ!' : feedback?.isCorrect ? 'CHÍNH XÁC!' : 'SAI RỜI!'}
                </div>
                <div className="space-y-4 w-full h-auto">
                   <div className="bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 italic font-bold text-slate-700"><LatexRenderer content={feedback?.text || ""} /></div>
                   <div className="bg-emerald-50/50 p-6 rounded-[1.5rem] border-2 border-emerald-100">
                      <h4 className="text-emerald-600 font-black uppercase text-[10px] mb-2">📖 GIẢI CHI TIẾT</h4>
                      <div className="text-slate-600 text-sm md:text-base italic leading-relaxed"><LatexRenderer content={currentProblem?.explanation || ""} /></div>
                   </div>
                </div>
                <div className="mt-8 flex flex-col gap-2">
                   <div className="flex justify-between items-center px-2">
                      <span className="font-black italic uppercase text-[10px] text-slate-400">ĐANG ĐỌC ĐÁP ÁN...</span>
                      <span className="text-[10px] font-black text-blue-500 italic">NEXT CÂU KẾ</span>
                   </div>
                   <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 transition-all duration-100 ease-linear shadow-[0_0_10px_rgba(59,130,246,0.5)]" style={{ width: `${(feedbackTimer / FEEDBACK_TIME) * 100}%` }} />
                   </div>
                </div>
             </div>
          ) : (
            <div className="min-h-[400px] flex flex-col items-center justify-center animate-pulse">
               <div className="text-xl font-black text-blue-600 uppercase italic mb-4">CHUẨN BỊ CHIẾN ĐẤU...</div>
               <div className="flex gap-2">
                 {[1,2,3,4].map(i => <div key={i} className="w-3 h-3 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: `${i*0.2}s` }} />)}
               </div>
            </div>
          )}
        </div>
      </div>
      <ConfirmModal isOpen={showExitConfirm} title="Thoát trận đấu?" message="Kết quả sẽ không được lưu!" onConfirm={onExit} onCancel={() => setShowExitConfirm(false)} isDestructive={true} />
    </div>
  );
};

export default GameEngine;
