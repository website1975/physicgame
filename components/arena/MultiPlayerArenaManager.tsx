
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
const ROUND_INTRO_TIME = 6; // Tăng thêm 1s để bù trừ độ trễ mạng

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
  
  // Khởi tạo bảng điểm với tên đối thủ từ matchData
  const [opponentScores, setOpponentScores] = useState<Record<string, OpponentData>>(() => {
    const initial: Record<string, OpponentData> = {};
    if (matchData.opponents) {
      matchData.opponents.forEach(p => {
        initial[p.id] = { 
          name: p.name, 
          shortId: p.id.slice(-3).toUpperCase(), 
          score: 0 
        };
      });
    }
    return initial;
  });

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
  const controlChannelRef = useRef<any>(null);
  
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
    } else { setGameState('GAME_OVER'); }
    setTimeout(() => { isTransitioning.current = false; }, 1000);
  }, [rounds, setGameState]);

  const startProblem = useCallback(() => {
    setUserAnswer(''); setFeedback(null); setBuzzerWinner(null); setIsHelpUsed(false); 
    setGameState('STARTING_ROUND');
    
    // Countdown 3s trước mỗi câu
    let count = 3;
    const interval = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(interval);
        setGameState((isArenaA || isTeacherRoom) ? 'ANSWERING' : 'WAITING_FOR_BUZZER');
      }
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
        config: { presence: { key: myPresenceKey } }
      });
      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const keys = Object.keys(state).sort();
          setIsMaster(keys[0] === myPresenceKey);
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
            setBuzzerWinner('OPPONENT'); setGameState('ANSWERING'); setTimeLeft(20);
          }
        })
        .on('broadcast', { event: 'match_result' }, ({ payload }) => {
          if (payload.playerId !== myUniqueId) {
            setOpponentScores(prev => {
              const currentData = prev[payload.playerId] || { name: payload.player, shortId: payload.playerId.slice(-3).toUpperCase(), score: 0 };
              return { ...prev, [payload.playerId]: { ...currentData, score: currentData.score + (payload.points || 0) } };
            });
            if (gameStateRef.current !== 'FEEDBACK') {
              setFeedback({ ...payload.feedback, winner: 'OPPONENT', winnerName: `${payload.player} #${payload.playerId.slice(-3).toUpperCase()}` });
              setGameState('FEEDBACK'); setFeedbackTimer(FEEDBACK_TIME);
            }
          }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') await channel.track({ role: 'player', joined_at: new Date().toISOString() });
        });
      channelRef.current = channel;
      return () => { supabase.removeChannel(channel); };
    }
  }, [isArenaA, isTeacherRoom, matchData.joinedRoom, playerName, myUniqueId, handleNext, startProblem, currentTeacher.id, buzzerWinner]);

  useEffect(() => {
    if (isTeacherRoom) {
      const channel = supabase.channel(`control_TEACHER_ROOM_${currentTeacher.id}`, { config: { presence: { key: myPresenceKey } } });
      channel
        .on('broadcast', { event: 'teacher_next_question' }, ({ payload }) => {
          if (payload && typeof payload.nextIndex === 'number') { setCurrentProblemIdx(payload.nextIndex); startProblem(); } 
          else handleNext();
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
      if (isArenaA) { handleNext(); } 
      else if (!isTeacherRoom) {
        if (isMaster) {
          channelRef.current?.send({ type: 'broadcast', event: 'match_next_question' });
          handleNext();
        } else { 
          // Safety timeout cho người chơi không phải master
          setTimeout(() => { if (gameStateRef.current === 'FEEDBACK') handleNext(); }, 2500); 
        }
      }
    }
  }, [feedbackTimer, gameState, isArenaA, isMaster, isTeacherRoom, handleNext]);

  useEffect(() => {
    // Xử lý Vòng giới thiệu
    if (gameState === 'ROUND_INTRO') {
      if (isArenaA) { 
        setTimeout(startProblem, ROUND_INTRO_TIME * 1000); 
      } 
      else if (!isTeacherRoom && isPresenceSynced) {
        if (isMaster) {
          // Master điều khiển thời gian intro
          setTimeout(() => {
            channelRef.current?.send({ type: 'broadcast', event: 'match_start_problem' });
            startProblem();
          }, ROUND_INTRO_TIME * 1000);
        } else { 
          // Người chơi thường đợi tín hiệu từ master hoặc tự vào sau một khoảng trễ an toàn
          setTimeout(() => { if (gameStateRef.current === 'ROUND_INTRO') startProblem(); }, (ROUND_INTRO_TIME + 2) * 1000); 
        }
      } else if (isTeacherRoom) {
         // Trong phòng giáo viên, intro chỉ là màn hình chờ
      }
    }
  }, [gameState, isArenaA, isMaster, isTeacherRoom, isPresenceSynced, startProblem]);

  useEffect(() => {
    if ((gameState === 'WAITING_FOR_BUZZER' || gameState === 'ANSWERING') && timeLeft > 0 && !isWhiteboardActive) {
      const t = setInterval(() => setTimeLeft(p => p - 1), 1000);
      return () => clearInterval(t);
    }
    if (timeLeft === 0 && !isWhiteboardActive) {
      if (gameState === 'ANSWERING' && buzzerWinner === 'YOU') { submitAnswer(); } 
      else if (gameState === 'WAITING_FOR_BUZZER') {
        setFeedback({ isCorrect: false, text: "HẾT GIỜ! KHÔNG AI GIÀNH QUYỀN TRẢ LỜI.", winner: 'NONE' });
        setGameState('FEEDBACK'); setFeedbackTimer(FEEDBACK_TIME);
      }
    }
  }, [gameState, timeLeft, buzzerWinner, isWhiteboardActive]);

  const submitAnswer = () => {
    const prob = rounds[currentRoundIdxRef.current]?.problems[currentProblemIdxRef.current];
    const correct = (prob?.correctAnswer || "").trim().toUpperCase();
    const isPerfect = userAnswer.trim().toUpperCase() === correct;
    const finalPoints = isPerfect ? (isHelpUsed ? 60 : 100) : 0;

    const fb = { isCorrect: isPerfect, text: isPerfect ? `CHÍNH XÁC! (+${finalPoints}đ)` : `SAI RỒI! Đúng là: ${correct}`, winner: 'YOU' };
    if (isPerfect) setScore(s => s + finalPoints);
    setFeedback(fb); setGameState('FEEDBACK'); setFeedbackTimer(FEEDBACK_TIME);
    
    if (isTeacherRoom) { controlChannelRef.current?.send({ type: 'broadcast', event: 'student_answer', payload: { playerName, playerId: myUniqueId, isCorrect: isPerfect, points: finalPoints } }); } 
    else { channelRef.current?.send({ type: 'broadcast', event: 'match_result', payload: { player: playerName, playerId: myUniqueId, points: finalPoints, feedback: fb } }); }
  };

  if (gameState === 'GAME_OVER') {
    const all = [{ name: 'BẠN', score, isMe: true }, ...Object.values(opponentScores).map(o => ({ name: o.name, score: o.score, isMe: false }))].sort((a,b) => b.score - a.score);
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-left">
        <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-2xl w-full text-center border-b-[12px] border-blue-600 animate-in zoom-in duration-500">
          <div className="text-8xl mb-8">🏆</div>
          <h2 className="text-4xl font-black text-slate-800 uppercase italic mb-12">KẾT THÚC</h2>
          <div className="bg-slate-50 p-8 rounded-[3rem] border-4 border-slate-100 mb-12 space-y-4">
             {all.map((p, i) => (
               <div key={i} className={`flex items-center justify-between p-5 rounded-2xl ${p.isMe ? 'bg-blue-600 text-white' : 'bg-white border-2 border-slate-100 text-slate-700'}`}>
                  <div className="flex items-center gap-4"><span className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-black">{i+1}</span><span className="font-black uppercase italic">{p.name}</span></div>
                  <div className="text-2xl font-black italic">{p.score}đ</div>
               </div>
             ))}
          </div>
          <button onClick={onExit} className="w-full py-6 bg-slate-900 text-white rounded-3xl font-black uppercase italic text-xl shadow-xl hover:scale-105 active:scale-95 border-b-8 border-slate-950">RỜI ARENA 🚪</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col p-4 overflow-hidden relative text-left">
      <ConfirmModal isOpen={showHelpConfirm} title="Dùng trợ giúp?" message="Bạn chỉ nhận được tối đa 60% số điểm!" confirmText="Đồng ý!" cancelText="Hủy" onConfirm={() => { setIsHelpUsed(true); setShowHelpConfirm(false); }} onCancel={() => setShowHelpConfirm(false)} />
      {isWhiteboardActive && <div className="fixed inset-0 z-[10000] p-4 bg-slate-950/98 backdrop-blur-3xl flex flex-col items-center justify-center"><div className="w-full h-full max-w-[95vw] max-h-[90vh] relative shadow-2xl"><Whiteboard isTeacher={false} channel={controlChannelRef.current} roomCode="TEACHER_ROOM" /></div></div>}

      <header className="bg-white px-6 py-4 rounded-[2.5rem] shadow-lg mb-4 flex items-center gap-4 relative z-50 overflow-x-auto no-scrollbar border-b-4 border-slate-200">
        <div className="flex items-center gap-3 shrink-0">
           <div className="bg-blue-600 text-white px-6 py-2.5 rounded-[1.8rem] shadow-md border-b-4 border-blue-800 flex flex-col items-center min-w-[130px]">
              <div className="text-[10px] font-black uppercase tracking-tighter italic opacity-80 leading-none mb-1">BẠN</div>
              <div className="text-2xl font-black leading-none">{score}đ</div>
           </div>
        </div>

        {!isArenaA && !isTeacherRoom && (
           <div className="flex items-center gap-3 border-l-2 border-slate-100 pl-4 shrink-0">
              {Object.entries(opponentScores).map(([id, data]) => (
                 <div key={id} className="bg-slate-900 text-white px-6 py-2.5 rounded-[1.8rem] shadow-md border-b-4 border-slate-800 flex flex-col items-center min-w-[120px]">
                    <div className="text-[10px] font-black uppercase tracking-tighter italic opacity-80 leading-none mb-1 truncate max-w-[100px]">{data.name}</div>
                    <div className="text-xl font-black leading-none">{data.score}đ</div>
                 </div>
              ))}
           </div>
        )}

        <div className="flex-1"></div>
        <div className="flex items-center gap-4 shrink-0">
           {currentProblem?.challenge !== DisplayChallenge.NORMAL && (gameState === 'ANSWERING' || gameState === 'WAITING_FOR_BUZZER') && (
             <button onClick={() => !isHelpUsed && setShowHelpConfirm(true)} disabled={isHelpUsed} className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase italic transition-all border-b-4 ${isHelpUsed ? 'bg-slate-100 text-slate-300' : 'bg-emerald-100 text-emerald-600 border-emerald-300 hover:bg-emerald-500 hover:text-white'}`}>💡 Trợ giúp</button>
           )}
           <div className="flex flex-col items-center">
             <div className="text-[9px] font-black text-slate-400 uppercase italic mb-0.5">THỜI GIAN</div>
             <div className={`text-4xl font-black italic tabular-nums leading-none ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-slate-900'}`}>{timeLeft}s</div>
           </div>
           <button onClick={() => setShowExitConfirm(true)} className="w-12 h-12 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center font-black hover:bg-red-500 hover:text-white transition-all shadow-sm">✕</button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0 overflow-hidden">
        <div className="lg:col-span-7 h-full overflow-hidden">
          {gameState === 'ROUND_INTRO' ? (
            <div className="h-full bg-white rounded-[3rem] p-12 shadow-inner flex flex-col items-center justify-center text-center animate-in zoom-in">
               <div className="text-9xl mb-8 animate-bounce">⚔️</div>
               <h2 className="text-5xl font-black text-slate-800 uppercase italic mb-4">SẴN SÀNG CHIẾN ĐẤU</h2>
               <p className="text-slate-400 font-bold text-lg italic uppercase tracking-widest">Vòng {rounds[currentRoundIdx].number}: {rounds[currentRoundIdx].description || 'Bắt đầu thử thách!'}</p>
            </div>
          ) : (
            <ProblemCard problem={currentProblem} isPaused={isWhiteboardActive} isHelpUsed={isHelpUsed} />
          )}
        </div>
        <div className="lg:col-span-5 bg-white rounded-[3rem] p-8 shadow-xl flex flex-col relative h-full overflow-hidden">
          {gameState === 'ROUND_INTRO' ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
               <div className="text-3xl font-black text-blue-600 uppercase italic mb-2">ĐỐI THỦ CỦA BẠN</div>
               <div className="space-y-4 w-full px-10">
                  {Object.values(opponentScores).map((op, i) => (
                    <div key={i} className="bg-slate-900 text-white p-6 rounded-3xl font-black uppercase italic text-xl shadow-lg border-b-8 border-slate-800">
                       👤 {op.name}
                    </div>
                  ))}
               </div>
               <div className="mt-12 text-[10px] font-black text-slate-300 uppercase italic animate-pulse tracking-widest">TRẬN ĐẤU SẼ BẮT ĐẦU SAU GIÂY LÁT...</div>
            </div>
          ) : gameState === 'FEEDBACK' ? (
            <div className="h-full flex flex-col animate-in fade-in zoom-in overflow-hidden">
              <div className="flex justify-between items-center mb-2 px-2"><div className={`text-3xl font-black uppercase italic ${feedback?.isCorrect ? 'text-emerald-500' : 'text-blue-500'}`}>{feedback?.isCorrect ? 'CHÍNH XÁC!' : 'SAI RỒI!'}</div><div className="bg-slate-900 text-white px-4 py-1.5 rounded-xl font-black text-[10px]"><span className="text-yellow-400">{feedbackTimer}s</span></div></div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full mb-4 overflow-hidden"><div className="h-full bg-yellow-400 transition-all duration-1000 ease-linear" style={{ width: `${(feedbackTimer / FEEDBACK_TIME) * 100}%` }} /></div>
              <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 px-2 pb-4">
                 {feedback?.winnerName && <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 text-[10px] font-black uppercase italic text-blue-600">🔥 {feedback.winnerName} ĐÃ TRẢ LỜI</div>}
                 <div className="bg-slate-50 p-5 rounded-3xl border-2 border-slate-100 italic font-bold text-slate-700"><LatexRenderer content={feedback?.text || ""} /></div>
                 <div className="bg-emerald-50/50 p-6 rounded-[2rem] border-2 border-emerald-100 mb-4"><h4 className="text-emerald-600 font-black uppercase text-[10px] mb-3">📖 LỜI GIẢI CHI TIẾT</h4><div className="text-slate-600 text-sm italic leading-relaxed"><LatexRenderer content={currentProblem?.explanation || ""} /></div></div>
              </div>
            </div>
          ) : gameState === 'WAITING_FOR_BUZZER' ? (
            <div className="h-full flex flex-col items-center justify-center text-center animate-in fade-in">
               <div className="text-5xl mb-4 animate-bounce">🔔</div>
               <h3 className="text-2xl font-black text-slate-800 uppercase italic mb-8">NHẤN CHUÔNG ĐỂ GIÀNH QUYỀN!</h3>
               <button onClick={() => !buzzerWinner && (channelRef.current?.send({ type: 'broadcast', event: 'buzzer_signal', payload: { player: playerName, playerId: myUniqueId } }), setBuzzerWinner('YOU'), setGameState('ANSWERING'), setTimeLeft(20))} className="w-44 h-44 bg-red-600 rounded-full border-[12px] border-red-800 shadow-[0_15px_0_#991b1b,0_25px_50px_rgba(220,38,38,0.3)] hover:scale-105 active:translate-y-3 transition-all flex items-center justify-center"><span className="text-white font-black text-2xl uppercase italic text-center">GIÀNH<br/>QUYỀN!</span></button>
            </div>
          ) : gameState === 'ANSWERING' && buzzerWinner === 'OPPONENT' ? (
            <div className="h-full flex flex-col items-center justify-center text-center animate-in slide-in-from-right"><div className="w-20 h-20 border-6 border-slate-100 border-t-blue-600 rounded-full animate-spin mb-8"></div><div className="bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-2xl w-full"><h3 className="text-xl font-black uppercase italic mb-1 text-blue-400">TẠM DỪNG!</h3><p className="font-bold text-slate-400 italic text-xs">Đối thủ đang trả lời...</p></div></div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden"><div className="flex-1 min-h-0"><AnswerInput problem={currentProblem} value={userAnswer} onChange={setUserAnswer} onSubmit={() => submitAnswer()} disabled={false} /></div><button onClick={() => submitAnswer()} className="w-full py-5 bg-slate-900 text-white rounded-[1.8rem] font-black italic text-lg mt-4 shadow-lg border-b-6 border-slate-950">NỘP ĐÁP ÁN ✅</button></div>
          )}
        </div>
      </div>
      <ConfirmModal isOpen={showExitConfirm} title="Dừng trận đấu?" message="Bạn muốn rời khỏi ngay bây giờ?" onConfirm={onExit} onCancel={() => setShowExitConfirm(false)} isDestructive={true} />
    </div>
  );
};

export default GameEngine;
