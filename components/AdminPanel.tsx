
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

const AdminPanel: React.FC<AdminPanelProps> = (props) => {
  const { 
    rounds = [], setRounds, onSaveSet, loadedSetTitle, loadedSetId, loadedSetTopic,
    teacherId, adminTab, setAdminTab
  } = props;

  const [activeRoundIdx, setActiveRoundIdx] = useState(0);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [currentTitle, setCurrentTitle] = useState(loadedSetTitle || '');
  const [currentTopic, setCurrentTopic] = useState(loadedSetTopic || 'Khác');
  const [currentGrade, setCurrentGrade] = useState('10');
  const [teacherMaGV, setTeacherMaGV] = useState('');
  const [isLiveGameActive, setIsLiveGameActive] = useState(false);
  const [liveRoundIdx, setLiveRoundIdx] = useState(0);
  const [liveProblemIdx, setLiveProblemIdx] = useState(0);
  const [connectedCount, setConnectedCount] = useState(0);
  const controlChannelRef = useRef<any>(null);

  useEffect(() => {
    if (adminTab === 'CONTROL' && teacherId) {
      const channel = supabase.channel(`room_TEACHER_LIVE_${teacherId}`, {
        config: { presence: { key: 'teacher' } }
      });
      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          setConnectedCount(Object.keys(state).length - 1);
        })
        .subscribe();
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

  const handleStartLiveMatch = () => {
    if (!loadedSetId) return alert("Vui lòng chọn hoặc lưu một bộ đề trước khi phát!");
    setIsLiveGameActive(true);
    if (controlChannelRef.current) {
      // CHỈ GỬI ID - KHÔNG GỬI DATA CÂU HỎI
      controlChannelRef.current.send({
        type: 'broadcast',
        event: 'teacher_start_game',
        payload: { setId: loadedSetId, currentQuestionIndex: 0, currentRoundIndex: 0 }
      });
    }
  };

  const handleNextLiveQuestion = () => {
    const currentRound = rounds[liveRoundIdx];
    let nextProb = liveProblemIdx + 1;
    let nextRound = liveRoundIdx;
    if (nextProb >= (currentRound?.problems?.length || 0)) {
      if (liveRoundIdx + 1 < rounds.length) {
        nextRound++; nextProb = 0;
      } else return alert("Đã hết câu hỏi trong bộ đề!");
    }
    setLiveProblemIdx(nextProb);
    setLiveRoundIdx(nextRound);
    if (controlChannelRef.current) {
      controlChannelRef.current.send({ 
        type: 'broadcast', event: 'teacher_next_question', 
        payload: { nextIndex: nextProb, nextRoundIndex: nextRound } 
      });
    }
  };

  if (adminTab === 'CONTROL') {
    return (
      <div className="h-full flex flex-col gap-6 animate-in fade-in bg-slate-50 p-6 rounded-[3rem]">
        <div className="bg-white p-8 rounded-[3rem] shadow-xl flex items-center justify-between border-b-8 border-slate-200">
          <div className="flex items-center gap-6 text-left">
            <div className="bg-slate-900 text-white p-6 rounded-[2rem] text-center min-w-[180px] shadow-2xl">
              <div className="text-[10px] font-black opacity-50 uppercase mb-1">MÃ PHÒNG LIVE</div>
              <div className="text-3xl font-black italic tracking-widest">@{teacherMaGV || '...' }@</div>
            </div>
            <div>
              <h3 className="text-2xl font-black uppercase italic text-slate-800">Bảng điều khiển</h3>
              <p className="text-sm text-slate-400 font-bold uppercase italic flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                Học sinh đang online: {connectedCount}
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            {!isLiveGameActive ? (
              <button onClick={handleStartLiveMatch} className="px-12 py-6 bg-blue-600 text-white rounded-2xl font-black uppercase italic shadow-xl border-b-8 border-blue-800 hover:scale-105 transition-all">PHÁT TRẬN ĐẤU 🚀</button>
            ) : (
              <button onClick={handleNextLiveQuestion} className="px-12 py-6 bg-amber-500 text-white rounded-2xl font-black uppercase italic shadow-xl border-b-8 border-amber-700 hover:scale-105 transition-all">CÂU KẾ TIẾP ⏩</button>
            )}
          </div>
        </div>
        
        <div className="flex-1 bg-slate-900 rounded-[4rem] border-[15px] border-slate-800 flex flex-col items-center justify-center text-white p-12 shadow-inner relative overflow-hidden">
          <div className="absolute inset-0 opacity-5 pointer-events-none flex flex-wrap gap-10 p-10">
             {[...Array(20)].map((_,i) => <span key={i} className="text-6xl font-black uppercase italic -rotate-12">PhysiQuest</span>)}
          </div>
          
          {isLiveGameActive ? (
            <div className="text-center relative z-10 animate-in zoom-in duration-500">
              <div className="text-[10px] font-black text-blue-400 tracking-[0.5em] mb-4 uppercase">TRẠNG THÁI HIỆN TẠI</div>
              <div className="text-[15rem] font-black italic leading-none drop-shadow-[0_10px_30px_rgba(59,130,246,0.3)]">{liveProblemIdx + 1}</div>
              <div className="text-2xl font-black text-slate-500 uppercase italic mt-4">VÒNG SỐ {liveRoundIdx + 1}</div>
              <div className="mt-12 bg-white/5 backdrop-blur-md px-10 py-4 rounded-full border border-white/10 text-xs font-black uppercase tracking-widest text-slate-400">
                Đang trình chiếu đề: {loadedSetTitle || 'Bộ đề Live'}
              </div>
            </div>
          ) : (
            <div className="opacity-20 text-center relative z-10">
              <div className="text-9xl mb-8 animate-pulse">📡</div>
              <div className="text-3xl font-black uppercase italic tracking-[0.2em]">Sẵn sàng phát tín hiệu</div>
              <p className="text-sm font-bold mt-4 uppercase italic">Nhấn nút "Phát trận đấu" để bắt đầu</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // PHẦN SOẠN THẢO VẪN GIỮ NGUYÊN NHƯNG ĐÃ SỬA LỖI TRUY CẬP PROPS
  return (
    <div className="bg-[#f8fafc] min-h-full flex flex-col gap-4 relative text-left">
      <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border-4 border-slate-100 flex flex-col gap-6">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 flex-1">
            <div className="text-4xl bg-emerald-50 w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner">📗</div>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-10">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Tên bộ đề</label>
                <input type="text" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-3 font-black text-slate-700 outline-none focus:border-blue-200" value={currentTitle} onChange={e => setCurrentTitle(e.target.value)} placeholder="Nhập tên bộ đề..." />
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Khối</label>
                <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-black text-slate-700 outline-none" value={currentGrade} onChange={e => setCurrentGrade(e.target.value)}>
                  {['10', '11', '12'].map(g => <option key={g} value={g}>K{g}</option>)}
                </select>
              </div>
            </div>
          </div>
          <button onClick={() => onSaveSet(currentTitle, !loadedSetId, currentTopic, currentGrade)} className="px-10 py-5 bg-blue-600 text-white rounded-2xl font-black uppercase italic shadow-lg hover:scale-105 active:scale-95 transition-all">Lưu bộ đề</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        <div className="lg:col-span-3 flex flex-col gap-4 overflow-hidden">
          <div className="bg-white p-4 rounded-3xl border-4 border-slate-50 shadow-sm flex items-center gap-3 overflow-x-auto no-scrollbar shrink-0">
             {rounds?.map((r, i) => (
                <button key={i} onClick={() => { setActiveRoundIdx(i); setEditingIdx(null); }} className={`px-6 py-3 rounded-2xl text-[11px] font-black uppercase border-2 transition-all shrink-0 ${activeRoundIdx === i ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>Vòng {r.number}</button>
             ))}
             <button onClick={() => setRounds([...(rounds || []), { number: (rounds?.length || 0) + 1, problems: [] }])} className="px-6 py-3 rounded-2xl text-[11px] font-black text-blue-600 border-2 border-dashed border-blue-200 uppercase hover:bg-blue-50 transition-all">+</button>
          </div>
          
          <div className="bg-white rounded-[2rem] p-5 shadow-md border-2 border-slate-50 flex-1 overflow-y-auto no-scrollbar space-y-2">
              {rounds?.[activeRoundIdx]?.problems?.map((p, i) => (
                <button key={p.id} onClick={() => setEditingIdx(i)} className={`w-full p-4 rounded-2xl text-left border-4 transition-all ${editingIdx === i ? 'bg-blue-600 border-blue-400 text-white shadow-lg' : 'bg-slate-50 border-white text-slate-500 hover:bg-slate-100'}`}>
                  <div className="text-[11px] font-black uppercase italic">Câu {i+1}</div>
                  <div className="text-[9px] font-bold opacity-70 truncate uppercase">{p.content || 'Nội dung mới...'}</div>
                </button>
              ))}
              <button onClick={() => {
                const newProb: PhysicsProblem = { 
                  id: Math.random().toString(36).substring(7), 
                  title: 'Câu hỏi mới',
                  content: '', 
                  type: QuestionType.MULTIPLE_CHOICE, 
                  difficulty: Difficulty.EASY, 
                  challenge: DisplayChallenge.NORMAL, 
                  correctAnswer: 'A', 
                  explanation: '', 
                  options: ['', '', '', ''],
                  topic: currentTopic
                };
                const updated = [...rounds];
                updated[activeRoundIdx].problems.push(newProb);
                setRounds(updated);
                setEditingIdx(updated[activeRoundIdx].problems.length - 1);
              }} className="w-full py-4 border-2 border-dashed border-slate-200 text-slate-400 rounded-2xl font-black uppercase text-[10px] hover:border-blue-400 hover:text-blue-600 transition-all">+ THÊM CÂU</button>
          </div>
        </div>

        <div className="lg:col-span-9 bg-white rounded-[3rem] shadow-xl p-10 overflow-y-auto no-scrollbar border-4 border-slate-50 relative">
          {editingIdx !== null && rounds?.[activeRoundIdx]?.problems?.[editingIdx] ? (
            <div className="max-w-4xl mx-auto space-y-10 animate-in fade-in">
                <div className="flex justify-between items-center border-b-4 border-slate-50 pb-6">
                  <h3 className="text-3xl font-black italic uppercase text-slate-800">CÂU SỐ {editingIdx + 1}</h3>
                  <button onClick={() => {
                    const updated = [...rounds];
                    updated[activeRoundIdx].problems.splice(editingIdx, 1);
                    setRounds(updated);
                    setEditingIdx(null);
                  }} className="text-red-500 font-black uppercase text-[10px] hover:scale-105 transition-all">XÓA CÂU NÀY ✕</button>
                </div>
                <div className="space-y-4">
                   <label className="text-[10px] font-black text-slate-400 uppercase italic tracking-widest">Nội dung câu hỏi (Dùng $ $ cho công thức)</label>
                   <textarea className="w-full p-8 bg-slate-50 border-2 border-slate-100 rounded-3xl font-bold text-2xl min-h-[150px] outline-none focus:border-blue-200 transition-all text-slate-700" value={rounds[activeRoundIdx].problems[editingIdx].content} onChange={e => {
                     const updated = [...rounds];
                     updated[activeRoundIdx].problems[editingIdx].content = e.target.value;
                     setRounds(updated);
                   }} placeholder="Ví dụ: Một vật có khối lượng $m = 2kg$..." />
                </div>
                <div className="bg-emerald-50/50 p-10 rounded-[3rem] border-2 border-emerald-100 shadow-inner">
                   <h4 className="text-xl font-black text-emerald-700 uppercase italic mb-4 flex items-center gap-3"><span>📖</span> LỜI GIẢI CHI TIẾT</h4>
                   <textarea className="w-full p-8 bg-white border-2 border-emerald-100 rounded-3xl font-medium text-lg italic text-slate-600 min-h-[200px] outline-none focus:border-emerald-300 transition-all" value={rounds[activeRoundIdx].problems[editingIdx].explanation} onChange={e => {
                     const updated = [...rounds];
                     updated[activeRoundIdx].problems[editingIdx].explanation = e.target.value;
                     setRounds(updated);
                   }} placeholder="Giải thích cách làm..." />
                </div>
            </div>
          ) : <div className="h-full flex flex-col items-center justify-center opacity-10 text-center"><div className="text-[10rem] mb-6 select-none grayscale">✏️</div><p className="font-black uppercase italic text-3xl text-slate-400 tracking-[0.2em]">CHỌN CÂU HỎI ĐỂ CHỈNH SỬA</p></div>}
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
