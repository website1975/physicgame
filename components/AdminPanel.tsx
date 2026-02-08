
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
  liveSessionKey?: number;
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

  useEffect(() => {
    if (adminTab === 'CONTROL') {
      setIsLiveGameActive(false);
      setLiveProblemIdx(0);
      setStudentResults({});
      setIsWhiteboardActive(false);
      if (controlChannelRef.current) {
        controlChannelRef.current.send({
          type: 'broadcast',
          event: 'teacher_reset_room',
          payload: { title: loadedSetTitle }
        });
      }
    }
  }, [liveSessionKey, adminTab, loadedSetTitle]);

  useEffect(() => {
    setCurrentTitle(loadedSetTitle || '');
    setCurrentTopic(loadedSetTopic || 'Khác');
  }, [loadedSetId, loadedSetTitle, loadedSetTopic]);

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

  const handleAIParse = async () => {
    if (!rawText.trim()) {
      notify("Vui lòng nhập văn bản đề bài!", "error");
      return;
    }
    setIsParsing(true);
    try {
      notify("AI đang trích xuất câu hỏi, vui lòng đợi...");
      const newQuestions = await parseQuestionsFromText(rawText);
      if (newQuestions && newQuestions.length > 0) {
        const updated = [...rounds];
        if (updated[activeRoundIdx]) {
          updated[activeRoundIdx].problems = [...updated[activeRoundIdx].problems, ...newQuestions];
          setRounds(updated);
          setRawText('');
          setShowAIInput(false);
          notify(`Đã trích xuất thành công ${newQuestions.length} câu hỏi!`, "success");
        }
      } else {
        notify("AI không tìm thấy câu hỏi nào hợp lệ.", "error");
      }
    } catch (e) {
      notify("Lỗi khi kết nối AI hoặc định dạng văn bản.", "error");
    } finally {
      setIsParsing(false);
    }
  };

  const updateProblem = (idx: number, data: Partial<PhysicsProblem>) => {
    const updated = [...rounds];
    if (updated[activeRoundIdx]) {
      updated[activeRoundIdx].problems[idx] = { ...updated[activeRoundIdx].problems[idx], ...data };
      setRounds(updated);
    }
  };

  const updateOption = (problemIdx: number, optionIdx: number, value: string) => {
    const updated = [...rounds];
    const problem = updated[activeRoundIdx].problems[problemIdx];
    if (problem && problem.options) {
      const newOptions = [...problem.options];
      newOptions[optionIdx] = value;
      problem.options = newOptions;
      setRounds(updated);
    }
  };

  const toggleDSAnswer = (problemIdx: number, optionIdx: number) => {
    const updated = [...rounds];
    const problem = updated[activeRoundIdx].problems[problemIdx];
    if (problem && problem.type === QuestionType.TRUE_FALSE) {
      let currentArr = (problem.correctAnswer || 'SSSS').split('');
      currentArr[optionIdx] = currentArr[optionIdx] === 'Đ' ? 'S' : 'Đ';
      problem.correctAnswer = currentArr.join('');
      setRounds(updated);
    }
  };

  const addNewRound = () => {
    const newRound: Round = { number: rounds.length + 1, problems: [], description: `Chào mừng các bạn đến với Vòng ${rounds.length + 1}!` };
    setRounds([...rounds, newRound]);
    setActiveRoundIdx(rounds.length);
    setEditingIdx(null);
  };

  const addNewProblem = (type: QuestionType) => {
    const newProb: PhysicsProblem = {
      id: Math.random().toString(36).slice(2, 9), 
      title: `Câu hỏi mới`, 
      content: '', 
      type, 
      difficulty: Difficulty.EASY, 
      challenge: DisplayChallenge.NORMAL, 
      challengeNumber: 1, 
      mechanic: type === QuestionType.SHORT_ANSWER ? InteractiveMechanic.CANNON : undefined, 
      correctAnswer: type === QuestionType.TRUE_FALSE ? 'ĐĐĐĐ' : (type === QuestionType.MULTIPLE_CHOICE ? 'A' : ''), 
      explanation: '', 
      topic: currentTopic, 
      timeLimit: 40, 
      options: (type === QuestionType.TRUE_FALSE || type === QuestionType.MULTIPLE_CHOICE) ? ['', '', '', ''] : []
    };
    const updated = [...rounds];
    if (updated[activeRoundIdx]) { 
      updated[activeRoundIdx].problems.push(newProb); 
      setRounds(updated); 
      setEditingIdx(updated[activeRoundIdx].problems.length - 1); 
    }
  };

  const deleteProblem = (idx: number) => {
    const updated = [...rounds];
    if (updated[activeRoundIdx]) { 
      updated[activeRoundIdx].problems.splice(idx, 1); 
      setRounds(updated); 
      setEditingIdx(null); 
      notify("Đã xóa câu hỏi"); 
    }
  };

  const confirmDeleteRound = () => {
    if (roundToDeleteIdx === null) return;
    const updated = rounds.filter((_, i) => i !== roundToDeleteIdx);
    const reindexed = updated.map((r, i) => ({ ...r, number: i + 1 }));
    setRounds(reindexed);
    if (activeRoundIdx >= reindexed.length) {
      setActiveRoundIdx(Math.max(0, reindexed.length - 1));
    }
    setRoundToDeleteIdx(null);
    notify("Đã xóa vòng thi");
  };

  const handleOpenLibrary = async (type: QuestionType) => {
    setLibLoading(true);
    setShowLibModal(true);
    try {
      const questions = await fetchQuestionsLibrary(teacherId, currentGrade, type);
      setLibQuestions(questions);
    } catch (e) {
      notify("Lỗi khi tải thư viện", "error");
    } finally {
      setLibLoading(false);
    }
  };

  const addFromLibrary = (q: PhysicsProblem) => {
    const newProb = { ...q, id: Math.random().toString(36).slice(2, 9) };
    const updated = [...rounds];
    if (updated[activeRoundIdx]) {
      updated[activeRoundIdx].problems.push(newProb);
      setRounds(updated);
      notify("Đã thêm câu hỏi từ thư viện");
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || editingIdx === null) return;
    try { 
      notify("Đang tải ảnh..."); 
      const url = await uploadQuestionImage(file); 
      updateProblem(editingIdx, { imageUrl: url }); 
      notify("Tải ảnh thành công!"); 
    } catch (e) { 
      notify("Lỗi tải ảnh", "error"); 
    }
  };

  const handleStartLiveMatch = () => {
    if (connectedStudents.length === 0) { notify("Cần ít nhất 1 học sinh trong phòng!", "error"); return; }
    if (!loadedSetId) { notify("Hãy nạp đề từ Kho Đề!", "error"); return; }
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
    if (nextIdx >= totalInRound) { notify("Đã hết câu hỏi!", "error"); return; }
    setLiveProblemIdx(nextIdx);
    setStudentResults({}); 
    if (controlChannelRef.current) {
      controlChannelRef.current.send({ type: 'broadcast', event: 'teacher_next_question', payload: { nextIndex: nextIdx } });
      notify(`Đã chuyển sang câu ${nextIdx + 1}!`);
    }
  };

  const toggleWhiteboard = () => {
    const newState = !isWhiteboardActive;
    setIsWhiteboardActive(newState);
    if (controlChannelRef.current) {
      controlChannelRef.current.send({ type: 'broadcast', event: 'teacher_toggle_whiteboard', payload: { active: newState } });
    }
    notify(newState ? "Đã bật Bảng trắng" : "Đã ẩn Bảng trắng");
  };

  const activeProblem = editingIdx !== null && rounds[activeRoundIdx] ? rounds[activeRoundIdx].problems[editingIdx] : null;

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
                  <p className="text-[10px] font-black text-slate-400 uppercase mt-2 italic tracking-widest leading-none">Dữ liệu: {loadedSetTitle || 'Trống'}</p>
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
                          <p className="font-black uppercase italic tracking-[0.3em] text-2xl text-blue-600 animate-pulse">
                            {isLiveGameActive ? "Trận đấu đang diễn ra" : "Đấu trường sẵn sàng"}
                          </p>
                       </div>
                    </div>
                  )}
               </div>
            </div>
            <div className="col-span-4 flex flex-col gap-6">
               <div className="bg-white p-6 rounded-[2.5rem] border-4 border-slate-50 shadow-xl flex flex-col h-[450px]">
                  <h4 className="text-lg font-black text-slate-800 uppercase italic mb-6 flex items-center gap-3">👥 HỌC SINH ({connectedStudents.length})</h4>
                  <div className="flex-1 overflow-y-auto no-scrollbar border-t border-slate-50">
                     {connectedStudents.map((s, i) => (
                        <div key={i} className={`flex items-center gap-4 py-3 px-4 border-b border-slate-50 hover:bg-slate-50 ${studentResults[s]?.answered ? (studentResults[s].isCorrect ? 'bg-emerald-50' : 'bg-red-50') : ''}`}>
                           <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-xs shadow-sm">👤</div>
                           <div className="flex-1 font-bold text-slate-700 uppercase italic text-xs truncate">{s}</div>
                           {studentResults[s] && <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${studentResults[s].isCorrect ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>{studentResults[s].isCorrect ? 'ĐÚNG' : 'SAI'}</span>}
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
      <ConfirmModal isOpen={roundToDeleteIdx !== null} title="Xóa vòng thi?" message="Xác nhận xóa vòng?" onConfirm={() => confirmDeleteRound()} onCancel={() => setRoundToDeleteIdx(null)} isDestructive={true} />

      {/* Header Soạn Thảo */}
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
            <button onClick={() => setShowAIInput(!showAIInput)} className={`px-8 py-6 rounded-[2rem] font-black uppercase italic shadow-lg transition-all text-sm ${showAIInput ? 'bg-slate-900 text-white' : 'bg-emerald-500 text-white'}`}>AI TRÍCH XUẤT ✨</button>
            <button onClick={() => onSaveSet(currentTitle, !loadedSetId, currentTopic, currentGrade)} disabled={isSaving} className="px-12 py-6 bg-blue-600 text-white rounded-[2rem] font-black uppercase italic shadow-lg hover:scale-105 transition-all text-sm">LƯU ĐỀ</button>
          </div>
        </div>

        {showAIInput && (
          <div className="bg-slate-900 p-8 rounded-[2.5rem] border-4 border-slate-800 animate-in slide-in-from-top-4">
            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex-1">
                <label className="text-[10px] font-black text-emerald-400 uppercase mb-3 block italic">Dán văn bản đề bài thô vào đây (AI sẽ tự bóc tách A,B,C,D và a,b,c,d)</label>
                <textarea className="w-full bg-slate-800 border-2 border-slate-700 rounded-3xl p-6 text-white font-medium outline-none min-h-[150px]" value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder="Ví dụ: Câu 1. Một vật... A. 10 B. 20... Câu 2. Xét các ý sau: a) Đúng b) Sai..." />
              </div>
              <button onClick={handleAIParse} disabled={isParsing} className="bg-emerald-500 text-white px-8 py-6 rounded-2xl font-black uppercase italic shadow-xl">TIẾN HÀNH</button>
            </div>
          </div>
        )}
      </div>

      {/* Selector Loại Câu Hỏi */}
      <div className="bg-white px-10 py-6 rounded-[2.5rem] shadow-md border-4 border-slate-100 flex items-center justify-around shrink-0">
         {[
           { type: QuestionType.MULTIPLE_CHOICE, label: 'Trắc Nghiệm', color: 'blue' },
           { type: QuestionType.TRUE_FALSE, label: 'Đúng / Sai', color: 'emerald' },
           { type: QuestionType.SHORT_ANSWER, label: 'Tự Luận', color: 'purple' }
         ].map((item) => (
           <div key={item.type} className="flex flex-col items-center gap-3 px-8 border-x border-slate-50 last:border-r-0 first:border-l-0">
              <span className="text-sm font-black text-slate-800 uppercase italic">{item.label}</span>
              <div className="flex gap-2">
                 <button onClick={() => addNewProblem(item.type)} className="px-8 py-3 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl font-black text-[11px] uppercase hover:bg-slate-900 hover:text-white transition-all">New</button>
                 <button onClick={() => handleOpenLibrary(item.type)} className="px-8 py-3 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl font-black text-[11px] uppercase hover:bg-blue-600 hover:text-white transition-all">CSDL</button>
              </div>
           </div>
         ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        {/* Sidebar Danh sách câu hỏi */}
        <div className="lg:col-span-3 flex flex-col gap-4 max-h-full overflow-hidden">
          <div className="bg-white p-4 rounded-3xl border-4 border-slate-50 shadow-sm flex items-center gap-3 overflow-x-auto no-scrollbar shrink-0">
             {rounds.map((r, i) => (
                <div key={i} className="relative group flex items-center shrink-0">
                  <button onClick={() => { setActiveRoundIdx(i); setEditingIdx(null); }} className={`pl-6 pr-10 py-3 rounded-2xl text-[11px] font-black uppercase border-2 transition-all ${activeRoundIdx === i ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>Vòng {r.number}</button>
                  <button onClick={(e) => { e.stopPropagation(); setRoundToDeleteIdx(i); }} className="absolute right-2 w-6 h-6 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-[10px] font-black">✕</button>
                </div>
             ))}
             <button onClick={addNewRound} className="px-6 py-3 rounded-2xl text-[11px] font-black text-blue-600 border-2 border-dashed border-blue-200 uppercase">+ VÒNG</button>
          </div>
          <div className="bg-white rounded-[2rem] p-5 shadow-md border-2 border-slate-50 flex-1 overflow-y-auto no-scrollbar flex flex-col gap-4">
            <div className="space-y-2">
              {rounds[activeRoundIdx]?.problems.map((p, i) => (
                <button key={p.id} onClick={() => setEditingIdx(i)} className={`w-full p-4 rounded-2xl text-left border-4 transition-all ${editingIdx === i ? 'bg-blue-600 border-blue-400 text-white shadow-lg' : 'bg-slate-50 border-white text-slate-500 hover:bg-slate-100'}`}>
                  <div className="text-[11px] font-black uppercase italic">Câu {i+1}</div>
                  <div className="text-[9px] font-bold opacity-70 uppercase truncate">{p.content || 'Nội dung mới...'}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Vùng Editor Chi Tiết */}
        <div className="lg:col-span-9 bg-white rounded-[3rem] shadow-xl p-10 overflow-y-auto no-scrollbar border-4 border-slate-50 relative">
          {activeProblem && editingIdx !== null ? (
            <div className="max-w-4xl mx-auto space-y-10 pb-20 animate-in fade-in text-left">
               <div className="flex justify-between items-center border-b-4 border-slate-50 pb-6">
                  <div>
                    <h3 className="text-4xl font-black text-slate-800 uppercase italic">EDITOR</h3>
                    <p className="text-[11px] font-black text-blue-500 uppercase mt-2 tracking-widest">CÂU {editingIdx + 1} • {activeProblem.type === 'TN' ? 'TRẮC NGHIỆM' : activeProblem.type === 'DS' ? 'ĐÚNG/SAI' : 'TRẢ LỜI NGẮN'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => fileInputRef.current?.click()} className="px-6 py-3 bg-white border-2 border-slate-100 text-slate-400 rounded-xl font-black uppercase italic text-[10px] shadow-sm">🖼️ Ảnh</button>
                    <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
                    <button onClick={() => deleteProblem(editingIdx)} className="px-6 py-3 bg-red-50 text-red-500 border-2 border-red-100 rounded-xl font-black uppercase text-[10px]">Xóa câu ✕</button>
                  </div>
               </div>

               {/* Nội dung câu hỏi */}
               <div className="space-y-4">
                  <label className="text-[11px] font-black text-slate-400 uppercase italic px-2 block">Nội dung câu hỏi (Dùng $ $ cho công thức)</label>
                  <textarea className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl font-bold text-xl min-h-[120px] outline-none focus:border-blue-200" value={activeProblem.content} onChange={e => updateProblem(editingIdx, { content: e.target.value })} />
                  <div className="p-6 bg-white rounded-3xl border-4 border-dashed border-slate-100"><LatexRenderer content={activeProblem.content || "Xem trước nội dung..."} /></div>
               </div>

               {/* Vùng Đáp Án Cấu Trúc Theo Loại */}
               <div className="bg-slate-50 p-8 rounded-[3rem] border-2 border-slate-100 space-y-8">
                  <h4 className="text-xl font-black text-slate-800 uppercase italic border-b-2 border-slate-200 pb-3">THIẾT LẬP ĐÁP ÁN</h4>
                  
                  {activeProblem.type === QuestionType.MULTIPLE_CHOICE && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       {['A', 'B', 'C', 'D'].map((label, i) => (
                         <div key={label} className="relative">
                            <label className="text-[11px] font-black text-blue-500 uppercase mb-2 block ml-2">Lựa chọn {label}</label>
                            <div className="flex gap-2">
                               <button 
                                 onClick={() => updateProblem(editingIdx, { correctAnswer: label })}
                                 className={`w-14 h-14 rounded-2xl font-black text-xl flex items-center justify-center transition-all shadow-md ${activeProblem.correctAnswer === label ? 'bg-blue-600 text-white border-b-4 border-blue-800' : 'bg-white text-slate-300 border-2 border-slate-100'}`}
                               >
                                 {label}
                               </button>
                               <input 
                                 type="text" 
                                 className="flex-1 bg-white border-2 border-slate-100 rounded-2xl px-5 py-3 font-bold text-slate-700 outline-none focus:border-blue-400"
                                 value={activeProblem.options?.[i] || ''}
                                 onChange={e => updateOption(editingIdx, i, e.target.value)}
                                 placeholder={`Nội dung phương án ${label}...`}
                               />
                            </div>
                         </div>
                       ))}
                    </div>
                  )}

                  {activeProblem.type === QuestionType.TRUE_FALSE && (
                    <div className="space-y-4">
                       {['a', 'b', 'c', 'd'].map((label, i) => {
                         const currentDS = (activeProblem.correctAnswer || 'SSSS')[i];
                         return (
                           <div key={label} className="flex flex-col md:flex-row gap-4 bg-white p-5 rounded-[2rem] border-2 border-slate-100 shadow-sm items-center">
                              <span className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center font-black italic">{label})</span>
                              <input 
                                type="text" 
                                className="flex-1 bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-3 font-bold outline-none focus:border-emerald-400"
                                value={activeProblem.options?.[i] || ''}
                                onChange={e => updateOption(editingIdx, i, e.target.value)}
                                placeholder="Nhập ý mệnh đề..."
                              />
                              <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-2 shrink-0">
                                 <button onClick={() => toggleDSAnswer(editingIdx, i)} className={`px-5 py-2 rounded-xl font-black text-xs transition-all ${currentDS === 'Đ' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-400'}`}>ĐÚNG</button>
                                 <button onClick={() => toggleDSAnswer(editingIdx, i)} className={`px-5 py-2 rounded-xl font-black text-xs transition-all ${currentDS === 'S' ? 'bg-red-500 text-white shadow-lg' : 'text-slate-400'}`}>SAI</button>
                              </div>
                           </div>
                         );
                       })}
                    </div>
                  )}

                  {activeProblem.type === QuestionType.SHORT_ANSWER && (
                    <div className="bg-white p-8 rounded-[2.5rem] border-2 border-slate-100 shadow-sm">
                       <label className="text-[10px] font-black text-purple-500 uppercase italic mb-3 block tracking-widest text-center">ĐÁP ÁN CHÍNH XÁC (TL)</label>
                       <input 
                        type="text" 
                        className="w-full bg-slate-50 border-4 border-slate-100 rounded-3xl p-6 font-black text-center text-3xl text-purple-600 outline-none focus:border-purple-400 transition-all shadow-inner"
                        placeholder="VD: 10.5 hoặc v/t..."
                        value={activeProblem.correctAnswer}
                        onChange={e => updateProblem(editingIdx, { correctAnswer: e.target.value })}
                       />
                    </div>
                  )}
               </div>

               {/* Vùng Lời Giải Chi Tiết */}
               <div className="bg-emerald-50/30 p-8 rounded-[3rem] border-2 border-emerald-100 space-y-4">
                  <h4 className="text-xl font-black text-emerald-700 uppercase italic flex items-center gap-2">📖 LỜI GIẢI CHI TIẾT</h4>
                  <textarea 
                    className="w-full p-6 bg-white border-2 border-emerald-100 rounded-3xl font-medium text-slate-600 min-h-[150px] outline-none focus:border-emerald-400 italic"
                    placeholder="Nhập hướng dẫn giải, các bước tính toán chi tiết..."
                    value={activeProblem.explanation}
                    onChange={e => updateProblem(editingIdx, { explanation: e.target.value })}
                  />
                  <div className="p-6 bg-white/50 rounded-3xl border border-emerald-100 text-slate-500">
                     <div className="text-[10px] font-black uppercase text-emerald-400 mb-2">Xem trước lời giải:</div>
                     <LatexRenderer content={activeProblem.explanation || "Chưa có lời giải chi tiết..."} />
                  </div>
               </div>

               {/* Cấu hình nâng cao */}
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block ml-2">Thử thách</label>
                   <select className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs" value={activeProblem.challenge} onChange={e => updateProblem(editingIdx, { challenge: e.target.value as DisplayChallenge })}>{Object.values(DisplayChallenge).map(c => <option key={c} value={c}>{c}</option>)}</select>
                 </div>
                 <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block ml-2">Arena Game</label>
                   <select className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs" value={activeProblem.mechanic || InteractiveMechanic.CANNON} onChange={e => updateProblem(editingIdx, { mechanic: e.target.value as InteractiveMechanic })}>{Object.values(InteractiveMechanic).map(m => <option key={m} value={m}>{m}</option>)}</select>
                 </div>
                 <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block ml-2">Thời gian (s)</label>
                   <input type="number" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black" value={activeProblem.timeLimit} onChange={e => updateProblem(editingIdx, { timeLimit: parseInt(e.target.value) })} />
                 </div>
               </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center opacity-20 text-center"><div className="text-[10rem] mb-6 select-none">✏️</div><p className="font-black uppercase italic tracking-widest text-2xl text-slate-400">CHỌN CÂU HỎI ĐỂ SOẠN THẢO</p></div>
          )}
        </div>
      </div>

      {showLibModal && (
        <div className="fixed inset-0 z-[11000] flex items-center justify-center p-6">
           <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={() => setShowLibModal(false)}></div>
           <div className="bg-white rounded-[3rem] w-full max-w-5xl h-[85vh] flex flex-col relative z-10 border-4 border-slate-100 shadow-2xl overflow-hidden animate-in zoom-in">
              <header className="p-8 border-b-2 border-slate-50 flex justify-between items-center bg-slate-50">
                 <div><h3 className="text-3xl font-black text-slate-800 uppercase italic">THƯ VIỆN CÂU HỎI</h3><p className="text-[10px] font-black text-blue-500 uppercase mt-2">Dữ liệu từ Khối {currentGrade}</p></div>
                 <button onClick={() => setShowLibModal(false)} className="w-12 h-12 bg-white text-slate-400 rounded-xl flex items-center justify-center font-black">✕</button>
              </header>
              <div className="flex-1 overflow-y-auto p-8 space-y-4 no-scrollbar">
                 {libLoading ? <div className="h-full flex flex-col items-center justify-center"><div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div> : libQuestions.length > 0 ? libQuestions.map((q, i) => (
                    <div key={i} className="bg-slate-50 p-6 rounded-3xl border-2 border-slate-100 flex items-center gap-6 hover:border-blue-200 transition-all group">
                       <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2"><span className="px-2 py-0.5 bg-blue-100 text-blue-600 text-[9px] font-black uppercase rounded">{q.type}</span><span className="text-[10px] font-black text-slate-400 uppercase italic">{q.topic}</span></div>
                          <h5 className="font-bold text-slate-700 line-clamp-1">{q.content}</h5>
                       </div>
                       <button onClick={() => addFromLibrary(q)} className="px-6 py-3 bg-blue-600 text-white font-black rounded-xl uppercase italic text-[10px] opacity-0 group-hover:opacity-100 transition-all shadow-lg">+ Thêm</button>
                    </div>
                 )) : <div className="h-full flex flex-col items-center justify-center text-slate-300 italic">Chưa có dữ liệu.</div>}
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
