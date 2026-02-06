
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
}

const AdminPanel: React.FC<AdminPanelProps> = (props) => {
  const { 
    rounds, setRounds, onSaveSet, loadedSetTitle, loadedSetId, 
    loadedSetTopic, teacherId, adminTab, setAdminTab, onStartGame,
    onNextQuestion, currentProblemIdx, totalProblems
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

  // Real-time Control State
  const [connectedStudents, setConnectedStudents] = useState<string[]>([]);
  const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);
  const [isLiveGameActive, setIsLiveGameActive] = useState(false);
  const controlChannelRef = useRef<any>(null);

  useEffect(() => {
    setCurrentTitle(loadedSetTitle || '');
    setCurrentTopic(loadedSetTopic || 'Khác');
  }, [loadedSetTitle, loadedSetId, loadedSetTopic]);

  // Lấy mã GV để hiển thị làm mã phòng
  useEffect(() => {
    const fetchGV = async () => {
      const { data } = await supabase.from('giaovien').select('magv').eq('id', teacherId).single();
      if (data) setTeacherMaGV(data.magv);
    };
    fetchGV();
  }, [teacherId]);

  // Thiết lập kênh điều khiển Arena khi ở tab CONTROL
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
      notify("Hãy nạp một bộ đề trước khi mở đấu trường!", "error");
      return;
    }

    setIsLiveGameActive(true);
    if (controlChannelRef.current) {
      controlChannelRef.current.send({
        type: 'broadcast',
        event: 'teacher_start_game',
        payload: { setId: loadedSetId, title: loadedSetTitle, rounds: rounds }
      });
    }
    notify("TRẬN ĐẤU ĐÃ BẮT ĐẦU! 🚀");
  };

  const handleNextLiveQuestion = () => {
    if (controlChannelRef.current) {
      controlChannelRef.current.send({ type: 'broadcast', event: 'teacher_next_question' });
      notify("Đã chuyển sang câu tiếp theo cho cả lớp!");
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

  const handleAIParse = async () => {
    if (!rawText.trim()) return;
    setIsParsing(true);
    try {
      const parsedProbs = await parseQuestionsFromText(rawText);
      const updated = [...rounds];
      if (updated[activeRoundIdx]) {
        updated[activeRoundIdx].problems.push(...parsedProbs);
        setRounds(updated);
        setRawText('');
        setShowAIInput(false);
        notify(`AI đã trích xuất thành công ${parsedProbs.length} câu hỏi!`);
      }
    } catch (e) {
      notify("Lỗi AI không thể phân tích", "error");
    } finally {
      setIsParsing(false);
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
      <div className="h-full flex flex-col gap-6 animate-in fade-in duration-500">
         <header className="bg-white p-8 rounded-[3rem] shadow-xl border-4 border-slate-50 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-6">
               <div className="bg-slate-900 text-white p-6 rounded-[2rem] text-center min-w-[150px] shadow-2xl border-b-8 border-slate-800">
                  <span className="text-[10px] font-black uppercase text-blue-400 block mb-1">MÃ PHÒNG HỌC</span>
                  <div className="text-4xl font-black tracking-widest uppercase italic">{teacherMaGV || '...'}</div>
               </div>
               <div>
                  <h3 className="text-3xl font-black text-slate-800 uppercase italic leading-none">TRUNG TÂM ĐIỀU HÀNH</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase mt-2 italic tracking-widest">Học sinh nhập mã trên để vào lớp của Thầy/Cô</p>
               </div>
            </div>
            <div className="flex gap-4">
               <button onClick={toggleWhiteboard} className={`px-8 py-5 rounded-2xl font-black uppercase italic shadow-lg transition-all flex items-center gap-3 ${isWhiteboardActive ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
                 <span>🎨</span> {isWhiteboardActive ? 'ĐANG GIẢNG BÀI' : 'MỞ BẢNG TRẮNG'}
               </button>
               {!isLiveGameActive ? (
                 <button onClick={handleStartLiveMatch} className="px-10 py-5 bg-blue-600 text-white rounded-2xl font-black uppercase italic shadow-xl hover:scale-105 transition-all flex items-center gap-3">
                   <span>⚡</span> KHỞI CHẠY TRẬN ĐẤU
                 </button>
               ) : (
                 <button onClick={handleNextLiveQuestion} className="px-10 py-5 bg-amber-500 text-white rounded-2xl font-black uppercase italic shadow-xl hover:scale-105 transition-all flex items-center gap-3">
                   <span>⏩</span> CÂU KẾ TIẾP
                 </button>
               )}
            </div>
         </header>

         <div className="flex-1 grid grid-cols-12 gap-6 min-h-0">
            <div className="col-span-8 flex flex-col gap-6">
               <div className="flex-1 bg-white rounded-[3.5rem] border-4 border-slate-50 shadow-2xl p-4 overflow-hidden relative">
                  {isWhiteboardActive ? (
                    <Whiteboard isTeacher={true} channel={controlChannelRef.current} roomCode="TEACHER_ROOM" />
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center">
                       <div className="text-[15rem] opacity-5 select-none absolute">📺</div>
                       <div className="relative z-10">
                          <p className="font-black uppercase italic tracking-[0.3em] text-2xl text-slate-300">Đấu trường đang sẵn sàng</p>
                          <p className="text-slate-400 font-bold mt-4 italic">Bấm "Khởi chạy" để bắt đầu bài thi cho tất cả học sinh đang chờ</p>
                       </div>
                    </div>
                  )}
               </div>
            </div>

            <div className="col-span-4 flex flex-col gap-6 overflow-hidden">
               <div className="bg-white p-8 rounded-[3rem] border-4 border-slate-50 shadow-xl flex flex-col h-1/2 overflow-hidden">
                  <h4 className="text-xl font-black text-slate-800 uppercase italic mb-6 flex items-center gap-3">
                     <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center text-sm">👥</span>
                     HỌC SINH ĐANG CHỜ ({connectedStudents.length})
                  </h4>
                  <div className="flex-1 overflow-y-auto space-y-3 no-scrollbar">
                     {connectedStudents.length > 0 ? connectedStudents.map((s, i) => (
                       <div key={i} className="p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 flex items-center gap-4">
                          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-lg border border-slate-200">👤</div>
                          <div className="font-black text-slate-700 uppercase italic text-sm">{s}</div>
                          <div className="ml-auto w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                       </div>
                     )) : (
                       <div className="h-full flex flex-col items-center justify-center text-slate-200 italic text-xs text-center px-10">Đang đợi học sinh nhập mã {teacherMaGV}...</div>
                     )}
                  </div>
               </div>

               <div className="bg-white p-8 rounded-[3rem] border-4 border-slate-50 shadow-xl flex flex-col h-1/2 overflow-hidden">
                  <h4 className="text-xl font-black text-slate-800 uppercase italic mb-6 flex items-center gap-3">
                     <span className="w-8 h-8 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center text-sm">📄</span>
                     BỘ ĐỀ ĐÃ NẠP
                  </h4>
                  {loadedSetId ? (
                    <div className="bg-slate-950 p-6 rounded-[2.5rem] text-white flex-1 flex flex-col">
                       <div className="text-[10px] font-black uppercase text-blue-400 mb-2 italic">CHỦ ĐỀ</div>
                       <div className="text-xl font-black uppercase italic leading-tight mb-8 flex-1 line-clamp-3">{loadedSetTitle}</div>
                       <div className="grid grid-cols-2 gap-4">
                          <div className="bg-white/5 p-3 rounded-2xl text-center"><div className="text-[8px] font-black uppercase text-white/50">SỐ CÂU</div><div className="text-xl font-black text-blue-400">{rounds[0]?.problems?.length || 0}</div></div>
                          <div className="bg-white/5 p-3 rounded-2xl text-center"><div className="text-[8px] font-black uppercase text-white/50">VÒNG</div><div className="text-xl font-black text-purple-400">{rounds.length}</div></div>
                       </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-200 italic text-xs text-center px-10">Vui lòng vào tab "Kho đề của tôi" và bấm Sửa để nạp đề vào đây.</div>
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
    </div>
  );
};

export default AdminPanel;
