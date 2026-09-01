
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { PhysicsProblem, Round, Difficulty, QuestionType, DisplayChallenge, InteractiveMechanic } from '../../types';
import LatexRenderer from '../LatexRenderer';
import { uploadQuestionImage, fetchQuestionsLibrary } from '../../services/supabaseService';
import { parseQuestionsFromText } from '../../services/geminiService';
import { parseExamJSON, ParsedExamResult } from '../../services/jsonExamImporter';
import { getChaptersForGrade, joinTopic } from '../../services/curriculumData';
import ConfirmModal from '../ConfirmModal';

interface EditorPanelProps {
  rounds: Round[];
  setRounds: (rounds: Round[]) => void;
  teacherId: string;
  loadedSetId: string | null;
  loadedSetTitle: string;
  loadedSetTopic?: string | null;
  onSaveSet: (title: string, asNew: boolean, topic: string, grade: string) => Promise<void>;
  onResetToNew: () => void;
  initialTopicData?: { grade: string; chapter: string; week: string } | null;
  onClearInitialTopicData?: () => void;
}

const EditorPanel: React.FC<EditorPanelProps> = ({ 
  rounds, setRounds, teacherId, loadedSetId, loadedSetTitle, loadedSetTopic, onSaveSet, onResetToNew,
  initialTopicData, onClearInitialTopicData 
}) => {
  const [activeRoundIdx, setActiveRoundIdx] = useState(0);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [rawText, setRawText] = useState('');
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [showAIInput, setShowAIInput] = useState(false);
  
  // State địa phương cho các ô nhập liệu
  const [currentTitle, setCurrentTitle] = useState(loadedSetTitle || '');
  const [currentTopic, setCurrentTopic] = useState(loadedSetTopic || '');
  const [currentGrade, setCurrentGrade] = useState('10');
  const [isCustomTopicMode, setIsCustomTopicMode] = useState(false);
  
  const [roundToDeleteIdx, setRoundToDeleteIdx] = useState<number | null>(null);
  const [showLibModal, setShowLibModal] = useState(false);
  const [libQuestions, setLibQuestions] = useState<PhysicsProblem[]>([]);
  const [libLoading, setLibLoading] = useState(false);
  const [libVisibleCount, setLibVisibleCount] = useState(20);
  const [showSaveOptions, setShowSaveOptions] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);
  
  // State nhập từ JSON
  const [showJSONModal, setShowJSONModal] = useState(false);
  const [rawJSONText, setRawJSONText] = useState('');
  const [isImportingJSON, setIsImportingJSON] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonFileInputRef = useRef<HTMLInputElement>(null);

  // Version counter to force re-computation when curriculum is edited
  const [curriculumVersion, setCurriculumVersion] = useState(0);

  useEffect(() => {
    const handleCurriculumUpdate = () => {
      setCurriculumVersion(v => v + 1);
    };
    window.addEventListener('physiquest_curriculum_updated', handleCurriculumUpdate);
    window.addEventListener('storage', handleCurriculumUpdate);
    return () => {
      window.removeEventListener('physiquest_curriculum_updated', handleCurriculumUpdate);
      window.removeEventListener('storage', handleCurriculumUpdate);
    };
  }, []);

  // Danh sách các chương và tuần tương ứng với khối đang chọn
  const chaptersForCurrentGrade = useMemo(() => {
    return getChaptersForGrade(currentGrade, teacherId);
  }, [currentGrade, teacherId, curriculumVersion]);

  // QUAN TRỌNG: Đồng bộ state khi chọn đề từ thư viện hoặc từ cây chương trình
  useEffect(() => {
    if (initialTopicData) {
      setCurrentGrade(initialTopicData.grade || '10');
      const fullTopic = initialTopicData.week 
        ? `${initialTopicData.chapter} - ${initialTopicData.week}` 
        : initialTopicData.chapter;
      setCurrentTopic(fullTopic);
      setIsCustomTopicMode(false);
      if (!currentTitle) {
        setCurrentTitle(initialTopicData.week || initialTopicData.chapter);
      }
      if (onClearInitialTopicData) onClearInitialTopicData();
    } else {
      setCurrentTitle(loadedSetTitle || '');
      const t = loadedSetTopic || '';
      setCurrentTopic(t);
      setIsCustomTopicMode(false);
      const firstProb = rounds[0]?.problems?.[0];
      if (firstProb?.grade) setCurrentGrade(firstProb.grade);
    }
  }, [loadedSetId, loadedSetTitle, loadedSetTopic, initialTopicData]);

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

  const handleAIParse = async () => {
    if (!rawText.trim()) return;
    setIsParsing(true);
    try {
      // Lưu key vào localStorage để tiện dùng lần sau
      if (geminiKey) localStorage.setItem('gemini_api_key', geminiKey);
      
      const newQuestions = await parseQuestionsFromText(rawText, geminiKey);
      const updated = [...rounds];
      updated[activeRoundIdx].problems = [...updated[activeRoundIdx].problems, ...newQuestions];
      setRounds(updated);
      setRawText('');
      setShowAIInput(false);
    } catch (e: any) { 
      console.error(e);
      setValidationError(e.message || "Lỗi khi xử lý AI");
    } finally { setIsParsing(false); }
  };

  const handleApplyParsedExam = (result: ParsedExamResult) => {
    if (result.title) setCurrentTitle(result.title);
    if (result.grade) setCurrentGrade(result.grade);
    // If JSON has no chapter/week, result.topic is empty ''
    setCurrentTopic(result.topic || '');
    setIsCustomTopicMode(false);

    setRounds(result.rounds);
    setActiveRoundIdx(0);
    setEditingIdx(result.rounds[0]?.problems?.length > 0 ? 0 : null);
    
    const weekNotice = !result.topic ? ' 👉 Xin hãy chọn Tuần cho đề thi.' : '';
    setImportSuccessMsg(
      `Đã nạp ${result.totalQuestions} câu hỏi (${result.mcqCount} câu TN Vòng 1, ${result.tfCount} câu Đ/S Vòng 2, ${result.shortCount} câu Trả lời ngắn Vòng 3)!${weekNotice}`
    );
    setShowJSONModal(false);
    setRawJSONText('');
  };

  const handleJSONFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImportingJSON(true);
    setValidationError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const result = parseExamJSON(text);
        handleApplyParsedExam(result);
      } catch (err: any) {
        console.error(err);
        setValidationError(err.message || 'Lỗi khi đọc file JSON. Vui lòng kiểm tra lại cấu trúc file!');
      } finally {
        setIsImportingJSON(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.onerror = () => {
      setValidationError('Không thể đọc file đã chọn.');
      setIsImportingJSON(false);
      if (e.target) e.target.value = '';
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleJSONTextSubmit = () => {
    if (!rawJSONText.trim()) {
      setValidationError('Vui lòng dán nội dung JSON vào ô nhập!');
      return;
    }
    setIsImportingJSON(true);
    setValidationError(null);
    try {
      const result = parseExamJSON(rawJSONText);
      handleApplyParsedExam(result);
    } catch (err: any) {
      console.error(err);
      setValidationError(err.message || 'Dữ liệu JSON không hợp lệ hoặc thiếu câu hỏi!');
    } finally {
      setIsImportingJSON(false);
    }
  };

  const addNewRound = () => {
    const newRound: Round = { number: rounds.length + 1, problems: [], description: '' };
    setRounds([...rounds, newRound]);
    setActiveRoundIdx(rounds.length);
  };

  const deleteRound = (idx: number) => {
    if (rounds.length <= 1) return;
    const updated = rounds.filter((_, i) => i !== idx).map((r, i) => ({ ...r, number: i + 1 }));
    setRounds(updated);
    setActiveRoundIdx(Math.max(0, activeRoundIdx - 1));
  };

  const addNewProblem = (type: QuestionType) => {
    const newProb: PhysicsProblem = {
      id: Math.random().toString(36).slice(2, 9),
      title: `Câu hỏi ${rounds[activeRoundIdx].problems.length + 1}`, 
      content: '', 
      type, 
      difficulty: Difficulty.EASY,
      challenge: DisplayChallenge.NORMAL, 
      correctAnswer: type === QuestionType.TRUE_FALSE ? 'SSSS' : (type === QuestionType.MULTIPLE_CHOICE ? 'A' : ''),
      explanation: '', 
      topic: currentTopic, 
      timeLimit: 40,
      options: (type === QuestionType.TRUE_FALSE || type === QuestionType.MULTIPLE_CHOICE) ? ['', '', '', ''] : []
    };
    const updated = [...rounds];
    updated[activeRoundIdx].problems.push(newProb);
    setRounds(updated);
    setEditingIdx(updated[activeRoundIdx].problems.length - 1);
  };

  const moveProblem = (idx: number, direction: 'up' | 'down') => {
    const updated = [...rounds];
    const problems = [...updated[activeRoundIdx].problems];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    
    if (targetIdx < 0 || targetIdx >= problems.length) return;
    
    const [movedItem] = problems.splice(idx, 1);
    problems.splice(targetIdx, 0, movedItem);
    
    updated[activeRoundIdx].problems = problems;
    setRounds(updated);
    
    // Cập nhật vị trí đang sửa nếu cần
    if (editingIdx === idx) {
      setEditingIdx(targetIdx);
    } else if (editingIdx === targetIdx) {
      setEditingIdx(idx);
    }
  };

  const handleOpenLibrary = async (type: QuestionType) => {
    setLibLoading(true); 
    setShowLibModal(true);
    setLibVisibleCount(20);
    try {
      const questions = await fetchQuestionsLibrary(teacherId, currentGrade, type);
      setLibQuestions(questions);
    } catch (e) { console.error(e); } finally { setLibLoading(false); }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || editingIdx === null) return;
    try {
      setValidationError(null);
      const url = await uploadQuestionImage(file);
      updateProblem(editingIdx, { imageUrl: url });
    } catch (err: any) { 
      console.error(err); 
      setValidationError(err.message || "Không thể tải ảnh lên. Có thể dịch vụ đang bị giới hạn.");
    } finally {
      if (e.target) e.target.value = ''; // Reset input
    }
  };

  const validateAndSave = (asNew: boolean = false) => {
    setValidationError(null);
    if (!currentTitle.trim()) {
      setValidationError("Vui lòng nhập Tên bộ đề!");
      return;
    }
    
    setIsSaving(true);
    onSaveSet(currentTitle, asNew, currentTopic, currentGrade)
      .then(() => {
        setShowSaveOptions(false);
      })
      .finally(() => {
        setIsSaving(false);
      });
  };

  const activeProblem = editingIdx !== null ? rounds[activeRoundIdx]?.problems[editingIdx] : null;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full overflow-hidden text-left">
      <ConfirmModal 
        isOpen={roundToDeleteIdx !== null} 
        title="Xóa vòng thi?" 
        message="Dữ liệu vòng này bao gồm toàn bộ câu hỏi sẽ bị mất. Bạn có chắc chắn?" 
        onConfirm={() => { deleteRound(roundToDeleteIdx!); setRoundToDeleteIdx(null); }} 
        onCancel={() => setRoundToDeleteIdx(null)} 
        isDestructive 
      />

      {showSaveOptions && (
        <div className="fixed inset-0 z-[11000] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={() => !isSaving && setShowSaveOptions(false)}></div>
          <div className="bg-white rounded-[3rem] p-10 shadow-2xl max-w-md w-full relative z-10 border-4 border-slate-100 animate-in zoom-in">
             <h3 className="text-2xl font-black text-slate-800 uppercase italic mb-6 text-center">Lựa chọn lưu trữ</h3>
             <p className="text-slate-500 font-bold text-center mb-8 italic">Bạn đang chỉnh sửa một bộ đề cũ. Bạn muốn lưu đè lên hay tạo bản sao mới?</p>
             <div className="grid grid-cols-1 gap-4">
                <button 
                  disabled={isSaving}
                  onClick={() => validateAndSave(false)} 
                  className="py-5 bg-blue-600 text-white rounded-2xl font-black uppercase italic shadow-lg border-b-4 border-blue-800 active:translate-y-1 active:border-b-0 transition-all disabled:opacity-50"
                >
                  {isSaving ? 'ĐANG LƯU...' : 'Lưu thay đổi (Save) 💾'}
                </button>
                <button 
                  disabled={isSaving}
                  onClick={() => validateAndSave(true)} 
                  className="py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase italic shadow-lg border-b-4 border-emerald-800 active:translate-y-1 active:border-b-0 transition-all disabled:opacity-50"
                >
                  {isSaving ? 'ĐANG LƯU...' : 'Lưu thành bản mới (Save As) 🆕'}
                </button>
                <button 
                  disabled={isSaving}
                  onClick={() => setShowSaveOptions(false)} 
                  className="py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase italic"
                >
                  Hủy
                </button>
             </div>
          </div>
        </div>
      )}

      {validationError && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[12000] bg-red-600 text-white px-8 py-3 rounded-full font-black text-xs uppercase shadow-2xl animate-in slide-in-from-top-4 flex items-center gap-4">
           <span>⚠️ {validationError}</span>
           <button onClick={() => setValidationError(null)} className="font-black opacity-50 hover:opacity-100">✕</button>
        </div>
      )}

      {importSuccessMsg && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[12000] bg-emerald-600 text-white px-8 py-3.5 rounded-full font-black text-xs uppercase shadow-2xl animate-in slide-in-from-top-4 flex items-center gap-4">
           <span>🎉 {importSuccessMsg}</span>
           <button onClick={() => setImportSuccessMsg(null)} className="font-black opacity-50 hover:opacity-100">✕</button>
        </div>
      )}

      <input 
        type="file" 
        ref={jsonFileInputRef} 
        accept=".json,application/json" 
        className="hidden" 
        onChange={handleJSONFileSelect} 
      />

      <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border-4 border-slate-100 flex flex-col gap-6 shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex-1 grid grid-cols-12 gap-3 items-end">
            <div className="col-span-4">
              <label className="text-[10px] font-black text-slate-400 uppercase italic block mb-1">Tên bộ đề</label>
              <input 
                type="text" 
                className={`w-full bg-slate-50 border-2 rounded-2xl px-4 py-3 font-black text-sm outline-none transition-all ${!currentTitle.trim() && validationError ? 'border-red-500 bg-red-50' : 'border-slate-100 focus:border-blue-400'}`} 
                value={currentTitle} 
                onChange={e => { setCurrentTitle(e.target.value); if(validationError) setValidationError(null); }} 
                placeholder="Ví dụ: Đề ôn thi Giữa kỳ 1" 
              />
            </div>
            
            <div className="col-span-2">
              <label className="text-[10px] font-black text-slate-400 uppercase italic block mb-1">Khối</label>
              <select 
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-3 py-3 font-black text-sm outline-none focus:border-blue-400 cursor-pointer" 
                value={currentGrade} 
                onChange={e => {
                  const newGrade = e.target.value;
                  setCurrentGrade(newGrade);
                  // Khi đổi khối, reset tuần để giáo viên chọn tuần tương ứng của khối mới
                  setCurrentTopic('');
                  setIsCustomTopicMode(false);
                }}
              >
                {['10', '11', '12'].map(g => <option key={g} value={g}>Khối {g}</option>)}
              </select>
            </div>

            <div className="col-span-6">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-black text-blue-500 uppercase italic flex items-center gap-1.5">
                  <span>📅 Tuần / Chuyên đề</span>
                  <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[9px] font-black">Khối {currentGrade}</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsCustomTopicMode(!isCustomTopicMode)}
                  className="text-[9px] font-black text-slate-400 hover:text-blue-600 uppercase underline"
                >
                  {isCustomTopicMode ? '📋 Chọn theo danh mục' : '✏️ Nhập tự do'}
                </button>
              </div>
              
              {isCustomTopicMode ? (
                <input 
                  type="text" 
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-black text-sm outline-none focus:border-blue-400" 
                  value={currentTopic} 
                  onChange={e => setCurrentTopic(e.target.value)} 
                  placeholder="Nhập tên chương / tuần / chủ đề tự do..." 
                />
              ) : (
                <select 
                  className={`w-full bg-slate-50 border-2 rounded-2xl px-3 py-3 font-black text-sm outline-none transition-all cursor-pointer truncate ${!currentTopic ? 'border-amber-300 text-slate-400 bg-amber-50/30' : 'border-slate-100 text-slate-800 focus:border-blue-400'}`} 
                  value={currentTopic} 
                  onChange={e => {
                    if (e.target.value === '__CUSTOM__') {
                      setIsCustomTopicMode(true);
                    } else {
                      setCurrentTopic(e.target.value);
                    }
                  }}
                >
                  <option value="">-- Chưa chọn Tuần (Để trống) --</option>
                  {chaptersForCurrentGrade.map(chap => (
                    <optgroup key={chap.id} label={chap.name}>
                      <option value={chap.name}>📂 {chap.name} (Cả chương)</option>
                      {chap.weeks.map(w => (
                        <option key={w.id} value={joinTopic(chap.name, w.name)}>
                          &nbsp;&nbsp;🔹 {w.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  <option value="__CUSTOM__">✏️ Nhập chuyên đề tự do khác...</option>
                </select>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setShowJSONModal(true)} 
              className="px-6 py-5 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black italic text-sm shadow-lg flex items-center gap-2 border-b-4 border-amber-700 active:border-b-0 active:translate-y-1 transition-all"
              title="Nhập đề từ file JSON (Vòng 1: TN 4 lựa chọn, Vòng 2: Đúng/Sai, Vòng 3: Trả lời ngắn)"
            >
              <span>📥</span>
              <span>NHẬP JSON</span>
            </button>
            <button onClick={() => setShowAIInput(!showAIInput)} className="px-6 py-5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black italic text-sm shadow-lg border-b-4 border-emerald-700 active:border-b-0 active:translate-y-1 transition-all">AI ✨</button>
            <button 
              disabled={isSaving}
              onClick={() => {
                if (loadedSetId) setShowSaveOptions(true);
                else validateAndSave(true);
              }} 
              className="px-10 py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black italic text-sm shadow-lg border-b-4 border-blue-800 active:border-b-0 active:translate-y-1 transition-all disabled:opacity-50"
            >
              {isSaving ? 'ĐANG LƯU...' : 'LƯU ĐỀ'}
            </button>
          </div>
        </div>
        {showAIInput && (
          <div className="bg-slate-900 p-6 rounded-[2rem] border-4 border-slate-800 animate-in slide-in-from-top-2 space-y-4">
             <div>
                <label className="text-[10px] font-black text-emerald-400 uppercase italic block mb-2">Gemini API Key (Cá nhân)</label>
                <input 
                  type="password" 
                  className="w-full bg-slate-800 border-2 border-slate-700 rounded-xl px-4 py-2 text-white text-xs font-mono outline-none focus:border-emerald-500" 
                  value={geminiKey} 
                  onChange={e => setGeminiKey(e.target.value)} 
                  placeholder="Dán API Key của bạn vào đây..." 
                />
                <p className="text-[9px] text-slate-500 mt-1 italic">* Key này chỉ dùng trong phiên làm việc hiện tại, không được lưu trữ vĩnh viễn.</p>
             </div>
             <div>
                <label className="text-[10px] font-black text-slate-400 uppercase italic block mb-2">Nội dung đề thô</label>
                <textarea className="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl p-4 text-white min-h-[120px] text-sm" value={rawText} onChange={e => setRawText(e.target.value)} placeholder="Dán văn bản đề thi vào đây (AI sẽ tự bóc tách)..." />
             </div>
             <div className="flex justify-end">
                <button onClick={handleAIParse} disabled={isParsing} className="px-10 py-4 bg-emerald-500 text-white rounded-2xl font-black uppercase italic text-sm shadow-lg active:translate-y-1 transition-all">
                  {isParsing ? 'ĐANG XỬ LÝ...' : 'TRÍCH XUẤT ĐỀ ✨'}
                </button>
             </div>
          </div>
        )}
      </div>

      <div className="bg-white px-8 py-4 rounded-[2.5rem] shadow-md border-4 border-slate-100 flex items-center justify-around shrink-0">
         {[QuestionType.MULTIPLE_CHOICE, QuestionType.TRUE_FALSE, QuestionType.SHORT_ANSWER, QuestionType.EXTERNAL_GAME].map(type => (
           <div key={type} className="flex gap-2">
              <button onClick={() => addNewProblem(type)} className="px-6 py-2 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase">Thêm {type}</button>
              {type !== QuestionType.EXTERNAL_GAME && (
                <button onClick={() => handleOpenLibrary(type)} className="px-6 py-2 bg-blue-50 text-blue-600 rounded-xl font-black text-[10px] uppercase">CSDL</button>
              )}
           </div>
         ))}
      </div>

      <div className="grid grid-cols-12 gap-6 flex-1 min-h-0 overflow-hidden">
        <div className="col-span-3 flex flex-col gap-4 overflow-hidden">
          <div className="bg-white p-3 rounded-2xl border-4 border-slate-50 flex gap-2 overflow-x-auto no-scrollbar shrink-0 items-center">
             {rounds.map((r, i) => (
                <div key={i} className="relative group shrink-0">
                  <button onClick={() => { setActiveRoundIdx(i); setEditingIdx(null); }} className={`px-4 py-2 pr-8 rounded-xl text-[10px] font-black border-2 transition-all ${activeRoundIdx === i ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>Vòng {r.number}</button>
                  <button onClick={(e) => { e.stopPropagation(); setRoundToDeleteIdx(i); }} className="absolute right-1 top-1/2 -translate-y-1/2 text-red-500 opacity-0 group-hover:opacity-100 p-1">✕</button>
                </div>
             ))}
             <button onClick={addNewRound} className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl font-black flex items-center justify-center border-2 border-dashed border-blue-200 shrink-0">+</button>
          </div>

          <div className="bg-white p-4 rounded-2xl border-4 border-slate-50 shadow-sm shrink-0">
             <label className="text-[9px] font-black text-slate-400 uppercase italic block mb-2">Mô tả vòng {activeRoundIdx + 1}</label>
             <textarea 
               className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-bold outline-none focus:border-blue-200 resize-none h-16 no-scrollbar"
               placeholder="Lời giới thiệu cho vòng đấu..."
               value={rounds[activeRoundIdx]?.description || ''}
               onChange={e => {
                 const updated = [...rounds];
                 updated[activeRoundIdx].description = e.target.value;
                 setRounds(updated);
               }}
             />
          </div>

          <div className="bg-white rounded-[2rem] p-4 shadow-md flex-1 overflow-y-auto no-scrollbar flex flex-col gap-2">
             {rounds[activeRoundIdx]?.problems.map((p, i) => (
                <div key={p.id} className="relative group">
                  <button 
                    onClick={() => setEditingIdx(i)} 
                    className={`w-full p-4 rounded-2xl text-left border-4 transition-all ${editingIdx === i ? 'bg-blue-600 border-blue-400 text-white shadow-lg' : 'bg-slate-50 border-white text-slate-500'}`}
                  >
                    <div className="text-[10px] font-black uppercase italic">Câu {i+1} - {p.type}</div>
                    <div className="text-[11px] font-bold truncate pr-8">{p.title || 'Không có tiêu đề'}</div>
                    <div className="text-[9px] font-bold opacity-60 truncate">{p.content || '...'}</div>
                  </button>
                  
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      disabled={i === 0}
                      onClick={(e) => { e.stopPropagation(); moveProblem(i, 'up'); }}
                      className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] shadow-sm ${i === 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-white text-slate-600 hover:bg-blue-50'}`}
                      title="Di chuyển lên"
                    >
                      ▲
                    </button>
                    <button 
                      disabled={i === rounds[activeRoundIdx].problems.length - 1}
                      onClick={(e) => { e.stopPropagation(); moveProblem(i, 'down'); }}
                      className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] shadow-sm ${i === rounds[activeRoundIdx].problems.length - 1 ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-white text-slate-600 hover:bg-blue-50'}`}
                      title="Di chuyển xuống"
                    >
                      ▼
                    </button>
                  </div>
                </div>
             ))}
          </div>
        </div>

        <div className="col-span-9 bg-white rounded-[3.5rem] shadow-xl p-8 overflow-y-auto no-scrollbar border-4 border-slate-50">
          {activeProblem ? (
            <div className="space-y-8 pb-10">
               <div className="flex justify-between items-center border-b-2 border-slate-100 pb-4">
                  <div className="flex-1 mr-4">
                    <label className="text-[9px] font-black text-slate-400 uppercase italic block mb-1">Tiêu đề câu hỏi</label>
                    <input 
                      type="text" 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 font-black text-sm outline-none focus:border-blue-300"
                      value={activeProblem.title}
                      onChange={e => updateProblem(editingIdx!, { title: e.target.value })}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-slate-100 text-slate-500 rounded-xl font-black uppercase text-[10px] flex items-center gap-2">🖼️ Ảnh</button>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                    <button onClick={() => {
                      const updated = [...rounds]; updated[activeRoundIdx].problems.splice(editingIdx!, 1);
                      setRounds(updated); setEditingIdx(null);
                    }} className="px-4 py-2 bg-red-50 text-red-500 rounded-xl font-black text-[10px] uppercase">Xóa ✕</button>
                  </div>
               </div>

               <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase italic">Nội dung câu hỏi</label>
                  <textarea className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-lg min-h-[100px]" value={activeProblem.content} onChange={e => updateProblem(editingIdx!, { content: e.target.value })} />
                  <div className="p-4 bg-white rounded-2xl border-2 border-dashed border-slate-50"><LatexRenderer content={activeProblem.content || "..."} /></div>
               </div>

               {activeProblem.imageUrl && (
                 <div className="relative w-48 h-32 rounded-xl overflow-hidden border-2 border-slate-100">
                    <img src={activeProblem.imageUrl} className="w-full h-full object-cover" alt="Question" />
                    <button onClick={() => updateProblem(editingIdx!, { imageUrl: undefined })} className="absolute top-1 right-1 bg-red-500 text-white w-6 h-6 rounded-full text-xs">✕</button>
                 </div>
               )}

               <div className="bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100">
                  <h4 className="text-sm font-black text-slate-800 uppercase italic mb-4">THIẾT LẬP ĐÁP ÁN</h4>
                  
                  {activeProblem.type === QuestionType.MULTIPLE_CHOICE && (
                    <div className="grid grid-cols-2 gap-4">
                      {['A','B','C','D'].map((l, i) => (
                        <div key={l} className="flex gap-2">
                            <button onClick={() => updateProblem(editingIdx!, { correctAnswer: l })} className={`w-12 h-12 rounded-xl font-black transition-all ${activeProblem.correctAnswer === l ? 'bg-blue-600 text-white' : 'bg-white text-slate-300 border-2 border-slate-100'}`}>{l}</button>
                            <input className="flex-1 bg-white border-2 border-slate-100 rounded-xl px-4 py-2 font-bold" value={activeProblem.options?.[i] || ''} onChange={e => updateOption(editingIdx!, i, e.target.value)} />
                        </div>
                      ))}
                    </div>
                  )}

                  {activeProblem.type === QuestionType.TRUE_FALSE && (
                    <div className="space-y-3">
                       {['a','b','c','d'].map((l, i) => {
                         const currentVal = (activeProblem.correctAnswer || 'SSSS').split('')[i];
                         return (
                           <div key={l} className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-100">
                              <span className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-full font-black text-xs">{l})</span>
                              <input className="flex-1 bg-transparent border-none outline-none font-bold" placeholder="Nhập mệnh đề..." value={activeProblem.options?.[i] || ''} onChange={e => updateOption(editingIdx!, i, e.target.value)} />
                              <div className="flex gap-1 bg-slate-50 p-1 rounded-xl">
                                 <button onClick={() => toggleDSAnswer(editingIdx!, i)} className={`px-4 py-1 rounded-lg font-black text-[9px] ${currentVal === 'Đ' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}>ĐÚNG</button>
                                 <button onClick={() => toggleDSAnswer(editingIdx!, i)} className={`px-4 py-1 rounded-lg font-black text-[9px] ${currentVal === 'S' ? 'bg-red-500 text-white' : 'text-slate-400'}`}>SAI</button>
                              </div>
                           </div>
                         );
                       })}
                    </div>
                  )}

                  {activeProblem.type === QuestionType.SHORT_ANSWER && (
                    <div className="bg-white p-4 rounded-2xl border-2 border-slate-100">
                       <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">Đáp án chấp nhận</label>
                       <input 
                         type="text" 
                         className="w-full bg-slate-50 border border-slate-200 rounded-xl px-6 py-4 font-black text-2xl text-blue-600 text-center outline-none focus:border-blue-300"
                         placeholder="Nhập đáp án chính xác..."
                         value={activeProblem.correctAnswer}
                         onChange={e => updateProblem(editingIdx!, { correctAnswer: e.target.value })}
                       />
                    </div>
                  )}

                  {activeProblem.type === QuestionType.EXTERNAL_GAME && (
                    <div className="space-y-4">
                       <div className="bg-white p-4 rounded-2xl border-2 border-slate-100">
                          <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">Đường dẫn Game (URL)</label>
                          <input 
                            type="text" 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-300"
                            placeholder="Ví dụ: /chotroi1.html"
                            value={activeProblem.externalGameUrl || ''}
                            onChange={e => updateProblem(editingIdx!, { externalGameUrl: e.target.value })}
                          />
                       </div>
                       <div className="bg-white p-4 rounded-2xl border-2 border-slate-100">
                          <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">Mật khẩu vượt vòng (Passcode)</label>
                          <input 
                            type="text" 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-6 py-4 font-black text-2xl text-emerald-600 text-center outline-none focus:border-blue-300"
                            placeholder="Nhập mã code thành công..."
                            value={activeProblem.correctAnswer}
                            onChange={e => updateProblem(editingIdx!, { correctAnswer: e.target.value })}
                          />
                       </div>
                    </div>
                  )}
               </div>
               
               <div className="bg-emerald-50/30 p-6 rounded-[2rem] border-2 border-emerald-100 space-y-4">
                  <h4 className="text-lg font-black text-emerald-700 italic">📖 LỜI GIẢI CHI TIẾT</h4>
                  <textarea className="w-full p-4 bg-white border-2 border-emerald-100 rounded-2xl font-medium min-h-[100px]" value={activeProblem.explanation} onChange={e => updateProblem(editingIdx!, { explanation: e.target.value })} />
                  <div className="p-4 bg-white/50 rounded-2xl border border-emerald-100 text-slate-600">
                     <label className="text-[9px] font-black text-emerald-400 uppercase italic block mb-2">Xem trước lời giải:</label>
                     <LatexRenderer content={activeProblem.explanation || "Chưa có lời giải chi tiết."} />
                  </div>
               </div>

               <div className="grid grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase italic">Thử thách</label>
                    <select className="p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-black text-[10px]" value={activeProblem.challenge} onChange={e => updateProblem(editingIdx!, { challenge: e.target.value as any })}>{Object.values(DisplayChallenge).map(c => <option key={c} value={c}>{c}</option>)}</select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase italic">Game Arena</label>
                    <select className="p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-black text-[10px]" value={activeProblem.mechanic} onChange={e => updateProblem(editingIdx!, { mechanic: e.target.value as any })}>{Object.values(InteractiveMechanic).map(m => <option key={m} value={m}>{m}</option>)}</select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase italic">Thời gian (s)</label>
                    <input type="number" className="p-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-[10px]" value={activeProblem.timeLimit} onChange={e => updateProblem(editingIdx!, { timeLimit: parseInt(e.target.value) })} />
                  </div>
               </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center opacity-20 flex-col"><div className="text-9xl mb-6">✏️</div><p className="text-2xl font-black italic uppercase">CHỌN CÂU HỎI ĐỂ SOẠN THẢO</p></div>
          )}
        </div>
      </div>

      {showJSONModal && (
        <div className="fixed inset-0 z-[11000] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={() => !isImportingJSON && setShowJSONModal(false)}></div>
          <div className="bg-white rounded-[3rem] w-full max-w-3xl flex flex-col relative z-10 border-4 border-slate-100 shadow-2xl overflow-hidden animate-in zoom-in max-h-[90vh]">
            <header className="p-6 md:p-8 border-b-2 border-slate-100 flex justify-between items-center bg-gradient-to-r from-amber-500/10 via-amber-50 to-orange-50">
              <div>
                <h3 className="text-2xl md:text-3xl font-black text-slate-800 uppercase italic flex items-center gap-3">
                  <span className="text-3xl">📥</span>
                  <span>NHẬP ĐỀ TỪ FILE JSON</span>
                </h3>
                <p className="text-[11px] font-black text-amber-600 uppercase mt-1">
                  Tự động phân bổ vào 3 vòng thi chuẩn GDPT 2018
                </p>
              </div>
              <button 
                onClick={() => setShowJSONModal(false)} 
                className="w-12 h-12 bg-white text-slate-400 hover:text-slate-700 rounded-2xl flex items-center justify-center font-black shadow-md border border-slate-100 transition-all"
              >
                ✕
              </button>
            </header>

            <div className="p-6 md:p-8 overflow-y-auto space-y-6 flex-1 text-slate-700">
              {/* Structure guide badges */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-2xl border-2 border-slate-100">
                <div className="bg-white p-3 rounded-xl border border-blue-100 shadow-sm">
                  <div className="text-[10px] font-black text-blue-600 uppercase tracking-wider mb-1">Vòng 1 (TN 4 lựa chọn)</div>
                  <div className="text-xs font-bold text-slate-600">Loại câu <code className="text-blue-600 font-mono">"mcq"</code> với 4 phương án và đáp án A, B, C, D</div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-sm">
                  <div className="text-[10px] font-black text-emerald-600 uppercase tracking-wider mb-1">Vòng 2 (Đúng / Sai)</div>
                  <div className="text-xs font-bold text-slate-600">Loại câu <code className="text-emerald-600 font-mono">"group-tf"</code> với 4 ý phụ (True/False)</div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-purple-100 shadow-sm">
                  <div className="text-[10px] font-black text-purple-600 uppercase tracking-wider mb-1">Vòng 3 (Trả lời ngắn)</div>
                  <div className="text-xs font-bold text-slate-600">Loại câu <code className="text-purple-600 font-mono">"short"</code> / nhập số kết quả chính xác</div>
                </div>
              </div>

              {/* Upload file section */}
              <div 
                onClick={() => jsonFileInputRef.current?.click()}
                className="border-3 border-dashed border-amber-300 hover:border-amber-500 bg-amber-50/50 hover:bg-amber-50 rounded-2xl p-6 text-center cursor-pointer transition-all group shadow-inner"
              >
                <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">📁</div>
                <h4 className="font-black text-sm uppercase text-slate-800 mb-1">Chọn hoặc Kéo thả tệp JSON từ máy tính</h4>
                <p className="text-xs font-medium text-slate-500">Chấp nhận tệp định dạng .json (như đề thi xuất từ hệ thống ngân hàng đề)</p>
                <button 
                  type="button" 
                  onClick={(e) => { e.stopPropagation(); jsonFileInputRef.current?.click(); }}
                  className="mt-3 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-black text-xs uppercase shadow-md active:translate-y-0.5 transition-all"
                >
                  Duyệt tệp .JSON...
                </button>
              </div>

              {/* Paste JSON raw text */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
                    Hoặc Dán trực tiếp nội dung JSON vào đây:
                  </label>
                  {rawJSONText && (
                    <button 
                      onClick={() => setRawJSONText('')} 
                      className="text-[10px] font-black text-red-500 uppercase hover:underline"
                    >
                      Xóa nội dung
                    </button>
                  )}
                </div>
                <textarea 
                  value={rawJSONText}
                  onChange={(e) => setRawJSONText(e.target.value)}
                  placeholder='Dán nội dung JSON vào đây, ví dụ: { "title": "Đề ôn tập", "grade": "10", "questions": [ ... ] }'
                  className="w-full h-44 p-4 bg-slate-900 text-emerald-400 font-mono text-xs rounded-2xl border-2 border-slate-800 outline-none focus:border-amber-400 resize-none shadow-inner"
                />
              </div>
            </div>

            <footer className="p-6 md:p-8 bg-slate-50 border-t-2 border-slate-100 flex items-center justify-between gap-4">
              <button 
                onClick={() => setShowJSONModal(false)}
                className="px-6 py-4 bg-slate-200 text-slate-600 font-black rounded-2xl text-xs uppercase hover:bg-slate-300 transition-all"
              >
                Đóng
              </button>
              <button 
                disabled={isImportingJSON || !rawJSONText.trim()}
                onClick={handleJSONTextSubmit}
                className="flex-1 py-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-black rounded-2xl text-xs uppercase italic shadow-lg shadow-amber-200 border-b-4 border-amber-700 active:border-b-0 active:translate-y-1 transition-all"
              >
                {isImportingJSON ? 'Đang phân tích dữ liệu JSON...' : 'Xử lý & Nạp vào 3 Vòng thi 🚀'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {showLibModal && (
        <div className="fixed inset-0 z-[11000] flex items-center justify-center p-6">
           <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={() => setShowLibModal(false)}></div>
           <div className="bg-white rounded-[3rem] w-full max-w-5xl h-[85vh] flex flex-col relative z-10 border-4 border-slate-100 shadow-2xl overflow-hidden animate-in zoom-in">
              <header className="p-8 border-b-2 border-slate-50 flex justify-between items-center bg-slate-50">
                 <div><h3 className="text-3xl font-black text-slate-800 uppercase italic">THƯ VIỆN CÂU HỎI</h3><p className="text-[10px] font-black text-blue-500 uppercase mt-2">Dữ liệu từ Khối {currentGrade}</p></div>
                 <button onClick={() => setShowLibModal(false)} className="w-12 h-12 bg-white text-slate-400 rounded-xl flex items-center justify-center font-black">✕</button>
              </header>
              <div className="flex-1 overflow-y-auto p-8 space-y-4">
                 {libLoading ? (
                   <div className="h-full flex flex-col items-center justify-center">
                     <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                   </div>
                 ) : libQuestions.length > 0 ? (
                   <>
                     {libQuestions.slice(0, libVisibleCount).map((q, i) => (
                       <div key={i} className="bg-slate-50 p-6 rounded-3xl border-2 border-slate-100 flex items-center gap-6 hover:border-blue-200 transition-all group">
                          <div className="flex-1">
                             <div className="flex items-center gap-2 mb-2">
                               <span className="px-2 py-0.5 bg-blue-100 text-blue-600 text-[9px] font-black uppercase rounded">{q.type}</span>
                               <span className="text-[10px] font-black text-slate-400 uppercase italic">{q.topic}</span>
                             </div>
                             <h5 className="font-bold text-slate-700">{q.title}</h5>
                             <p className="font-medium text-slate-500 line-clamp-1">{q.content}</p>
                          </div>
                          <button onClick={() => {
                            const newProb = { ...q, id: Math.random().toString(36).slice(2, 9) };
                            const updated = [...rounds];
                            updated[activeRoundIdx].problems.push(newProb);
                            setRounds(updated);
                            setShowLibModal(false);
                          }} className="px-6 py-3 bg-blue-600 text-white font-black rounded-xl uppercase italic text-[10px] opacity-0 group-hover:opacity-100 transition-all shadow-lg">+ Thêm</button>
                       </div>
                     ))}
                     
                     {libVisibleCount < libQuestions.length && (
                       <div className="pt-4 flex justify-center pb-8">
                         <button 
                           onClick={() => setLibVisibleCount(prev => prev + 20)}
                           className="px-10 py-4 bg-slate-100 text-slate-600 font-black uppercase italic text-xs rounded-2xl hover:bg-blue-600 hover:text-white transition-all border-2 border-slate-200"
                         >
                           Xem thêm câu hỏi ({libQuestions.length - libVisibleCount} câu còn lại)
                         </button>
                       </div>
                     )}
                   </>
                 ) : (
                   <div className="h-full flex flex-col items-center justify-center text-slate-300 italic">
                     Chưa có dữ liệu.
                   </div>
                 )}
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default EditorPanel;
