
import React, { useState, useEffect, useRef } from 'react';
import { PhysicsProblem, Round, Difficulty, QuestionType, DisplayChallenge, GameState, GameSettings, InteractiveMechanic, Player } from '../types';
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
  adminTab: 'EDITOR' | 'CONTROL' | 'CLOUD' | 'LAB';
  setAdminTab: (tab: 'EDITOR' | 'CONTROL' | 'CLOUD' | 'LAB') => void;
  loadedSetTitle: string | null;
  loadedSetId: string | null;
  loadedSetTopic?: string | null;
  categories: string[];
  fullView?: boolean;
  onResetToNew: () => void;
  onLoadSet: (setId: string, title: string) => Promise<boolean>;
}

const AdminPanel: React.FC<AdminPanelProps> = (props) => {
  const { 
    rounds, setRounds, onSaveSet, loadedSetTitle, loadedSetId, 
    loadedSetTopic, teacherId, adminTab, setAdminTab, onStartGame,
    onNextQuestion, currentProblemIdx, totalProblems, examSets
  } = props;

  const [activeRoundIdx, setActiveRoundIdx] = useState(0);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [status, setStatus] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [rawText, setRawText] = useState('');
  const [showAIInput, setShowAIInput] = useState(false);
  
  const [showLibModal, setShowLibModal] = useState(false);
  const [libQuestions, setLibQuestions] = useState<PhysicsProblem[]>([]);
  const [libLoading, setLibLoading] = useState(false);
  
  const [currentTitle, setCurrentTitle] = useState(loadedSetTitle || '');
  const [currentTopic, setCurrentTopic] = useState(loadedSetTopic || 'Khác');
  const [currentGrade, setCurrentGrade] = useState('10');
  const [teacherMaGV, setTeacherMaGV] = useState('');

  const [roundToDeleteIdx, setRoundToDeleteIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [connectedStudents, setConnectedStudents] = useState<string[]>([]);
  const [studentResults, setStudentResults] = useState<Record<string, { answered: boolean, isCorrect: boolean }>>({});
  const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);
  const [isLiveGameActive, setIsLiveGameActive] = useState(false);
  const [liveProblemIdx, setLiveProblemIdx] = useState(0); 
  const controlChannelRef = useRef<any>(null);

  // LOGIC RESET KHI NẠP ĐỀ MỚI:
  // Mỗi khi loadedSetId thay đổi, ta đưa mọi thứ về trạng thái ban đầu để tránh xung đột với đề cũ
  useEffect(() => {
    setCurrentTitle(loadedSetTitle || '');
    setCurrentTopic(loadedSetTopic || 'Khác');
    
    // Reset trạng thái Live
    setIsLiveGameActive(false);
    setLiveProblemIdx(0);
    setStudentResults({});
    setIsWhiteboardActive(false);
    
    // Thông báo cho học sinh trong phòng rằng GV đã nạp đề mới nhưng chưa bắt đầu
    if (controlChannelRef.current) {
      controlChannelRef.current.send({
        type: 'broadcast',
        event: 'teacher_reset_room',
        payload: { title: loadedSetTitle }
      });
    }
  }, [loadedSetId]);

  useEffect(() => {
    const fetchGV = async () => {
      const { data } = await supabase.from('giaovien').select('magv').eq('id', teacherId).single();
      if (data) setTeacherMaGV(data.magv);
    };
    fetchGV();
  }, [teacherId]);

  // LOGIC ĐỒNG BỘ: Khi có học sinh mới vào phòng khi trận đấu ĐANG DIỄN RA
  useEffect(() => {
    if (isLiveGameActive && connectedStudents.length > 0 && controlChannelRef.current) {
      controlChannelRef.current.send({
        type: 'broadcast',
        event: 'teacher_start_game',
        payload: { 
          setId: loadedSetId, 
          title: loadedSetTitle, 
          rounds: rounds, 
          currentQuestionIndex: liveProblemIdx 
        }
      });
    }
  }, [connectedStudents.length, isLiveGameActive]);

  useEffect(() => {
    if (adminTab === 'CONTROL') {
      const channel = supabase.channel(`control_TEACHER_ROOM_${teacherId}`, {
        config: { presence: { key: 'teacher' } }
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const players = Object.keys(state)
            .filter(key => key !== 'teacher')
            .map(key => key.split('_')[0]);
          setConnectedStudents(players);
        })
        .on('broadcast', { event: 'student_answer' }, ({ payload }) => {
          setStudentResults(prev => ({
            ...prev,
            [payload.playerName]: { answered: true, isCorrect: payload.isCorrect }
          }));
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

  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    setStatus({ text, type });
    setTimeout(() => setStatus(null), 3000);
  };

  const handleStartLiveMatch = () => {
    if (connectedStudents.length === 0) {
      notify("Cần ít nhất 1 học sinh trong phòng để bắt đầu!", "error");
      return;
    }
    if (!loadedSetId) {
      notify("Hãy nạp một bộ đề từ Kho Đề trước!", "error");
      return;
    }

    setIsLiveGameActive(true);
    setStudentResults({});
    setLiveProblemIdx(0);
    if (controlChannelRef.current) {
      controlChannelRef.current.send({
        type: 'broadcast',
        event: 'teacher_start_game',
        payload: { setId: loadedSetId, title: loadedSetTitle, rounds: rounds, currentQuestionIndex: 0 }
      });
    }
    notify("TRẬN ĐẤU ĐÃ BẮT ĐẦU! 🚀");
  };

  const handleNextLiveQuestion = () => {
    const nextIdx = liveProblemIdx + 1;
    const totalInRound = rounds[activeRoundIdx]?.problems?.length || 0;
    
    if (nextIdx >= totalInRound) {
       notify("Đã hết câu hỏi trong vòng này!", "error");
       return;
    }

    setLiveProblemIdx(nextIdx);
    setStudentResults({}); 
    if (controlChannelRef.current) {
      controlChannelRef.current.send({ 
        type: 'broadcast', 
        event: 'teacher_next_question',
        payload: { nextIndex: nextIdx }
      });
      notify(`Đã chuyển sang câu ${nextIdx + 1}!`);
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
    notify(newState ? "Đã kích hoạt Bảng trắng cho học sinh" : "Đã ẩn Bảng trắng");
  };

  const updateProblem = (idx: number, data: Partial<PhysicsProblem>) => {
    const updated = [...rounds];
    if (updated[activeRoundIdx]) {
      updated[activeRoundIdx].problems[idx] = { ...updated[activeRoundIdx].problems[idx], ...data };
      setRounds(updated);
    }
  };

  const updateRoundDesc = (desc: string) => {
    const updated = [...rounds];
    if (updated[activeRoundIdx]) {
      updated[activeRoundIdx].description = desc;
      setRounds(updated);
    }
  };

  const handleOpenLibrary = async (type?: QuestionType) => {
    setShowLibModal(true);
    setLibLoading(true);
    try {
      const data = await fetchQuestionsLibrary(teacherId, currentGrade, type);
      setLibQuestions(data);
    } catch (e) {
      notify("Lỗi tải thư viện", "error");
    } finally {
      setLibLoading(false);
    }
  };

  const addFromLibrary = (p: PhysicsProblem) => {
    const updated = [...rounds];
    if (updated[activeRoundIdx]) {
      const newProb = { ...p, id: Math.random().toString(36).slice(2, 9) }; 
      updated[activeRoundIdx].problems.push(newProb);
      setRounds(updated);
      notify(`Đã thêm: ${p.title}`);
    }
  };

  const addNewRound = () => {
    const newRound: Round = { number: rounds.length + 1, problems: [], description: `Chào mừng các bạn đến với Vòng ${rounds.length + 1}!` };
    setRounds([...rounds, newRound]);
    setActiveRoundIdx(rounds.length);
    setEditingIdx(null);
  };

  const confirmDeleteRound = () => {
    if (roundToDeleteIdx === null) return;
    if (rounds.length <= 1) { notify("Cần ít nhất 1 vòng!", "error"); setRoundToDeleteIdx(null); return; }
    const updated = rounds.filter((_, i) => i !== roundToDeleteIdx).map((r, i) => ({ ...r, number: i + 1 }));
    setRounds(updated);
    setActiveRoundIdx(Math.max(0, activeRoundIdx >= roundToDeleteIdx ? activeRoundIdx - 1 : activeRoundIdx));
    setEditingIdx(null);
    setRoundToDeleteIdx(null);
  };

  const addNewProblem = (type: QuestionType) => {
    const newProb: PhysicsProblem = {
      id: Math.random().toString(36).slice(2, 9), title: `Câu hỏi mới`, content: '', type, difficulty: Difficulty.EASY, challenge: DisplayChallenge.NORMAL, challengeNumber: 1, mechanic: type === QuestionType.SHORT_ANSWER ? InteractiveMechanic.CANNON : undefined, correctAnswer: type === QuestionType.TRUE_FALSE ? 'ĐĐĐĐ' : (type === QuestionType.MULTIPLE_CHOICE ? 'A' : ''), explanation: '', topic: currentTopic, timeLimit: 40, options: (type === QuestionType.TRUE_FALSE || type === QuestionType.MULTIPLE_CHOICE) ? ['', '', '', ''] : []
    };
    const updated = [...rounds];
    if (updated[activeRoundIdx]) { updated[activeRoundIdx].problems.push(newProb); setRounds(updated); setEditingIdx(updated[activeRoundIdx].problems.length - 1); }
  };

  const deleteProblem = (idx: number) => {
    const updated = [...rounds];
    if (updated[activeRoundIdx]) { updated[activeRoundIdx].problems.splice(idx, 1); setRounds(updated); setEditingIdx(null); notify("Đã xóa câu hỏi"); }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || editingIdx === null) return;
    try { notify("Đang tải ảnh..."); const url = await uploadQuestionImage(file); updateProblem(editingIdx, { imageUrl: url }); notify("Tải ảnh thành công!"); } catch (e) { notify("Lỗi tải ảnh", "error"); }
  };

  if (adminTab === 'CONTROL') {
    return (
      <div className="flex flex-col gap-6 animate-in fade-in duration-500 text-left">
         <header className="bg-white p-6 rounded-[2.5rem] shadow-xl border-2 border-slate-50 flex flex-col md:flex-row items-center justify-between gap-6 shrink-0">
            <div className="flex items-center gap-6">
               <div className="bg-slate-900 text-white p-5 rounded-[2rem] text-center min-w-[140px] shadow-xl border-b-8 border-slate-800">
                  <span className="text-[10px] font-black uppercase text-blue-400 block mb-1">MÃ PHÒNG</span>
                  <div className="text-3xl font-black tracking-widest uppercase italic leading-none">{teacherMaGV || '...'}</div>
               </div>
               <div className="text-left">
                  <h3 className="text-2xl font-black text-slate-800 uppercase italic leading-none">ARENA CONTROL</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase mt-2 italic tracking-widest leading-none">Dữ liệu sẵn sàng: {loadedSetTitle || 'Trống'}</p>
               </div>
            </div>
            <div className="flex gap-4">
               <button onClick={toggleWhiteboard} className={`px-10 py-5 rounded-2xl font-black uppercase italic shadow-lg transition-all flex items-center gap-3 ${isWhiteboardActive ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
                 <span className="text-xl">🎨</span> {isWhiteboardActive ? 'ĐANG GIẢNG BÀI' : 'MỞ BẢNG TRẮNG'}
               </button>
               {!isLiveGameActive ? (
                 <button onClick={handleStartLiveMatch} className="px-12 py-5 bg-blue-600 text-white rounded-2xl font-black uppercase italic shadow-xl hover:scale-105 transition-all flex items-center gap-3 border-b-8 border-blue-800">
                   <span className="text-xl">⚡</span> KHỞI CHẠY ARENA
                 </button>
               ) : (
                 <button onClick={handleNextLiveQuestion} className="px-12 py-5 bg-amber-500 text-white rounded-2xl font-black uppercase italic shadow-xl hover:scale-105 transition-all flex items-center gap-3 border-b-8 border-amber-700">
                   <span className="text-xl">⏩</span> CÂU KẾ TIẾP ({liveProblemIdx + 1})
                 </button>
               )}
            </div>
         </header>

         <div className="grid grid-cols-12 gap-6 items-start">
            <div className="col-span-8">
               <div className="bg-white rounded-[3rem] border-4 border-slate-50 shadow-2xl overflow-hidden relative h-[700px]">
                  {isWhiteboardActive ? (
                    <Whiteboard isTeacher={true} channel={controlChannelRef.current} roomCode="TEACHER_ROOM" />
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center bg-slate-50/50 rounded-[2.5rem]">
                       <div className="text-[10rem] opacity-5 select-none absolute">📺</div>
                       <div className="relative z-10 px-10">
                          {isLiveGameActive ? (
                            <>
                              <p className="font-black uppercase italic tracking-[0.3em] text-2xl text-blue-600 animate-pulse">Trận đấu đang diễn ra</p>
                              <p className="text-slate-400 font-bold mt-4 italic text-xs max-w-sm mx-auto">Học sinh đang tập trung làm bài. Thầy có thể mở Bảng trắng để hỗ trợ giải thích.</p>
                            </>
                          ) : (
                            <>
                              <p className="font-black uppercase italic tracking-[0.3em] text-2xl text-slate-300">Đấu trường sẵn sàng</p>
                              <p className="text-slate-400 font-bold mt-4 italic text-xs max-w-sm mx-auto">Nhấn "Khởi chạy Arena" để bắt đầu phát đề cho toàn bộ học sinh trong phòng.</p>
                            </>
                          )}
                       </div>
                    </div>
                  )}
               </div>
            </div>

            <div className="col-span-4 flex flex-col gap-6">
               <div className="bg-white p-6 rounded-[2.5rem] border-4 border-slate-50 shadow-xl flex flex-col h-[450px]">
                  <div className="flex justify-between items-center mb-6 shrink-0">
                    <h4 className="text-lg font-black text-slate-800 uppercase italic flex items-center gap-3">
                       <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center text-sm shadow-sm">👥</span>
                       HỌC SINH ({connectedStudents.length})
                    </h4>
                    <span className={`text-[9px] font-black px-3 py-1 rounded-full ${isLiveGameActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'} text-white`}>{isLiveGameActive ? 'LIVE' : 'CHỜ'}</span>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar no-scrollbar border-t border-slate-50">
                     {connectedStudents.length > 0 ? connectedStudents.map((s, i) => {
                       const res = studentResults[s];
                       return (
                        <div key={i} className={`flex items-center gap-4 py-3 px-4 border-b border-slate-50 transition-all hover:bg-slate-50/80 ${res ? (res.isCorrect ? 'bg-emerald-50/30' : 'bg-red-50/30') : ''}`}>
                           <div className="w-8 h-8 bg-white border border-slate-200 rounded-full flex items-center justify-center text-xs shadow-sm shrink-0">👤</div>
                           <div className="flex-1 min-w-0">
                              <div className="font-bold text-slate-700 uppercase italic text-xs truncate">{s}</div>
                           </div>
                           <div className="shrink-0 flex items-center gap-2">
                             {res ? (
                               <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${res.isCorrect ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                                 {res.isCorrect ? 'ĐÚNG' : 'SAI'}
                               </span>
                             ) : (
                               <span className="text-[8px] font-black text-slate-300 uppercase italic italic">{isLiveGameActive ? 'Đang giải...' : 'Sẵn sàng'}</span>
                             )}
                           </div>
                        </div>
                       );
                     }) : (
                       <div className="h-full flex flex-col items-center justify-center text-slate-200 italic text-sm text-center px-6 gap-4 py-10 opacity-60">
                          <div className="text-5xl">📡</div>
                          Đang đợi học sinh kết nối mã {teacherMaGV}...
                       </div>
                     )}
                  </div>
               </div>

               <div className="bg-white p-6 rounded-[2.5rem] border-4 border-slate-50 shadow-xl flex flex-col h-[225px]">
                  <h4 className="text-lg font-black text-slate-800 uppercase italic mb-4 flex items-center gap-3 shrink-0">
                     <span className="w-8 h-8 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center text-sm shadow-sm">📄</span>
                     DỮ LIỆU PHÒNG
                  </h4>
                  {loadedSetId ? (
                    <div className="bg-slate-900 p-5 rounded-[1.8rem] text-white flex-1 flex flex-col justify-center text-left relative overflow-hidden">
                       <div className="text-[9px] font-black uppercase text-blue-400 mb-1 italic">BỘ ĐỀ ĐANG NẠP</div>
                       <div className="text-lg font-black uppercase italic leading-tight mb-4 truncate text-blue-100">{loadedSetTitle}</div>
                       <div className="flex items-center gap-6">
                          <div>
                             <div className="text-[8px] font-black uppercase text-white/40 italic">TIẾN ĐỘ</div>
                             <div className="text-xl font-black text-white leading-none">{isLiveGameActive ? `${liveProblemIdx + 1} / ${rounds[activeRoundIdx]?.problems?.length || 0}` : 'Chưa bắt đầu'}</div>
                          </div>
                       </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-200 italic text-xs text-center px-6 gap-2 opacity-50">
                       <div className="text-4xl">📁</div>
                       Vào Kho Đề nhấn "Dạy Live" để nạp dữ liệu.
                    </div>
                  )}
               </div>
            </div>
         </div>
      </div>
    );
  }

  const activeProblem = editingIdx !== null && rounds[activeRoundIdx] ? rounds[activeRoundIdx].problems[editingIdx] : null;

  return (
    <div className="bg-[#f8fafc] min-h-full flex flex-col gap-4 relative no-scrollbar text-left">
      {status && <div className={`fixed top-6 left-1/2 -translate-x-1/2 px-10 py-4 rounded-full font-black text-xs uppercase shadow-2xl z-[10000] animate-in slide-in-from-top-4 ${status.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'} text-white`}>{status.text}</div>}
      <ConfirmModal isOpen={roundToDeleteIdx !== null} title="Xóa vòng thi?" message={`Bạn có chắc muốn xóa Vòng ${roundToDeleteIdx !== null && rounds[roundToDeleteIdx] ? rounds[roundToDeleteIdx].number : ''}?`} onConfirm={confirmDeleteRound} onCancel={() => setRoundToDeleteIdx(null)} isDestructive={true} confirmText="Xóa vòng" />

      <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border-4 border-slate-100 flex items-center gap-6 shrink-0">
        <div className="flex items-center gap-4 flex-1">
          <div className="text-4xl bg-emerald-50 w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner">📗</div>
          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-6 text-left">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block ml-1 italic text-left">Tên bộ đề</label>
              <input type="text" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-3 font-black text-slate-700 outline-none focus:border-blue-200 text-sm" value={currentTitle} onChange={e => setCurrentTitle(e.target.value)} placeholder="Nhập tên bộ đề..." />
            </div>
            <div className="md:col-span-4 text-left">
              <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1 block ml-1 italic text-left">Chủ đề</label>
              <input type="text" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-3 font-black text-blue-600 outline-none focus:border-blue-200 text-sm" value={currentTopic} onChange={e => setCurrentTopic(e.target.value)} />
            </div>
            <div className="md:col-span-2 text-left">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block ml-1 italic text-left">Khối</label>
              <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-black text-slate-700 text-sm outline-none" value={currentGrade} onChange={e => setCurrentGrade(e.target.value)}>
                {['10', '11', '12'].map(g => <option key={g} value={g}>K{g}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAIInput(!showAIInput)} className={`px-8 py-6 rounded-[2rem] font-black uppercase italic shadow-lg transition-all text-sm ${showAIInput ? 'bg-slate-900 text-white' : 'bg-emerald-500 text-white'}`}>{showAIInput ? 'ĐÓNG AI' : 'AI TRÍCH XUẤT'}</button>
          <button onClick={() => onSaveSet(currentTitle, !loadedSetId, currentTopic, currentGrade)} disabled={isSaving} className="px-12 py-6 bg-blue-600 text-white rounded-[2rem] font-black uppercase italic shadow-lg hover:scale-105 transition-all text-sm">LƯU ĐỀ</button>
        </div>
      </div>

      <div className="bg-white px-10 py-6 rounded-[2.5rem] shadow-md border-4 border-slate-100 flex items-center justify-around shrink-0">
         {[
           { type: QuestionType.MULTIPLE_CHOICE, label: 'Trắc Nghiệm', color: 'blue' },
           { type: QuestionType.TRUE_FALSE, label: 'Đúng / Sai', color: 'emerald' },
           { type: QuestionType.SHORT_ANSWER, label: 'Tự Luận', color: 'purple' }
         ].map((item) => (
           <div key={item.type} className="flex flex-col items-center gap-3 px-8 border-x border-slate-50 last:border-r-0 first:border-l-0">
              <span className={`text-sm font-black text-slate-800 uppercase italic tracking-widest`}>
                {item.label}
              </span>
              <div className="flex gap-2">
                 <button 
                  onClick={() => addNewProblem(item.type)}
                  className={`px-8 py-3 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl font-black text-[11px] uppercase italic hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all shadow-sm`}
                 >
                   New
                 </button>
                 <button 
                  onClick={() => handleOpenLibrary(item.type)}
                  className={`px-8 py-3 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl font-black text-[11px] uppercase italic hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all shadow-sm`}
                 >
                   CSDL
                 </button>
              </div>
           </div>
         ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        <div className="lg:col-span-3 flex flex-col gap-4 max-h-full overflow-hidden">
          <div className="bg-white p-4 rounded-3xl border-4 border-slate-50 shadow-sm flex items-center gap-3 overflow-x-auto no-scrollbar shrink-0">
             {rounds.map((r, i) => (
                <div key={i} className="relative group flex items-center shrink-0">
                  <button onClick={() => { setActiveRoundIdx(i); setEditingIdx(null); }} className={`pl-6 pr-10 py-3 rounded-2xl text-[11px] font-black uppercase border-2 transition-all whitespace-nowrap ${activeRoundIdx === i ? 'bg-slate-900 text-white border-slate-900 shadow-lg scale-105' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>Vòng {r.number}</button>
                  <button onClick={(e) => { e.stopPropagation(); setRoundToDeleteIdx(i); }} className="absolute right-2.5 w-6 h-6 rounded-full bg-red-50 text-red-500 border border-red-100 flex items-center justify-center text-[10px] font-black hover:bg-red-500 hover:text-white transition-all">✕</button>
                </div>
             ))}
             <button onClick={addNewRound} className="px-6 py-3 rounded-2xl text-[11px] font-black text-blue-600 border-2 border-dashed border-blue-200 uppercase whitespace-nowrap hover:bg-blue-50 transition-all">+ VÒNG</button>
          </div>
          <div className="bg-white rounded-[2rem] p-5 shadow-md border-2 border-slate-50 flex-1 overflow-y-auto no-scrollbar flex flex-col gap-6">
            <div className="bg-slate-50/50 p-5 rounded-[2rem] border-2 border-dashed border-slate-200 text-left"><label className="text-[9px] font-black text-slate-400 uppercase italic block mb-2">Mô tả Vòng {activeRoundIdx + 1}</label><textarea className="w-full bg-transparent text-[11px] font-medium text-slate-500 outline-none italic resize-none" rows={4} value={rounds[activeRoundIdx]?.description || ''} onChange={e => updateRoundDesc(e.target.value)} /></div>
            <label className="text-[9px] font-black text-slate-300 uppercase italic block tracking-widest px-2">DANH SÁCH CÂU HỎI</label>
            <div className="space-y-2">
              {rounds[activeRoundIdx]?.problems.map((p, i) => (
                <button key={p.id} onClick={() => setEditingIdx(i)} className={`w-full p-4 rounded-2xl text-left border-4 transition-all flex flex-col ${editingIdx === i ? 'bg-blue-600 border-blue-400 text-white shadow-lg' : 'bg-slate-50 border-white text-slate-500 hover:bg-slate-100'}`}>
                  <div className="text-[11px] font-black uppercase italic text-left">Câu {i+1}</div><div className="text-[9px] font-bold opacity-70 uppercase truncate text-left">{p.content || 'Nội dung mới...'}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="lg:col-span-9 bg-white rounded-[3rem] shadow-xl p-10 overflow-y-auto no-scrollbar border-4 border-slate-50 relative">
          {activeProblem && editingIdx !== null ? (
            <div className="max-w-4xl mx-auto space-y-10 pb-20 animate-in fade-in duration-300 text-left">
               <div className="flex justify-between items-center border-b-4 border-slate-50 pb-6 text-left">
                  <div className="text-left"><h3 className="text-4xl font-black text-slate-800 uppercase italic leading-none text-left">WORKSHOP EDITOR</h3><p className="text-[11px] font-black text-blue-500 uppercase mt-2 tracking-widest text-left">SOẠN THẢO • CÂU {editingIdx + 1} • VÒNG {activeRoundIdx + 1}</p></div>
                  <div className="flex gap-2 text-left"><button onClick={() => fileInputRef.current?.click()} className="px-6 py-3 bg-white border-2 border-slate-100 text-slate-400 rounded-xl font-black uppercase italic text-[10px] flex items-center gap-2 hover:bg-blue-50 hover:border-blue-200 transition-all shadow-sm"><span>🖼️</span> Tải ảnh</button><input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" /><button onClick={() => deleteProblem(editingIdx)} className="px-6 py-3 bg-red-50 text-red-500 border-2 border-red-100 rounded-xl font-black uppercase italic text-[10px] hover:bg-red-500 hover:text-white transition-all shadow-sm">Xóa câu ✕</button></div>
               </div>
               <div className="grid grid-cols-12 gap-4 text-left">
                 <div className="col-span-12 md:col-span-4 text-left"><label className="text-[10px] font-black text-slate-400 uppercase block mb-2 ml-2 italic text-left">Thử thách hiển thị</label><select className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs uppercase text-left" value={activeProblem.challenge} onChange={e => updateProblem(editingIdx, { challenge: e.target.value as DisplayChallenge })}>{Object.values(DisplayChallenge).map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                 <div className="col-span-12 md:col-span-4 text-left"><label className="text-[10px] font-black text-slate-400 uppercase block mb-2 ml-2 italic text-left">Game Arena</label><select className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs uppercase text-left" value={activeProblem.mechanic || InteractiveMechanic.CANNON} onChange={e => updateProblem(editingIdx, { mechanic: e.target.value as InteractiveMechanic })}>{Object.values(InteractiveMechanic).map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                 <div className="col-span-12 md:col-span-4 text-left"><label className="text-[10px] font-black text-slate-400 uppercase block mb-2 ml-2 italic text-left">Time (s)</label><input type="number" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-slate-800 text-left" value={activeProblem.timeLimit} onChange={e => updateProblem(editingIdx, { timeLimit: parseInt(e.target.value) })} /></div>
               </div>
               <div className="space-y-4 text-left"><label className="text-[11px] font-black text-slate-400 uppercase italic px-2 block text-left">Nội dung câu hỏi (Dùng $ $ để viết công thức)</label><textarea className="w-full p-8 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] font-bold text-2xl min-h-[160px] outline-none text-left" value={activeProblem.content} onChange={e => updateProblem(editingIdx, { content: e.target.value })} placeholder="Nhập nội dung..." /><div className="p-8 bg-white rounded-[2.5rem] border-4 border-dashed border-slate-100 shadow-inner text-left"><label className="text-[9px] font-black text-slate-300 uppercase italic block mb-3 tracking-widest text-left">Hiển thị Preview</label><div className="text-2xl font-bold text-slate-700 text-left"><LatexRenderer content={activeProblem.content || "Chưa có nội dung..."} /></div></div></div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center opacity-20 text-center"><div className="text-[10rem] mb-6 grayscale select-none">✏️</div><p className="font-black uppercase italic tracking-widest text-2xl text-slate-400">CHỌN CÂU HỎI ĐỂ SOẠN THẢO</p></div>
          )}
        </div>
      </div>

      {showLibModal && (
        <div className="fixed inset-0 z-[11000] flex items-center justify-center p-6">
           <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={() => setShowLibModal(false)}></div>
           <div className="bg-white rounded-[3rem] w-full max-w-5xl h-[85vh] flex flex-col relative z-10 border-4 border-slate-100 shadow-2xl overflow-hidden animate-in zoom-in duration-300">
              <header className="p-8 border-b-2 border-slate-50 flex justify-between items-center bg-slate-50">
                 <div>
                    <h3 className="text-3xl font-black text-slate-800 uppercase italic leading-none">THƯ VIỆN CÂU HỎI</h3>
                    <p className="text-[10px] font-black text-blue-500 uppercase mt-2">Dữ liệu từ Khối {currentGrade}</p>
                 </div>
                 <button onClick={() => setShowLibModal(false)} className="w-12 h-12 bg-white text-slate-400 rounded-xl flex items-center justify-center font-black shadow-sm">✕</button>
              </header>
              <div className="flex-1 overflow-y-auto p-8 space-y-4 no-scrollbar">
                 {libLoading ? (
                    <div className="h-full flex flex-col items-center justify-center">
                       <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                 ) : libQuestions.length > 0 ? libQuestions.map((q, i) => (
                    <div key={i} className="bg-slate-50 p-6 rounded-3xl border-2 border-slate-100 flex items-center gap-6 hover:border-blue-200 transition-all group">
                       <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                             <span className="px-2 py-0.5 bg-blue-100 text-blue-600 text-[9px] font-black uppercase rounded">{q.type}</span>
                             <span className="text-[10px] font-black text-slate-400 uppercase italic">{q.topic}</span>
                          </div>
                          <h5 className="font-bold text-slate-700 line-clamp-1">{q.content}</h5>
                       </div>
                       <button onClick={() => addFromLibrary(q)} className="px-6 py-3 bg-blue-600 text-white font-black rounded-xl uppercase italic text-[10px] opacity-0 group-hover:opacity-100 transition-all shadow-lg">+ Thêm vào đề</button>
                    </div>
                 )) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 italic text-center">Chưa có dữ liệu.</div>
                 )}
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
