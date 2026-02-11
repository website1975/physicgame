
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, Teacher, Round, MatchData } from '../types';
import ProblemCard from './ProblemCard';
import AnswerInput from './AnswerInput';
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
  const [teacherNote, setTeacherNote] = useState('');
  
  const currentProblem = rounds[currentRoundIdx]?.problems?.[currentProblemIdx];

  const [timeLeft, setTimeLeft] = useState(DEFAULT_TIME);
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState<any>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  
  const roomCode = matchData?.joinedRoom?.code || '';
  const isTeacherRoom = roomCode === 'TEACHER_ROOM';
  const myUniqueId = matchData?.myId || 'temp_id';

  const channelRef = useRef<any>(null);

  const loadMatchSet = useCallback(async (setId: string) => {
    setIsLoading(true);
    try {
      const data = await fetchSetData(setId);
      if (data && data.rounds) setRounds(data.rounds);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
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
        .on('broadcast', { event: 'teacher_action' }, async ({ payload }) => {
          if (payload.type === 'SYNC_POSITION') {
            if (payload.setId && rounds.length === 0) await loadMatchSet(payload.setId);
            syncToProblem(payload.roundIdx, payload.probIdx);
          } else if (payload.type === 'SYNC_NOTE') {
            setTeacherNote(payload.text);
          }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ online: true, role: 'student', name: playerName });
          }
        });

      channelRef.current = channel;
      return () => { supabase.removeChannel(channel); };
    }
  }, [isTeacherRoom, currentTeacher?.id, playerName, myUniqueId, syncToProblem, loadMatchSet, rounds.length]);

  useEffect(() => {
    if (gameState === 'ANSWERING' && timeLeft > 0 && !isLoading) {
      const t = setInterval(() => setTimeLeft(p => Math.max(0, p - 1)), 1000);
      return () => clearInterval(t);
    }
  }, [gameState, timeLeft, isLoading]);

  const submitAnswer = () => {
    if (gameState === 'FEEDBACK' || !currentProblem) return;
    const correct = (currentProblem.correctAnswer || "").trim().toUpperCase();
    const isPerfect = userAnswer.trim().toUpperCase() === correct;
    setScore(s => s + (isPerfect ? 100 : 0));
    setFeedback({ isCorrect: isPerfect, text: isPerfect ? "CHÍNH XÁC!" : `ĐÁP ÁN: ${correct}` }); 
    setGameState('FEEDBACK'); 
  };

  if (isLoading || !currentProblem) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-white text-center">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-8"></div>
        <h2 className="text-2xl font-black italic uppercase tracking-widest animate-pulse">ĐỢI GIÁO VIÊN BẮT ĐẦU...</h2>
        <button onClick={onExit} className="mt-12 px-8 py-3 bg-white/5 text-slate-500 rounded-xl font-black uppercase text-[10px]">Thoát</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col p-4 relative text-left">
      <ConfirmModal isOpen={showExitConfirm} title="Thoát trận?" message="Kết quả sẽ bị hủy!" onConfirm={onExit} onCancel={() => setShowExitConfirm(false)} isDestructive={true} />
      
      <header className="bg-white px-8 py-4 rounded-[2.5rem] shadow-xl mb-4 flex items-center justify-between border-b-[6px] border-slate-200">
        <div className="bg-blue-600 text-white px-6 py-2 rounded-2xl font-black italic shadow-lg">{score}đ</div>
        <div className={`text-3xl font-black italic tabular-nums ${timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-slate-900'}`}>{timeLeft}s</div>
        <button onClick={() => setShowExitConfirm(true)} className="w-10 h-10 bg-red-50 text-red-500 rounded-xl font-black">✕</button>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0 overflow-hidden">
        {/* Cột trái: Câu hỏi */}
        <div className="lg:col-span-7 h-full flex flex-col gap-4">
           <div className="flex-1 min-h-0">
              <ProblemCard problem={currentProblem} />
           </div>
           {/* Ghi chú Live từ GV */}
           <div className={`bg-slate-900 rounded-[2rem] p-6 shadow-2xl border-4 border-slate-800 transition-all ${teacherNote ? 'opacity-100 scale-100' : 'opacity-30 scale-95'}`}>
              <h5 className="text-blue-400 font-black uppercase italic text-[9px] mb-2 tracking-widest flex items-center gap-2">
                 <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
                 Lời giảng của Giáo viên
              </h5>
              <div className="text-white font-medium text-lg italic leading-relaxed">
                 <LatexRenderer content={teacherNote || "Giáo viên đang chuẩn bị ghi chú..."} />
              </div>
           </div>
        </div>

        {/* Cột phải: Nhập liệu / Phản hồi */}
        <div className="lg:col-span-5 bg-white rounded-[3rem] p-10 shadow-2xl flex flex-col h-full overflow-y-auto no-scrollbar border-4 border-slate-50">
          {gameState === 'ANSWERING' ? (
            <div className="flex flex-col h-full animate-in zoom-in">
               <div className="flex-1">
                  <AnswerInput problem={currentProblem} value={userAnswer} onChange={setUserAnswer} onSubmit={submitAnswer} disabled={false} />
               </div>
               <button onClick={submitAnswer} disabled={!userAnswer} className={`w-full py-7 rounded-[2rem] font-black italic text-2xl mt-8 shadow-xl border-b-8 ${userAnswer ? 'bg-blue-600 text-white border-blue-800' : 'bg-slate-100 text-slate-300 border-slate-200'}`}>GỬI ĐÁP ÁN ✅</button>
            </div>
          ) : (
             <div className="flex flex-col h-full animate-in slide-in-from-right">
                <div className={`text-4xl font-black uppercase italic mb-6 text-center ${feedback?.isCorrect ? 'text-emerald-500' : 'text-rose-500'}`}>{feedback?.isCorrect ? 'CHÍNH XÁC!' : 'SAI RỒI!'}</div>
                <div className="bg-slate-50 p-6 rounded-3xl border-2 border-slate-100 italic font-bold text-slate-700 text-xl mb-6 text-center"><LatexRenderer content={feedback?.text || ""} /></div>
                <div className="flex-1 bg-emerald-50/50 p-8 rounded-[2.5rem] border-2 border-emerald-100 overflow-y-auto no-scrollbar">
                   <h4 className="text-emerald-600 font-black uppercase text-[10px] mb-3 tracking-widest">📖 GIẢI CHI TIẾT</h4>
                   <div className="text-slate-600 text-lg italic leading-relaxed"><LatexRenderer content={currentProblem?.explanation || ""} /></div>
                </div>
                <div className="mt-8 p-6 bg-slate-900 text-white rounded-[1.5rem] text-center italic font-black uppercase text-[10px] animate-pulse">Chờ lệnh từ Giáo viên...</div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameEngine;
