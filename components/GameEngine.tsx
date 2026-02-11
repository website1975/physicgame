
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
const ROUND_INTRO_TIME = 5; // Thời gian giới thiệu vòng cho Arena tự do

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
  
  const rounds = matchData.rounds;
  const currentRound = rounds[currentRoundIdx];
  const initialProblem = currentRound?.problems[currentProblemIdx];

  const [timeLeft, setTimeLeft] = useState(initialProblem?.timeLimit || DEFAULT_TIME);
  const [feedbackTimer, setFeedbackTimer] = useState(FEEDBACK_TIME);
  const [roundIntroTimer, setRoundIntroTimer] = useState(ROUND_INTRO_TIME);
  
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState<any>(null);
  const [buzzerWinner, setBuzzerWinner] = useState<'YOU' | 'OPPONENT' | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showHelpConfirm, setShowHelpConfirm] = useState(false);
  const [isHelpUsed, setIsHelpUsed] = useState(false); 
  const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);
  
  const roomCode = matchData.joinedRoom?.code || '';
  const isTeacherRoom = roomCode === 'TEACHER_ROOM';
  const isArenaA = roomCode === 'ARENA_A';
  const myUniqueId = matchData.myId || 'temp_id';
  const myPresenceKey = `${playerName}_${myUniqueId}`;

  const channelRef = useRef<any>(null);
  const gameStateRef = useRef(gameState);

  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  const currentProblem = rounds[currentRoundIdx]?.problems[currentProblemIdx];

  // --- HÀM ĐỒNG BỘ CÂU HỎI ---
  const syncToProblem = useCallback((roundIdx: number, probIdx: number, forceAnswering: boolean = false) => {
    setUserAnswer(''); 
    setFeedback(null); 
    setBuzzerWinner('YOU'); 
    setIsHelpUsed(false);
    
    setCurrentRoundIdx(roundIdx);
    setCurrentProblemIdx(probIdx);
    
    const targetProblem = rounds[roundIdx]?.problems[probIdx];
    setTimeLeft(targetProblem?.timeLimit || DEFAULT_TIME);

    // Nếu là lệnh từ GV hoặc Arena đơn/PVP đã qua bước Intro
    if (forceAnswering || isArenaA || isTeacherRoom) {
      setGameState('ANSWERING');
    } else {
      setGameState('WAITING_FOR_BUZZER');
    }
  }, [isArenaA, isTeacherRoom, rounds, setGameState]);

  // --- LOGIC TỰ ĐỘNG CHO PHÒNG ĐƠN / PVP (KHÔNG PHẢI PHÒNG GV) ---
  useEffect(() => {
    if (isTeacherRoom) return; // Bỏ qua logic tự động nếu là phòng GV

    if (gameState === 'ROUND_INTRO') {
      const timer = setInterval(() => {
        setRoundIntroTimer(prev => {
          if (prev <= 0.1) {
            clearInterval(timer);
            syncToProblem(currentRoundIdx, 0);
            return 0;
          }
          return prev - 0.1;
        });
      }, 100);
      return () => clearInterval(timer);
    }

    if (gameState === 'FEEDBACK') {
      const timer = setInterval(() => {
        setFeedbackTimer(p => {
          if (p <= 0.1) {
            clearInterval(timer);
            const nextProbIdx = currentProblemIdx + 1;
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
  }, [gameState, isTeacherRoom, currentRoundIdx, currentProblemIdx, currentRound, rounds, syncToProblem]);

  // --- KẾT NỐI REALTIME ---
  useEffect(() => {
    const channelName = isTeacherRoom 
      ? `room_TEACHER_LIVE_${currentTeacher.id}` 
      : `match_${matchData.joinedRoom.code}_${currentTeacher.id}`;

    if (!isArenaA && matchData.joinedRoom) {
      const channel = supabase.channel(channelName, {
        config: { presence: { key: myPresenceKey } }
      });

      channel
        .on('broadcast', { event: 'teacher_next_question' }, ({ payload }) => {
          // QUAN TRỌNG: GV ra lệnh chuyển câu - HS thoát ngay lập tức mọi trạng thái chờ/feedback
          syncToProblem(payload.nextRoundIndex || 0, payload.nextIndex, true);
        })
        .on('broadcast', { event: 'teacher_toggle_whiteboard' }, ({ payload }) => {
          setIsWhiteboardActive(payload.active);
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
          }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ online: true, role: 'student' });
          }
        });

      channelRef.current = channel;

      // Khởi tạo cho phòng GV (nhảy thẳng vào trả lời câu 1)
      if (isTeacherRoom && gameStateRef.current === 'ROUND_INTRO') {
        syncToProblem(currentRoundIdx, currentProblemIdx, true);
      }

      return () => { supabase.removeChannel(channel); channelRef.current = null; };
    }
  }, [isArenaA, isTeacherRoom, matchData.joinedRoom?.code, myUniqueId, myPresenceKey, currentTeacher.id, syncToProblem]);

  // --- TIMER TRẢ LỜI ---
  useEffect(() => {
    if ((gameState === 'ANSWERING' || gameState === 'WAITING_FOR_BUZZER') && timeLeft > 0 && !isWhiteboardActive) {
      const t = setInterval(() => setTimeLeft(p => Math.max(0, p - 1)), 1000);
      return () => clearInterval(t);
    }
    if (timeLeft === 0 && gameState === 'ANSWERING' && !isWhiteboardActive) {
      submitAnswer();
    }
  }, [gameState, timeLeft, isWhiteboardActive]);

  const submitAnswer = () => {
    if (gameStateRef.current === 'FEEDBACK') return;
    
    const correct = (currentProblem?.correctAnswer || "").trim().toUpperCase();
    const isPerfect = userAnswer.trim().toUpperCase() === correct;
    
    let points = 0;
    if (isPerfect) points = isHelpUsed ? 60 : 100;
    else points = isHelpUsed ? -40 : 0;

    const fb = { 
      isCorrect: isPerfect, 
      text: isPerfect ? `CHÍNH XÁC! (${points >= 0 ? '+' : ''}${points}đ)` : `SAI RỜI! (${points}đ). Đáp án: ${correct}`, 
      winner: 'YOU' 
    };
    
    setScore(s => s + points);
    setFeedback(fb); 
    setGameState('FEEDBACK'); 
    setFeedbackTimer(FEEDBACK_TIME);
    
    if (channelRef.current) {
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
          <button onClick={onExit} className="w-full py-6 bg-slate-900 text-white rounded-3xl font-black uppercase italic shadow-xl text-xl hover:scale-105 active:scale-95 transition-all">RỜI ARENA 🚪</button>
        </div>
      </div>
    );
  }

  // Màn hình giới thiệu vòng (Chỉ cho Arena đơn/PVP)
  if (gameState === 'ROUND_INTRO' && !isTeacherRoom) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="text-9xl mb-8 animate-bounce">⚔️</div>
        <h2 className="text-6xl font-black text-white uppercase italic mb-8">VÒNG {currentRoundIdx + 1}</h2>
        <div className="bg-white rounded-[3.5rem] p-10 shadow-2xl max-w-2xl w-full border-b-[12px] border-blue-600">
          <p className="text-slate-600 font-bold text-2xl italic uppercase tracking-widest">{currentRound?.description || "Chuẩn bị!"}</p>
        </div>
        <div className="mt-16 w-full max-w-md h-3 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 transition-all duration-100 ease-linear" style={{ width: `${(roundIntroTimer / ROUND_INTRO_TIME) * 100}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col p-3 overflow-hidden relative text-left">
      <ConfirmModal isOpen={showExitConfirm} title="Thoát trận đấu?" message="Kết quả hiện tại sẽ không được lưu lại!" onConfirm={onExit} onCancel={() => setShowExitConfirm(false)} isDestructive={true} />
      <ConfirmModal isOpen={showHelpConfirm} title="Sử dụng Trợ giúp?" message="Bạn chỉ nhận được tối đa 60% số điểm nếu trả lời đúng, và bị trừ 40đ nếu trả lời sai!" onConfirm={() => { setIsHelpUsed(true); setShowHelpConfirm(false); }} onCancel={() => setShowHelpConfirm(false)} />
      
      <header className="bg-white px-5 py-3 rounded-[2rem] shadow-md mb-4 flex items-center justify-between border-slate-200 border-b-4 relative z-50 shrink-0 gap-4">
        <div className="flex items-center gap-2 shrink-0">
           <div className="bg-blue-600 text-white px-4 py-1.5 rounded-full shadow-sm border-b-4 border-blue-800 flex items-center gap-2">
              <span className="text-[8px] font-black uppercase italic opacity-70">BẠN</span>
              <span className="text-sm font-black italic">{score}đ</span>
           </div>
           {isTeacherRoom && <span className="bg-emerald-100 text-emerald-600 text-[8px] font-black px-3 py-1.5 rounded-full border border-emerald-200 uppercase italic">LIVE: @{currentTeacher.magv}@</span>}
        </div>

        <div className="flex flex-col items-center flex-1">
           <div className={`text-2xl md:text-3xl font-black italic tabular-nums leading-none flex items-center gap-2 ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-slate-900'}`}>
              <span className="text-xs text-slate-300">⏱️</span> {timeLeft}s
           </div>
        </div>

        <button onClick={() => setShowExitConfirm(true)} className="w-8 h-8 md:w-10 md:h-10 bg-red-50 text-red-500 rounded-xl flex items-center justify-center font-black">✕</button>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 pb-10 min-h-0">
        <div className="lg:col-span-7 h-full overflow-hidden relative">
           {isWhiteboardActive ? (
             <div className="h-full rounded-[2.5rem] shadow-2xl border-4 border-slate-50 overflow-hidden bg-slate-900 animate-in fade-in">
               <Whiteboard isTeacher={false} channel={channelRef.current} roomCode="TEACHER_ROOM" />
             </div>
           ) : (
             <ProblemCard problem={currentProblem} isPaused={isWhiteboardActive} isHelpUsed={isHelpUsed} />
           )}
        </div>

        <div className="lg:col-span-5 bg-white rounded-[2.5rem] p-6 shadow-xl flex flex-col h-full relative overflow-y-auto no-scrollbar">
          {gameState === 'ANSWERING' || gameState === 'WAITING_FOR_BUZZER' ? (
            <div className="flex flex-col animate-in zoom-in w-full h-auto">
               <div className="flex justify-between items-center mb-4">
                  <div className="text-[10px] font-black text-slate-400 uppercase italic tracking-widest">
                    {gameState === 'WAITING_FOR_BUZZER' ? 'ĐANG ĐỢI TÍN HIỆU...' : 'NHẬP ĐÁP ÁN:'}
                  </div>
                  {!isHelpUsed && currentProblem?.challenge !== DisplayChallenge.NORMAL && (
                    <button onClick={() => setShowHelpConfirm(true)} className="bg-amber-100 text-amber-600 px-4 py-2 rounded-xl border border-amber-200 font-black text-[10px] uppercase italic hover:bg-amber-200 transition-all shadow-sm">💡 TRỢ GIÚP (60% ĐIỂM)</button>
                  )}
               </div>
               <AnswerInput problem={currentProblem} value={userAnswer} onChange={setUserAnswer} onSubmit={submitAnswer} disabled={gameState === 'WAITING_FOR_BUZZER'} />
               {gameState === 'ANSWERING' && (
                  <button onClick={submitAnswer} disabled={!userAnswer} className={`w-full py-5 rounded-[1.5rem] font-black italic text-lg mt-6 shadow-lg transition-all active:scale-95 shrink-0 border-b-6 ${userAnswer ? 'bg-blue-600 text-white border-blue-800' : 'bg-slate-100 text-slate-300 border-slate-200'}`}>XÁC NHẬN ĐÁP ÁN ✅</button>
               )}
            </div>
          ) : gameState === 'FEEDBACK' ? (
             <div className="flex flex-col animate-in zoom-in w-full h-auto">
                <div className={`text-2xl font-black uppercase italic mb-3 ${feedback?.isCorrect ? 'text-emerald-500' : 'text-blue-500'}`}>{feedback?.isCorrect ? 'CHÍNH XÁC!' : 'SAI RỜI!'}</div>
                <div className="space-y-4 w-full h-auto">
                   <div className="bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 italic font-bold text-slate-700"><LatexRenderer content={feedback?.text || ""} /></div>
                   <div className="bg-emerald-50/50 p-6 rounded-[1.5rem] border-2 border-emerald-100">
                      <h4 className="text-emerald-600 font-black uppercase text-[10px] mb-2">📖 GIẢI CHI TIẾT</h4>
                      <div className="text-slate-600 text-sm md:text-base italic leading-relaxed"><LatexRenderer content={currentProblem?.explanation || ""} /></div>
                   </div>
                </div>
                {isTeacherRoom ? (
                  <div className="mt-8 p-6 bg-slate-900 text-white rounded-[1.5rem] text-center italic font-black uppercase text-[10px] animate-pulse">
                    Vui lòng đợi Giáo Viên chuyển sang câu tiếp theo...
                  </div>
                ) : (
                  <div className="mt-8 flex flex-col gap-2">
                    <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                      <div className="h-full bg-blue-500 transition-all duration-100 ease-linear" style={{ width: `${(feedbackTimer / FEEDBACK_TIME) * 100}%` }} />
                    </div>
                  </div>
                )}
             </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default GameEngine;
