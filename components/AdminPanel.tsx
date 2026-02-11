
import React, { useState, useEffect, useRef } from 'react';
import { PhysicsProblem, Round, Difficulty, QuestionType, DisplayChallenge, GameState, GameSettings, InteractiveMechanic, Player, AdminTab } from '../types';
import LatexRenderer from './LatexRenderer';
import Whiteboard from './Whiteboard';
import { fetchQuestionsLibrary, uploadQuestionImage, supabase } from '../services/supabaseService';
import { parseQuestionsFromText } from '../services/geminiService';
import ConfirmModal from './ConfirmModal';

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
    rounds, setRounds, onSaveSet, loadedSetTitle, loadedSetId, 
    loadedSetTopic, teacherId, adminTab, setAdminTab, onStartGame,
    onNextQuestion, currentProblemIdx, totalProblems, examSets,
    liveSessionKey
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

  // Đảm bảo kênh Live được thiết lập ngay khi vào tab Control
  useEffect(() => {
    if (adminTab === 'CONTROL' && teacherId) {
      console.log("Establishing Teacher Control Channel:", LIVE_CHANNEL_NAME);
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
                isCorrect: payload.feedback.isCorrect 
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
    if (Object.keys(connectedStudents).length === 0) {
      notify("Cần ít nhất 1 học sinh tham gia!", "error");
      return;
    }
    if (rounds.length === 0 || !rounds[0].problems.length) {
      notify("Vui lòng soạn đề hoặc chọn bộ đề trước!", "error");
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
          setId: loadedSetId || 'live_manual', 
          title: loadedSetTitle || currentTitle, 
          rounds: rounds, 
          currentQuestionIndex: 0,
          currentRoundIndex: 0,
          teacherId: teacherId
        }
      });
      notify("🚀 ĐÃ PHÁT TÍN HIỆU BẮT ĐẦU!");
    }
  };

  const handleNextLiveQuestion = () => {
    let nextProb = liveProblemIdx + 1;
    let nextRound = liveRoundIdx;
    const currentProblems = rounds[liveRoundIdx]?.problems || [];
    
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
      notify(`⏩ ĐÃ CHUYỂN: VÒNG ${nextRound + 1} - CÂU ${nextProb + 1}`);
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

  const currentLiveProblem = rounds[liveRoundIdx]?.problems[liveProblemIdx];

  if (adminTab === 'CONTROL') {
    return (
      <div className="flex flex-col gap-6 animate-in fade-in duration-500 text-left h-full">
         <header className="bg-white p-6 rounded-[2.5rem] shadow-xl border-b-8 border-slate-200 flex flex-col md:flex-row items-center justify-between gap-6 shrink-0">
            <div className="flex items-center gap-6">
               <div className="bg-slate-900 text-white p-5 rounded-[2.2rem] text-center min-w-[160px] shadow-2xl border-b-8 border-blue-600 relative">
                  <span className="text-[10px] font-black uppercase text-blue-400 block mb-1">MÃ PHÒNG</span>
                  <div className="text-3xl font-black tracking-widest uppercase italic leading-none">@{teacherMaGV || '...'}@</div>
                  <div className="absolute -top-3 -right-3 bg-red-500 text-white text-[8px] font-black px-2 py-1 rounded-lg animate-pulse">LIVE</div>
               </div>
               <div className="text-left">
                  <h3 className="text-2xl font-black text-slate-800 uppercase italic leading-none">ARENA CONTROL</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase mt-2 italic tracking-widest leading-none">
                    {isLiveGameActive ? 'ĐANG TRONG TRẬN ĐẤU' : 'PHÒNG CHỜ HỌC SINH'}
                  </p>
               </div>
            </div>
            <div className="flex gap-4">
               <button onClick={toggleWhiteboard} className={`px-8 py-5 rounded-2xl font-black uppercase italic shadow-lg transition-all flex items-center gap-3 border-b-4 ${isWhiteboardActive ? 'bg-emerald-600 text-white border-emerald-800' : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'}`}>
                 <span className="text-xl">🎨</span> {isWhiteboardActive ? 'ĐANG GIẢNG BÀI' : 'MỞ BẢNG TRẮNG'}
               </button>
               {!isLiveGameActive ? (
                 <button onClick={handleStartLiveMatch} className="px-10 py-5 bg-blue-600 text-white rounded-2xl font-black uppercase italic shadow-xl hover:scale-105 transition-all flex items-center gap-3 border-b-8 border-blue-800">
                   <span className="text-xl">⚡</span> BẮT ĐẦU ARENA
                 </button>
               ) : (
                 <button onClick={handleNextLiveQuestion} className="px-10 py-5 bg-amber-500 text-white rounded-2xl font-black uppercase italic shadow-xl hover:scale-105 transition-all flex items-center gap-3 border-b-8 border-amber-700">
                   <span className="text-xl">⏩</span> CÂU KẾ TIẾP
                 </button>
               )}
            </div>
         </header>

         <div className="grid grid-cols-12 gap-6 items-start flex-1 min-h-0">
            <div className="col-span-12 lg:col-span-8 h-full">
               <div className="bg-white rounded-[3.5rem] border-4 border-slate-50 shadow-2xl overflow-hidden relative h-full flex flex-col">
                  {isWhiteboardActive ? (
                    <Whiteboard isTeacher={true} channel={controlChannelRef.current} roomCode="TEACHER_ROOM" />
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center bg-slate-50/50 relative">
                       {isLiveGameActive && currentLiveProblem ? (
                         <div className="relative z-10 w-full px-12 animate-in zoom-in">
                            <div className="bg-white p-10 rounded-[3rem] shadow-xl border-b-[10px] border-blue-600 inline-block max-w-2xl text-left">
                               <div className="flex items-center gap-3 mb-6">
                                  <span className="px-3 py-1 bg-blue-600 text-white text-[10px] font-black uppercase rounded-lg">CÂU {liveProblemIdx + 1}</span>
                                  <span className="px-3 py-1 bg-slate-900 text-white text-[10px] font-black uppercase rounded-lg">VÒNG {liveRoundIdx + 1}</span>
                               </div>
                               <div className="text-3xl font-black text-slate-800 italic leading-snug">
                                  <LatexRenderer content={currentLiveProblem.content} />
                               </div>
                            </div>
                         </div>
                       ) : (
                         <div className="relative z-10 px-10">
                            <div className="text-8xl mb-6">📡</div>
                            <p className="font-black uppercase italic tracking-[0.2em] text-3xl text-blue-600 animate-pulse">ĐANG CHỜ LỆNH BẮT ĐẦU</p>
                            <p className="text-slate-400 font-bold italic mt-4 uppercase text-xs">Học sinh đã vào sẽ xuất hiện ở danh sách bên phải</p>
                         </div>
                       )}
                    </div>
                  )}
               </div>
            </div>

            <div className="col-span-12 lg:col-span-4 flex flex-col gap-6 h-full min-h-0">
               <div className="bg-white p-8 rounded-[3rem] border-4 border-slate-50 shadow-xl flex flex-col h-1/2 min-h-0">
                  <h4 className="text-xl font-black text-slate-800 uppercase italic mb-6 flex justify-between items-center">
                    <span>👥 HỌC SINH</span>
                    <span className="bg-blue-100 text-blue-600 px-3 py-1 rounded-full text-xs">{Object.keys(connectedStudents).length}</span>
                  </h4>
                  <div className="flex-1 overflow-y-auto no-scrollbar border-t-2 border-slate-50 pt-4 space-y-2">
                     {Object.values(connectedStudents).map((s, i) => (
                        <div key={i} className={`flex items-center gap-4 py-4 px-5 rounded-[1.5rem] border-2 transition-all ${s.answered ? (s.isCorrect ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100') : 'bg-slate-50 border-transparent'}`}>
                           <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-sm ${s.answered ? (s.isCorrect ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white') : 'bg-white text-slate-300'}`}>
                             {s.answered ? (s.isCorrect ? '✓' : '✕') : '👤'}
                           </div>
                           <div className="flex-1 flex flex-col">
                              <div className="font-black text-slate-700 uppercase italic text-sm truncate">{s.name}</div>
                              <div className="text-[9px] font-black uppercase opacity-50 tracking-widest">
                                {s.answered ? (s.isCorrect ? 'ĐÃ TRẢ LỜI' : 'TRẢ LỜI SAI') : 'CHỜ ĐÁP ÁN...'}
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>

               <div className="bg-slate-900 p-8 rounded-[3rem] border-b-[10px] border-blue-700 shadow-2xl flex flex-col h-1/2 min-h-0">
                  <h4 className="text-lg font-black text-blue-400 uppercase italic mb-6 tracking-widest">THÔNG TIN ĐỀ</h4>
                  <div className="space-y-6 overflow-y-auto no-scrollbar">
                     <div>
                        <span className="text-[10px] font-black text-slate-500 uppercase italic block mb-1">TÊN BỘ ĐỀ:</span>
                        <div className="text-xl font-black text-white italic uppercase truncate">{loadedSetTitle || currentTitle || 'Tự soạn nhanh'}</div>
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                           <span className="text-[8px] font-black text-slate-500 uppercase block mb-1">VÒNG</span>
                           <div className="text-2xl font-black text-white italic">{rounds.length}</div>
                        </div>
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                           <span className="text-[8px] font-black text-slate-500 uppercase block mb-1">CÂU HỎI</span>
                           <div className="text-2xl font-black text-white italic">{rounds.reduce((a, b) => a + (b.problems?.length || 0), 0)}</div>
                        </div>
                     </div>
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
             {rounds.map((r, i) => (
                <button key={i} onClick={() => { setActiveRoundIdx(i); setEditingIdx(null); }} className={`px-6 py-3 rounded-2xl text-[11px] font-black uppercase border-2 transition-all shrink-0 ${activeRoundIdx === i ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>Vòng {r.number}</button>
             ))}
             <button onClick={() => { setRounds([...rounds, { number: rounds.length + 1, problems: [], description: '' }]); setActiveRoundIdx(rounds.length); }} className="px-6 py-3 rounded-2xl text-[11px] font-black text-blue-600 border-2 border-dashed border-blue-200 uppercase">+ VÒNG</button>
          </div>
          <div className="bg-white rounded-[2rem] p-5 shadow-md border-2 border-slate-50 flex-1 overflow-y-auto no-scrollbar flex flex-col gap-4">
              {rounds[activeRoundIdx]?.problems.map((p, i) => (
                <button key={p.id} onClick={() => setEditingIdx(i)} className={`w-full p-4 rounded-2xl text-left border-4 transition-all ${editingIdx === i ? 'bg-blue-600 border-blue-400 text-white shadow-lg' : 'bg-slate-50 border-white text-slate-500 hover:bg-slate-100'}`}>
                  <div className="text-[11px] font-black uppercase italic">Câu {i+1}</div>
                  <div className="text-[9px] font-bold opacity-70 uppercase truncate">{p.content || 'Nội dung mới...'}</div>
                </button>
              ))}
              <button onClick={() => {
                const newProb = { id: Math.random().toString(36).substring(7), title: 'Câu hỏi mới', content: '', type: QuestionType.MULTIPLE_CHOICE, difficulty: Difficulty.EASY, challenge: DisplayChallenge.NORMAL, topic: currentTopic, correctAnswer: 'A', explanation: '', options: ['', '', '', ''] };
                const updated = [...rounds];
                updated[activeRoundIdx].problems.push(newProb);
                setRounds(updated);
                setEditingIdx(updated[activeRoundIdx].problems.length - 1);
              }} className="w-full py-4 border-2 border-dashed border-slate-200 text-slate-400 rounded-2xl font-black uppercase italic text-[10px] hover:border-blue-400 hover:text-blue-500 transition-all">+ THÊM CÂU HỎI</button>
          </div>
        </div>

        <div className="lg:col-span-9 bg-white rounded-[3rem] shadow-xl p-10 overflow-y-auto no-scrollbar border-4 border-slate-50 relative">
          {editingIdx !== null && rounds[activeRoundIdx]?.problems[editingIdx] ? (
            <div className="max-w-4xl mx-auto space-y-10 pb-20 animate-in fade-in">
                <div className="flex justify-between items-center border-b-4 border-slate-50 pb-6">
                  <h3 className="text-3xl font-black italic uppercase">Câu {editingIdx + 1}</h3>
                  <button onClick={() => {
                    const updated = [...rounds];
                    updated[activeRoundIdx].problems.splice(editingIdx, 1);
                    setRounds(updated);
                    setEditingIdx(null);
                  }} className="text-red-500 font-black uppercase italic text-[10px]">Xóa câu hỏi ✕</button>
                </div>
                <div className="space-y-4">
                   <label className="text-[10px] font-black text-slate-400 uppercase italic">Nội dung câu hỏi</label>
                   <textarea className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl font-bold text-xl min-h-[120px]" value={rounds[activeRoundIdx].problems[editingIdx].content} onChange={e => {
                     const updated = [...rounds];
                     updated[activeRoundIdx].problems[editingIdx].content = e.target.value;
                     setRounds(updated);
                   }} />
                </div>
                <div className="bg-emerald-50/30 p-8 rounded-[3rem] border-2 border-emerald-100">
                   <h4 className="text-xl font-black text-emerald-700 uppercase italic mb-4">📖 LỜI GIẢI CHI TIẾT</h4>
                   <textarea className="w-full p-6 bg-white border-2 border-emerald-100 rounded-3xl font-medium min-h-[150px]" value={rounds[activeRoundIdx].problems[editingIdx].explanation} onChange={e => {
                     const updated = [...rounds];
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
