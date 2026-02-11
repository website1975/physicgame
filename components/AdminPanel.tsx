
import React, { useState, useEffect, useRef } from 'react';
import { PhysicsProblem, Round, Difficulty, QuestionType, DisplayChallenge, GameState, GameSettings, InteractiveMechanic, Player, AdminTab } from '../types';
import Whiteboard from './Whiteboard';
import { supabase } from '../services/supabaseService';

interface AdminPanelProps {
  rounds: Round[];
  setRounds: (rounds: Round[]) => void;
  settings: GameSettings;
  setSettings: (s: GameSettings) => void;
  onStartGame: (roomCode?: string) => void;
  currentGameState: GameState;
  onNextQuestion: () => void;
  currentProblemIdx: number;
  totalProblems: number;
  players?: Player[];
  myPlayerId?: string;
  teacherId: string;
  examSets: any[];
  onSaveSet: (title: string, asNew: boolean, topic: string, grade: string) => Promise<void>; 
  adminTab: AdminTab;
  setAdminTab: (tab: AdminTab) => void;
  loadedSetTitle: string | null;
  loadedSetId: string | null;
  loadedSetTopic?: string | null;
  categories: string[];
  fullView?: boolean;
  onResetToNew: () => void;
  onLoadSet: (setId: string, title: string) => Promise<boolean>;
  liveSessionKey?: number;
}

interface StudentStatus {
  name: string;
  answered: boolean;
  isCorrect: boolean;
  score: number;
}

const AdminPanel: React.FC<AdminPanelProps> = (props) => {
  const { 
    rounds = [], setRounds, onSaveSet, loadedSetTitle, loadedSetId, 
    loadedSetTopic, teacherId, adminTab, setAdminTab, onStartGame,
    onNextQuestion, currentProblemIdx, totalProblems, examSets
  } = props;

  const [activeRoundIdx, setActiveRoundIdx] = useState(0);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [status, setStatus] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [currentTitle, setCurrentTitle] = useState(loadedSetTitle || '');
  const [currentTopic, setCurrentTopic] = useState(loadedSetTopic || 'Khác');
  const [currentGrade, setCurrentGrade] = useState('10');
  const [teacherMaGV, setTeacherMaGV] = useState('');

  // --- LIVE CONTROL STATES ---
  const [connectedStudents, setConnectedStudents] = useState<Record<string, StudentStatus>>({});
  const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);
  const [isLiveGameActive, setIsLiveGameActive] = useState(false);
  const [liveRoundIdx, setLiveRoundIdx] = useState(0);
  const [liveProblemIdx, setLiveProblemIdx] = useState(0); 
  const controlChannelRef = useRef<any>(null);

  const LIVE_CHANNEL_NAME = `room_TEACHER_LIVE_${teacherId}`;

  useEffect(() => {
    if (adminTab === 'CONTROL' && teacherId) {
      const channel = supabase.channel(LIVE_CHANNEL_NAME, {
        config: { presence: { key: 'teacher' } }
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const students: Record<string, StudentStatus> = {};
          
          Object.keys(state).forEach(key => {
            if (key !== 'teacher') {
              const name = key.split('_')[0];
              students[key] = {
                name: name,
                answered: false,
                isCorrect: false,
                score: 0
              };
            }
          });
          
          setConnectedStudents(prev => {
            const next = { ...students };
            Object.keys(prev).forEach(key => {
              if (prev[key]) {
                next[key].answered = prev[key].answered;
                next[key].isCorrect = prev[key].isCorrect;
              }
            });
            return next;
          });
        })
        .on('broadcast', { event: 'match_result' }, ({ payload }) => {
          setConnectedStudents(prev => {
            const key = Object.keys(prev).find(k => k.includes(payload.playerId)) || payload.player;
            if (!key) return prev;
            return {
              ...prev,
              [key]: { 
                ...prev[key], 
                answered: true, 
                isCorrect: payload.feedback?.isCorrect || false
              }
            };
          });
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ role: 'teacher', online_at: new Date().toISOString() });
          }
        });

      controlChannelRef.current = channel;
      return () => { supabase.removeChannel(channel); };
    }
  }, [adminTab, teacherId]);

  useEffect(() => {
    const fetchGV = async () => {
      const { data } = await supabase.from('giaovien').select('magv').eq('id', teacherId).single();
      if (data) setTeacherMaGV(data.magv);
    };
    fetchGV();
  }, [teacherId]);

  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    setStatus({ text, type });
    setTimeout(() => setStatus(null), 3000);
  };

  const handleStartLiveMatch = () => {
    if (!rounds || rounds.length === 0 || !rounds[0]?.problems) {
      notify("Dữ liệu bộ đề rỗng hoặc chưa tải!", "error");
      return;
    }
    
    setIsLiveGameActive(true);
    setLiveProblemIdx(0);
    setLiveRoundIdx(0);
    
    setConnectedStudents(prev => {
      const reset = { ...prev };
      Object.keys(reset).forEach(k => reset[k].answered = false);
      return reset;
    });

    if (controlChannelRef.current) {
      controlChannelRef.current.send({
        type: 'broadcast',
        event: 'teacher_start_game',
        payload: { 
          setId: loadedSetId, 
          teacherId: teacherId,
          currentQuestionIndex: 0,
          currentRoundIndex: 0
        }
      });
      notify("🚀 ĐÃ KÍCH HOẠT ARENA!");
    }
  };

  const handleNextLiveQuestion = () => {
    if (!rounds || rounds.length === 0) return;
    
    const currentRound = rounds[liveRoundIdx];
    const currentProblems = currentRound?.problems || [];
    let nextProb = liveProblemIdx + 1;
    let nextRound = liveRoundIdx;
    
    if (nextProb >= currentProblems.length) {
      if (liveRoundIdx + 1 < rounds.length) {
        nextRound++;
        nextProb = 0;
      } else {
        notify("Đã hoàn thành toàn bộ câu hỏi!");
        return;
      }
    }

    setLiveProblemIdx(nextProb);
    setLiveRoundIdx(nextRound);
    
    setConnectedStudents(prev => {
      const reset = { ...prev };
      Object.keys(reset).forEach(k => reset[k].answered = false);
      return reset;
    });

    if (controlChannelRef.current) {
      controlChannelRef.current.send({ 
        type: 'broadcast', 
        event: 'teacher_next_question', 
        payload: { 
          nextIndex: nextProb,
          nextRoundIndex: nextRound
        } 
      });
    }
  };

  const toggleWhiteboard = () => {
    const newState = !isWhiteboardActive;
    setIsWhiteboardActive(newState);
    if (controlChannelRef.current) {
      controlChannelRef.current.send({ 
        type: 'broadcast', 
        event: 'teacher_toggle_whiteboard', 
        payload: { active: newState } 
      });
    }
  };

  if (adminTab === 'CONTROL') {
    // Luôn kiểm tra rounds tồn tại trước khi truy cập
    const currentRound = (rounds && rounds[liveRoundIdx]) ? rounds[liveRoundIdx] : null;
    const totalQInCurrentRound = currentRound?.problems?.length || 0;
    const answeredCount = Object.values(connectedStudents).filter(s => s.answered).length;
    const totalConnected = Object.keys(connectedStudents).length;

    return (
      <div className="flex flex-col gap-6 animate-in fade-in duration-500 text-left h-full">
         <header className="bg-white p-8 rounded-[3rem] shadow-xl border-b-[10px] border-slate-100 flex flex-col md:flex-row items-center justify-between gap-8 shrink-0">
            <div className="flex items-center gap-8">
               <div className="bg-slate-900 text-white p-6 rounded-[2.5rem] text-center min-w-[200px] shadow-2xl border-b-8 border-blue-600 relative">
                  <span className="text-[10px] font-black uppercase text-blue-400 block mb-1">MÃ PHÒNG</span>
                  <div className="text-4xl font-black tracking-widest uppercase italic leading-none">@{teacherMaGV || '...'}@</div>
                  <div className="absolute -top-3 -right-3 bg-red-500 text-white text-[10px] font-black px-3 py-1 rounded-xl animate-pulse">LIVE</div>
               </div>
               <div className="text-left">
                  <h3 className="text-3xl font-black text-slate-800 uppercase italic leading-none">BẢNG ĐIỀU KHIỂN</h3>
                  <p className="text-xs font-black text-slate-400 uppercase mt-3 italic tracking-widest leading-none flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isLiveGameActive ? 'bg-emerald-500 animate-ping' : 'bg-slate-300'}`}></span>
                    {isLiveGameActive ? 'HỆ THỐNG ĐANG PHÁT TÍN HIỆU' : 'PHÒNG CHỜ TÍN HIỆU'}
                  </p>
               </div>
            </div>
            
            <div className="flex gap-4">
               <button onClick={toggleWhiteboard} className={`px-10 py-6 rounded-[2rem] font-black uppercase italic shadow-lg transition-all flex items-center gap-3 border-b-8 ${isWhiteboardActive ? 'bg-emerald-600 text-white border-emerald-800' : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'}`}>
                 <span className="text-2xl">🎨</span> {isWhiteboardActive ? 'ĐANG GIẢNG BÀI' : 'BẢNG TRẮNG'}
               </button>
               {!isLiveGameActive ? (
                 <button onClick={handleStartLiveMatch} className="px-12 py-6 bg-blue-600 text-white rounded-[2rem] font-black uppercase italic shadow-2xl hover:scale-105 transition-all flex items-center gap-4 border-b-8 border-blue-800">
                   <span className="text-2xl">⚡</span> PHÁT TRẬN ĐẤU
                 </button>
               ) : (
                 <button onClick={handleNextLiveQuestion} className="px-12 py-6 bg-amber-500 text-white rounded-[2rem] font-black uppercase italic shadow-2xl hover:scale-105 transition-all flex items-center gap-4 border-b-8 border-amber-700">
                   <span className="text-2xl">⏩</span> CÂU KẾ TIẾP
                 </button>
               )}
            </div>
         </header>

         <div className="grid grid-cols-12 gap-8 items-start flex-1 min-h-0">
            <div className="col-span-12 lg:col-span-8 h-full">
               <div className="bg-slate-900 rounded-[4rem] border-[12px] border-slate-800 shadow-2xl overflow-hidden relative h-full flex flex-col">
                  {isWhiteboardActive ? (
                    <Whiteboard isTeacher={true} channel={controlChannelRef.current} roomCode="TEACHER_ROOM" />
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center relative p-12">
                       {isLiveGameActive ? (
                         <div className="flex flex-col items-center animate-in zoom-in duration-500">
                            <div className="text-slate-500 font-black uppercase tracking-[0.5em] mb-6 text-sm italic">ĐANG TRÌNH CHIẾU</div>
                            <div className="flex items-baseline gap-4 mb-10">
                               <span className="text-[12rem] font-black text-white italic leading-none drop-shadow-[0_10px_30px_rgba(59,130,246,0.3)]">{liveProblemIdx + 1}</span>
                               <span className="text-4xl font-black text-slate-600 italic uppercase">/ {totalQInCurrentRound}</span>
                            </div>
                            <div className="bg-white/5 backdrop-blur-md px-12 py-6 rounded-[2.5rem] border border-white/10 flex items-center gap-8">
                               <div className="text-left">
                                  <div className="text-[10px] font-black text-blue-400 uppercase italic mb-1">TRẠNG THÁI VÒNG</div>
                                  <div className="text-2xl font-black text-white italic">VÒNG SỐ {liveRoundIdx + 1}</div>
                               </div>
                               <div className="w-[2px] h-10 bg-white/10"></div>
                               <div className="text-left">
                                  <div className="text-[10px] font-black text-emerald-400 uppercase italic mb-1">ĐÃ TRẢ LỜI</div>
                                  <div className="text-2xl font-black text-white italic">{answeredCount} / {totalConnected}</div>
                               </div>
                            </div>
                         </div>
                       ) : (
                         <div className="flex flex-col items-center opacity-40">
                            <div className="text-9xl mb-8 animate-pulse">📡</div>
                            <p className="font-black uppercase italic tracking-[0.3em] text-3xl text-white">READY FOR SIGNAL</p>
                         </div>
                       )}
                    </div>
                  )}
               </div>
            </div>

            <div className="col-span-12 lg:col-span-4 flex flex-col gap-8 h-full min-h-0">
               <div className="bg-white p-8 rounded-[3.5rem] border-4 border-slate-50 shadow-xl flex flex-col h-full min-h-0">
                  <h4 className="text-xl font-black text-slate-800 uppercase italic mb-6 flex justify-between items-center border-b-2 border-slate-50 pb-4">
                    <span>👥 LỚP HỌC</span>
                    <span className="bg-blue-600 text-white px-4 py-1 rounded-xl text-xs shadow-lg">{totalConnected}</span>
                  </h4>
                  <div className="flex-1 overflow-y-auto no-scrollbar space-y-3">
                     {Object.values(connectedStudents).map((s, i) => (
                        <div key={i} className={`flex items-center gap-4 py-4 px-6 rounded-[1.8rem] border-2 transition-all ${s.answered ? (s.isCorrect ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100') : 'bg-slate-50 border-transparent'}`}>
                           <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-inner ${s.answered ? (s.isCorrect ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white') : 'bg-white text-slate-300'}`}>
                             {s.answered ? (s.isCorrect ? '✓' : '✕') : '👤'}
                           </div>
                           <div className="flex-1">
                              <div className="font-black text-slate-700 uppercase italic text-sm">{s.name}</div>
                              <div className="text-[9px] font-black uppercase opacity-40 tracking-widest mt-1">
                                {s.answered ? (s.isCorrect ? 'ĐÃ PHẢN HỒI' : 'CHƯA TRẢ LỜI') : 'ĐANG SUY NGHĨ...'}
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
         </div>
      </div>
    );
  }

  return (
    <div className="bg-[#f8fafc] min-h-full flex flex-col gap-4 relative no-scrollbar text-left">
      {status && <div className={`fixed top-6 left-1/2 -translate-x-1/2 px-10 py-4 rounded-full font-black text-xs uppercase shadow-2xl z-[10000] animate-in slide-in-from-top-4 ${status.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'} text-white`}>{status.text}</div>}
      <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border-4 border-slate-100 flex flex-col gap-6 shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 flex-1">
            <div className="text-4xl bg-emerald-50 w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner">📗</div>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-6">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block italic">Tên bộ đề</label>
                <input type="text" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-3 font-black text-slate-700 outline-none focus:border-blue-200 text-sm" value={currentTitle} onChange={e => setCurrentTitle(e.target.value)} placeholder="Tên bộ đề..." />
              </div>
              <div className="md:col-span-4">
                <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1 block italic">Chủ đề</label>
                <input type="text" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-3 font-black text-blue-600 outline-none focus:border-blue-200 text-sm" value={currentTopic} onChange={e => setCurrentTopic(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block italic">Khối</label>
                <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-black text-slate-700 text-sm outline-none" value={currentGrade} onChange={e => setCurrentGrade(e.target.value)}>
                  {['10', '11', '12'].map(g => <option key={g} value={g}>K{g}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => onSaveSet(currentTitle, !loadedSetId, currentTopic, currentGrade)} className="px-12 py-6 bg-blue-600 text-white rounded-[2rem] font-black uppercase italic shadow-lg text-sm">LƯU ĐỀ</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        <div className="lg:col-span-3 flex flex-col gap-4 max-h-full overflow-hidden">
          <div className="bg-white p-4 rounded-3xl border-4 border-slate-50 shadow-sm flex items-center gap-3 overflow-x-auto no-scrollbar shrink-0">
             {rounds?.map((r, i) => (
                <button key={i} onClick={() => { setActiveRoundIdx(i); setEditingIdx(null); }} className={`px-6 py-3 rounded-2xl text-[11px] font-black uppercase border-2 transition-all shrink-0 ${activeRoundIdx === i ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>Vòng {r.number}</button>
             ))}
             <button onClick={() => { setRounds([...(rounds || []), { number: (rounds?.length || 0) + 1, problems: [], description: '' }]); setActiveRoundIdx(rounds?.length || 0); }} className="px-6 py-3 rounded-2xl text-[11px] font-black text-blue-600 border-2 border-dashed border-blue-200 uppercase">+ VÒNG</button>
          </div>
          <div className="bg-white rounded-[2rem] p-5 shadow-md border-2 border-slate-50 flex-1 overflow-y-auto no-scrollbar flex flex-col gap-4">
              {rounds?.[activeRoundIdx]?.problems?.map((p, i) => (
                <button key={p.id} onClick={() => setEditingIdx(i)} className={`w-full p-4 rounded-2xl text-left border-4 transition-all ${editingIdx === i ? 'bg-blue-600 border-blue-400 text-white shadow-lg' : 'bg-slate-50 border-white text-slate-500 hover:bg-slate-100'}`}>
                  <div className="text-[11px] font-black uppercase italic">Câu {i+1}</div>
                  <div className="text-[9px] font-bold opacity-70 uppercase truncate">{p.content || 'Nội dung mới...'}</div>
                </button>
              ))}
              <button onClick={() => {
                const newProb = { id: Math.random().toString(36).substring(7), title: 'Câu hỏi mới', content: '', type: QuestionType.MULTIPLE_CHOICE, difficulty: Difficulty.EASY, challenge: DisplayChallenge.NORMAL, topic: currentTopic, correctAnswer: 'A', explanation: '', options: ['', '', '', ''] };
                const updated = [...(rounds || [])];
                if (!updated[activeRoundIdx]) updated[activeRoundIdx] = { number: activeRoundIdx + 1, problems: [] };
                updated[activeRoundIdx].problems.push(newProb);
                setRounds(updated);
                setEditingIdx(updated[activeRoundIdx].problems.length - 1);
              }} className="w-full py-4 border-2 border-dashed border-slate-200 text-slate-400 rounded-2xl font-black uppercase italic text-[10px] hover:border-blue-400 hover:text-blue-500 transition-all">+ THÊM CÂU HỎI</button>
          </div>
        </div>

        <div className="lg:col-span-9 bg-white rounded-[3rem] shadow-xl p-10 overflow-y-auto no-scrollbar border-4 border-slate-50 relative">
          {editingIdx !== null && rounds?.[activeRoundIdx]?.problems?.[editingIdx] ? (
            <div className="max-w-4xl mx-auto space-y-10 pb-20 animate-in fade-in">
                <div className="flex justify-between items-center border-b-4 border-slate-50 pb-6">
                  <h3 className="text-3xl font-black italic uppercase">Câu {editingIdx + 1}</h3>
                  <button onClick={() => {
                    const updated = [...(rounds || [])];
                    updated[activeRoundIdx].problems.splice(editingIdx, 1);
                    setRounds(updated);
                    setEditingIdx(null);
                  }} className="text-red-500 font-black uppercase italic text-[10px]">Xóa câu hỏi ✕</button>
                </div>
                <div className="space-y-4">
                   <label className="text-[10px] font-black text-slate-400 uppercase italic">Nội dung câu hỏi</label>
                   <textarea className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl font-bold text-xl min-h-[120px]" value={rounds[activeRoundIdx].problems[editingIdx].content} onChange={e => {
                     const updated = [...(rounds || [])];
                     updated[activeRoundIdx].problems[editingIdx].content = e.target.value;
                     setRounds(updated);
                   }} />
                </div>
                <div className="bg-emerald-50/30 p-8 rounded-[3rem] border-2 border-emerald-100">
                   <h4 className="text-xl font-black text-emerald-700 uppercase italic mb-4">📖 LỜI GIẢI CHI TIẾT</h4>
                   <textarea className="w-full p-6 bg-white border-2 border-emerald-100 rounded-3xl font-medium min-h-[150px]" value={rounds[activeRoundIdx].problems[editingIdx].explanation} onChange={e => {
                     const updated = [...(rounds || [])];
                     updated[activeRoundIdx].problems[editingIdx].explanation = e.target.value;
                     setRounds(updated);
                   }} />
                </div>
            </div>
          ) : <div className="h-full flex flex-col items-center justify-center opacity-20 text-center"><div className="text-[10rem] mb-6 select-none">✏️</div><p className="font-black uppercase italic tracking-widest text-2xl text-slate-400">CHỌN CÂU HỎI ĐỂ SOẠN THẢO</p></div>}
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
