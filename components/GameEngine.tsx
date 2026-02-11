
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, Teacher, Round, QuestionType, DisplayChallenge, MatchData } from '../types';
import ProblemCard from './ProblemCard';
import AnswerInput from './AnswerInput';
import Whiteboard from './Whiteboard';
import LatexRenderer from './LatexRenderer';
import ConfirmModal from './ConfirmModal';
import { supabase, fetchSetData } from '../services/supabaseService';

const DEFAULT_TIME = 60;

interface GameEngineProps {
  gameState: GameState;
  setGameState: (s: GameState) => void;
  playerName: string;
  currentTeacher: Teacher;
  matchData: MatchData;
  onExit: () => void;
}

const GameEngine: React.FC<GameEngineProps> = ({ 
  gameState, setGameState, playerName, currentTeacher, matchData, onExit 
}) => {
  const [rounds, setRounds] = useState<Round[]>(matchData?.rounds || []);
  const [currentRoundIdx, setCurrentRoundIdx] = useState(0);
  const [currentProblemIdx, setCurrentProblemIdx] = useState(matchData.startIndex || 0); 
  const [score, setScore] = useState(0);
  const [isLoading, setIsLoading] = useState(!rounds.length);
  
  const currentProblem = rounds[currentRoundIdx]?.problems?.[currentProblemIdx];

  const [timeLeft, setTimeLeft] = useState(DEFAULT_TIME);
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState<any>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);
  
  const roomCode = matchData?.joinedRoom?.code || '';
  const isTeacherRoom = roomCode === 'TEACHER_ROOM';
  const myUniqueId = matchData?.myId || 'temp_id';

  const channelRef = useRef<any>(null);

  // Cơ chế tải dữ liệu bộ đề an toàn
  const loadMatchSet = useCallback(async (setId: string) => {
    setIsLoading(true);
    try {
      const data = await fetchSetData(setId);
      if (data && data.rounds) {
        setRounds(data.rounds);
      }
    } catch (e) {
      console.error("Lỗi khi tải dữ liệu trận đấu:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const syncToProblem = useCallback((roundIdx: number, probIdx: number) => {
    setUserAnswer(''); 
    setFeedback(null); 
    setCurrentRoundIdx(roundIdx);
    setCurrentProblemIdx(probIdx);
    setGameState('ANSWERING');
    setTimeLeft(DEFAULT_TIME);
  }, [setGameState]);

  useEffect(() => {
    if (isTeacherRoom && currentTeacher?.id) {
      const channel = supabase.channel(`room_TEACHER_LIVE_${currentTeacher.id}`, {
        config: { presence: { key: `${playerName}_${myUniqueId}` } }
      });

      channel
        .on('broadcast', { event: 'teacher_start_game' }, async ({ payload }) => {
          if (payload.setId) {
            await loadMatchSet(payload.setId);
            syncToProblem(payload.currentRoundIndex || 0, payload.currentQuestionIndex || 0);
          }
        })
        .on('broadcast', { event: 'teacher_next_question' }, ({ payload }) => {
          syncToProblem(payload.nextRoundIndex || 0, payload.nextIndex);
        })
        .on('broadcast', { event: 'teacher_toggle_whiteboard' }, ({ payload }) => {
          setIsWhiteboardActive(payload.active);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ online: true, role: 'student', name: playerName });
          }
        });

      channelRef.current = channel;
      return () => { supabase.removeChannel(channel); };
    }
  }, [isTeacherRoom, currentTeacher?.id, playerName, myUniqueId, syncToProblem, loadMatchSet]);

  useEffect(() => {
    if (gameState === 'ANSWERING' && timeLeft > 0 && !isWhiteboardActive && !isLoading) {
      const t = setInterval(() => setTimeLeft(p => Math.max(0, p - 1)), 1000);
      return () => clearInterval(t);
    }
  }, [gameState, timeLeft, isWhiteboardActive, isLoading]);

  const submitAnswer = () => {
    if (gameState === 'FEEDBACK' || !currentProblem) return;
    const correct = (currentProblem.correctAnswer || "").trim().toUpperCase();
    const isPerfect = userAnswer.trim().toUpperCase() === correct;
    const points = isPerfect ? 100 : 0;
    const fb = { isCorrect: isPerfect, text: isPerfect ? "CHÍNH XÁC!" : `ĐÁP ÁN ĐÚNG LÀ: ${correct}` };
    setScore(s => s + points);
    setFeedback(fb); 
    setGameState('FEEDBACK'); 
    if (channelRef.current) {
      channelRef.current.send({ type: 'broadcast', event: 'match_result', payload: { playerId: myUniqueId, feedback: fb } });
    }
  };

  // Màn hình chờ nếu dữ liệu chưa sẵn sàng
  if (isLoading || !currentProblem) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-white text-center">
        <div className="relative w-24 h-24 mb-10">
           <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full"></div>
           <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
        <h2 className="text-4xl font-black italic uppercase tracking-widest animate-pulse mb-4">Đợi giáo viên...</h2>
        <p className="text-slate-500 font-bold uppercase text-xs tracking-[0.4em] max-w-md leading-relaxed">
          Hệ thống đang sẵn sàng thiết lập Arena. Vui lòng không thoát ứng dụng.
        </p>
        <button onClick={onExit} className="mt-16 px-10 py-4 bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-500 rounded-2xl font-black uppercase text-[10px] border border-white/10 transition-all">Thoát phòng</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col p-4 relative text-left animate-in fade-in duration-700">
      <ConfirmModal isOpen={showExitConfirm} title="Thoát trận đấu?" message="Bạn sẽ không thể quay lại trận đấu này nếu thoát ra." onConfirm={onExit} onCancel={() => setShowExitConfirm(false)} isDestructive={true} />
      
      <header className="bg-white px-8 py-5 rounded-[2.5rem] shadow-xl mb-4 flex items-center justify-between border-b-[8px] border-slate-200 shrink-0">
        <div className="flex items-center gap-4">
           <div className="bg-blue-600 text-white px-6 py-2 rounded-2xl font-black italic shadow-lg text-xl">{score}đ</div>
           <div className="hidden md:block text-[10px] font-black text-slate-400 uppercase italic">Chiến binh: {playerName}</div>
        </div>
        <div className="flex flex-col items-center">
           <div className={`text-4xl font-black italic tabular-nums leading-none ${timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-slate-900'}`}>{timeLeft}s</div>
           <div className="text-[8px] font-black text-slate-300 uppercase tracking-widest mt-1">THỜI GIAN CÒN LẠI</div>
        </div>
        <button onClick={() => setShowExitConfirm(true)} className="w-12 h-12 bg-rose-50 text-rose-500 rounded-2xl font-black border-2 border-rose-100 hover:bg-rose-500 hover:text-white transition-all shadow-sm flex items-center justify-center">✕</button>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0 overflow-hidden">
        <div className="lg:col-span-7 h-full relative group">
           {isWhiteboardActive ? (
             <Whiteboard isTeacher={false} channel={channelRef.current} roomCode="TEACHER_ROOM" />
           ) : (
             <ProblemCard problem={currentProblem} isPaused={isWhiteboardActive} />
           )}
        </div>
        <div className="lg:col-span-5 bg-white rounded-[3rem] p-10 shadow-2xl flex flex-col h-full overflow-y-auto no-scrollbar border-4 border-slate-50">
          {gameState === 'ANSWERING' ? (
            <div className="flex flex-col h-full animate-in zoom-in duration-500">
               <div className="flex-1">
                  <AnswerInput problem={currentProblem} value={userAnswer} onChange={setUserAnswer} onSubmit={submitAnswer} disabled={false} />
               </div>
               <button onClick={submitAnswer} disabled={!userAnswer} className={`w-full py-8 rounded-[2rem] font-black italic text-2xl mt-8 shadow-2xl transition-all active:scale-95 border-b-8 ${userAnswer ? 'bg-blue-600 text-white border-blue-800' : 'bg-slate-100 text-slate-300 border-slate-200'}`}>XÁC NHẬN ĐÁP ÁN ✅</button>
            </div>
          ) : gameState === 'FEEDBACK' ? (
             <div className="flex flex-col h-full animate-in slide-in-from-right duration-500">
                <div className={`text-5xl font-black uppercase italic mb-6 text-center ${feedback?.isCorrect ? 'text-emerald-500' : 'text-rose-500'}`}>{feedback?.isCorrect ? 'TUYỆT VỜI!' : 'RẤT TIẾC!'}</div>
                <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-inner mb-8 text-center italic font-bold text-2xl border-b-8 border-slate-800">
                   <LatexRenderer content={feedback?.text || ""} />
                </div>
                <div className="flex-1 bg-emerald-50/50 p-10 rounded-[3rem] border-4 border-emerald-100 shadow-sm overflow-y-auto no-scrollbar">
                   <h4 className="text-emerald-700 font-black uppercase text-xs mb-4 flex items-center gap-2"><span>📚</span> GIẢI THÍCH CHI TIẾT</h4>
                   <div className="text-slate-600 text-xl italic leading-relaxed"><LatexRenderer content={currentProblem?.explanation || ""} /></div>
                </div>
                <div className="mt-10 p-6 bg-slate-900 text-white rounded-[1.8rem] text-center shadow-xl">
                   <div className="flex items-center justify-center gap-4">
                      <div className="w-3 h-3 bg-blue-500 rounded-full animate-ping"></div>
                      <span className="italic font-black uppercase text-[10px] tracking-widest">Đang chờ giáo viên chuyển câu...</span>
                   </div>
                </div>
             </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default GameEngine;
