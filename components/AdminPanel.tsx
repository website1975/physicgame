
import React, { useState, useEffect, useRef } from 'react';
import { PhysicsProblem, Round, Difficulty, QuestionType, DisplayChallenge, GameState, GameSettings, InteractiveMechanic, Player, AdminTab } from '../types';
import { supabase } from '../services/supabaseService';
import LatexRenderer from './LatexRenderer';
import ProblemCard from './ProblemCard';

interface AdminPanelProps {
  rounds: Round[];
  setRounds: (rounds: Round[]) => void;
  teacherId: string;
  onSaveSet: (title: string, asNew: boolean, topic: string, grade: string) => Promise<void>; 
  adminTab: AdminTab;
  setAdminTab: (tab: AdminTab) => void;
  loadedSetTitle: string | null;
  loadedSetId: string | null;
  onResetToNew: () => void;
  onLoadSet: (setId: string, title: string) => Promise<boolean>;
}

const AdminPanel: React.FC<AdminPanelProps> = (props) => {
  const { 
    rounds = [], setRounds, onSaveSet, loadedSetTitle, loadedSetId, 
    teacherId, adminTab, setAdminTab
  } = props;

  // State quản lý biên soạn
  const [activeRoundIdx, setActiveRoundIdx] = useState(0);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [currentTitle, setCurrentTitle] = useState(loadedSetTitle || '');
  const [currentGrade, setCurrentGrade] = useState('10');

  // State quản lý Live Room (Remote)
  const [teacherMaGV, setTeacherMaGV] = useState('');
  const [isLiveStarted, setIsLiveStarted] = useState(false);
  const [liveProblemIdx, setLiveProblemIdx] = useState(0);
  const [liveRoundIdx, setLiveRoundIdx] = useState(0);
  const [liveNote, setLiveNote] = useState('');
  const [connectedCount, setConnectedCount] = useState(0);
  const controlChannelRef = useRef<any>(null);

  // Lấy mã GV
  useEffect(() => {
    const fetchGV = async () => {
      const { data } = await supabase.from('giaovien').select('magv').eq('id', teacherId).single();
      if (data) setTeacherMaGV(data.magv);
    };
    fetchGV();
  }, [teacherId]);

  // Kết nối kênh Broadcast khi vào tab CONTROL
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

  // GV Bắt đầu tiết dạy - Lệnh này mở cửa cho HS
  const handleStartLive = () => {
    if (!loadedSetId) {
      alert("Vui lòng vào 'Kho đề' và chọn một bộ đề trước khi bắt đầu!");
      return;
    }
    
    setIsLiveStarted(true);
    controlChannelRef.current?.send({
      type: 'broadcast',
      event: 'teacher_start_game',
      payload: { 
        setId: loadedSetId, 
        title: loadedSetTitle,
        currentQuestionIndex: liveProblemIdx,
        currentRoundIndex: liveRoundIdx 
      }
    });
  };

  // GV chuyển câu hỏi
  const navigateQuestion = (direction: 'next' | 'prev') => {
    const currentRound = rounds[liveRoundIdx];
    let nIdx = liveProblemIdx;
    let nRid = liveRoundIdx;

    if (direction === 'next') {
      if (nIdx + 1 < (currentRound?.problems?.length || 0)) {
        nIdx++;
      } else if (nRid + 1 < rounds.length) {
        nRid++; nIdx = 0;
      } else return;
    } else {
      if (nIdx > 0) {
        nIdx--;
      } else if (nRid > 0) {
        nRid--; nIdx = (rounds[nRid]?.problems?.length || 1) - 1;
      } else return;
    }

    setLiveProblemIdx(nIdx);
    setLiveRoundIdx(nRid);
    
    // Đồng bộ vị trí câu hỏi cho HS
    controlChannelRef.current?.send({
      type: 'broadcast',
      event: 'teacher_action',
      payload: { type: 'SYNC_POSITION', roundIdx: nRid, probIdx: nIdx, setId: loadedSetId }
    });
  };

  // GV gõ ghi chú (Live Text)
  const handleNoteChange = (text: string) => {
    setLiveNote(text);
    controlChannelRef.current?.send({
      type: 'broadcast',
      event: 'teacher_action',
      payload: { type: 'SYNC_NOTE', text }
    });
  };

  if (adminTab === 'CONTROL') {
    const currentProb = rounds[liveRoundIdx]?.problems?.[liveProblemIdx];
    
    return (
      <div className="h-full flex flex-col gap-4 animate-in fade-in">
        {/* Header Remote */}
        <div className="bg-white p-6 rounded-[2.5rem] shadow-xl flex items-center justify-between border-b-8 border-slate-100">
           <div className="flex items-center gap-6">
              <div className="bg-slate-900 text-white p-5 rounded-[1.5rem] text-center min-w-[140px] relative">
                 {isLiveStarted && <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full border-4 border-white animate-pulse shadow-lg"></div>}
                 <div className="text-[9px] font-black opacity-40 uppercase mb-1">PHÒNG LIVE</div>
                 <div className="text-2xl font-black tracking-tighter">@{teacherMaGV || '...'}@</div>
              </div>
              <div>
                 <h3 className="text-xl font-black uppercase italic text-slate-800">
                   {isLiveStarted ? 'Đang phát trực tiếp' : 'Sẵn sàng lên sóng'}
                 </h3>
                 <p className="text-xs font-bold text-slate-400 uppercase italic">Học sinh đang đợi: {connectedCount}</p>
              </div>
           </div>
           
           {!isLiveStarted ? (
             <button 
               onClick={handleStartLive}
               className="px-12 py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase italic shadow-xl border-b-8 border-emerald-800 hover:scale-105 active:scale-95 transition-all flex items-center gap-3 animate-bounce"
             >
               🚀 BẮT ĐẦU TIẾT DẠY
             </button>
           ) : (
             <div className="flex gap-3 animate-in zoom-in">
                <button onClick={() => navigateQuestion('prev')} className="px-8 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase italic shadow-md border-b-4 border-slate-300 active:translate-y-1 active:border-b-0 transition-all">◀ Lùi</button>
                <button onClick={() => navigateQuestion('next')} className="px-10 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase italic shadow-xl border-b-4 border-blue-800 active:translate-y-1 active:border-b-0 transition-all">Tiếp ▶</button>
             </div>
           )}
        </div>

        {/* Workspace: Giống giao diện học sinh */}
        <div className={`flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0 transition-all ${!isLiveStarted ? 'opacity-30 pointer-events-none' : ''}`}>
           <div className="lg:col-span-7 flex flex-col h-full gap-4">
              <div className="flex-1 min-h-0">
                {currentProb ? (
                  <ProblemCard problem={currentProb} />
                ) : (
                  <div className="h-full bg-white rounded-[2.5rem] flex items-center justify-center border-4 border-dashed border-slate-200">
                    <p className="font-black uppercase italic text-slate-300">Chưa có dữ liệu câu hỏi</p>
                  </div>
                )}
              </div>
              <div className="bg-emerald-50 p-6 rounded-[2rem] border-2 border-emerald-100">
                 <div className="text-[10px] font-black text-emerald-600 uppercase mb-2">Đáp án đúng & Giải thích (Chỉ GV thấy)</div>
                 <div className="text-sm font-bold text-slate-700 italic">
                   <LatexRenderer content={`**Đáp án:** ${currentProb?.correctAnswer || 'Chưa thiết lập'} \n\n ${currentProb?.explanation || 'Không có giải thích.'}`} />
                 </div>
              </div>
           </div>

           <div className="lg:col-span-5 flex flex-col h-full bg-slate-900 rounded-[3rem] p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                 <span className="text-8xl font-black italic text-white">LIVE</span>
              </div>
              <div className="relative z-10 flex flex-col h-full">
                 <h4 className="text-white font-black uppercase italic tracking-widest text-xs mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
                    Ghi chú giảng bài cho Học sinh
                 </h4>
                 <textarea 
                    className="flex-1 bg-white/5 border-2 border-white/10 rounded-[2rem] p-6 text-white font-medium text-lg outline-none focus:border-blue-500/50 transition-all resize-none mb-4"
                    placeholder="Gõ hướng dẫn hoặc phân tích đề tại đây... HS sẽ thấy ngay tức thì."
                    value={liveNote}
                    onChange={(e) => handleNoteChange(e.target.value)}
                 />
                 <div className="h-40 bg-white/5 rounded-2xl p-4 overflow-y-auto border border-white/5">
                    <div className="text-[9px] font-black text-slate-500 uppercase mb-2">Xem trước LaTeX:</div>
                    <div className="text-white/80 text-sm italic">
                       <LatexRenderer content={liveNote || "_Chưa có ghi chú_"} />
                    </div>
                 </div>
              </div>
           </div>
        </div>
        
        {!isLiveStarted && (
          <div className="absolute inset-x-0 bottom-20 flex justify-center z-50">
             <div className="bg-white p-8 rounded-[3rem] shadow-2xl border-4 border-blue-100 flex items-center gap-6 animate-in slide-in-from-bottom-20">
                <span className="text-4xl">☝️</span>
                <p className="text-xl font-black uppercase italic text-slate-700">Hãy nhấn nút "Bắt đầu tiết dạy" ở trên để kết nối với Học sinh!</p>
             </div>
          </div>
        )}
      </div>
    );
  }

  // --- PHẦN BIÊN SOẠN ---
  return (
    <div className="bg-[#f8fafc] min-h-full flex flex-col gap-4 relative text-left">
      <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border-4 border-slate-100 flex flex-col gap-6">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 flex-1">
            <div className="text-4xl bg-emerald-50 w-16 h-16 rounded-2xl flex items-center justify-center">📗</div>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-10">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Tên bộ đề</label>
                <input type="text" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-3 font-black outline-none focus:border-blue-300" value={currentTitle} onChange={e => setCurrentTitle(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Khối</label>
                <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-black outline-none focus:border-blue-300" value={currentGrade} onChange={e => setCurrentGrade(e.target.value)}>
                  {['10', '11', '12'].map(g => <option key={g} value={g}>K{g}</option>)}
                </select>
              </div>
            </div>
          </div>
          <button onClick={() => onSaveSet(currentTitle, !loadedSetId, 'Vật lý', currentGrade)} className="px-10 py-5 bg-blue-600 text-white rounded-2xl font-black uppercase italic shadow-lg hover:scale-105 active:scale-95 transition-all">Lưu đề</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        <div className="lg:col-span-3 flex flex-col gap-4 overflow-hidden">
          <div className="bg-white p-4 rounded-3xl border-4 border-slate-50 shadow-sm flex items-center gap-3 overflow-x-auto no-scrollbar">
             {rounds?.map((r, i) => (
                <button key={i} onClick={() => { setActiveRoundIdx(i); setEditingIdx(null); }} className={`px-6 py-3 rounded-2xl text-[11px] font-black uppercase border-2 shrink-0 ${activeRoundIdx === i ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>Vòng {r.number}</button>
             ))}
             <button onClick={() => setRounds([...(rounds || []), { number: (rounds?.length || 0) + 1, problems: [] }])} className="px-6 py-3 rounded-2xl text-[11px] font-black text-blue-600 border-2 border-dashed border-blue-200 uppercase">+</button>
          </div>
          <div className="bg-white rounded-[2rem] p-5 shadow-md border-2 border-slate-50 flex-1 overflow-y-auto no-scrollbar space-y-2">
              {rounds?.[activeRoundIdx]?.problems?.map((p, i) => (
                <button key={p.id} onClick={() => setEditingIdx(i)} className={`w-full p-4 rounded-2xl text-left border-4 transition-all ${editingIdx === i ? 'bg-blue-600 border-blue-400 text-white shadow-lg' : 'bg-slate-50 border-white text-slate-500'}`}>
                  <div className="text-[11px] font-black uppercase italic">Câu {i+1}</div>
                  <div className="text-[9px] font-bold opacity-70 truncate">{p.content || 'Nội dung mới...'}</div>
                </button>
              ))}
              <button onClick={() => {
                const newProb = { id: Math.random().toString(36).substring(7), content: '', type: QuestionType.MULTIPLE_CHOICE, difficulty: Difficulty.EASY, challenge: DisplayChallenge.NORMAL, correctAnswer: 'A', explanation: '', options: ['', '', '', ''], topic: 'Vật lý', title: 'Câu hỏi mới' };
                const updated = [...rounds];
                updated[activeRoundIdx].problems.push(newProb);
                setRounds(updated);
                setEditingIdx(updated[activeRoundIdx].problems.length - 1);
              }} className="w-full py-4 border-2 border-dashed border-slate-200 text-slate-400 rounded-2xl font-black uppercase text-[10px] hover:border-blue-300 transition-all">+ THÊM CÂU</button>
          </div>
        </div>

        <div className="lg:col-span-9 bg-white rounded-[3rem] shadow-xl p-10 overflow-y-auto no-scrollbar border-4 border-slate-50 relative">
          {editingIdx !== null && rounds?.[activeRoundIdx]?.problems?.[editingIdx] ? (
            <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in">
                <div className="flex justify-between items-center border-b-4 border-slate-50 pb-6">
                  <h3 className="text-3xl font-black italic uppercase">Chỉnh sửa Câu {editingIdx + 1}</h3>
                  <button onClick={() => {
                    const updated = [...rounds];
                    updated[activeRoundIdx].problems.splice(editingIdx, 1);
                    setRounds(updated);
                    setEditingIdx(null);
                  }} className="text-red-500 font-black uppercase text-[10px] hover:scale-105 transition-all">Xóa câu ✕</button>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase italic">Nội dung câu hỏi</label>
                   <textarea className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl font-bold text-xl min-h-[120px] outline-none focus:border-blue-200" value={rounds[activeRoundIdx].problems[editingIdx].content} onChange={e => {
                     const updated = [...rounds];
                     updated[activeRoundIdx].problems[editingIdx].content = e.target.value;
                     setRounds(updated);
                   }} />
                </div>
                <div className="bg-emerald-50/50 p-8 rounded-[3rem] border-2 border-emerald-100">
                   <h4 className="text-xl font-black text-emerald-700 uppercase italic mb-2">📖 LỜI GIẢI CHI TIẾT</h4>
                   <textarea className="w-full p-6 bg-white border-2 border-emerald-100 rounded-3xl font-medium min-h-[150px] outline-none focus:border-emerald-300" value={rounds[activeRoundIdx].problems[editingIdx].explanation} onChange={e => {
                     const updated = [...rounds];
                     updated[activeRoundIdx].problems[editingIdx].explanation = e.target.value;
                     setRounds(updated);
                   }} />
                </div>
            </div>
          ) : <div className="h-full flex flex-col items-center justify-center opacity-20 text-center"><div className="text-[10rem] mb-6 select-none grayscale">✏️</div><p className="font-black uppercase italic text-2xl text-slate-400">CHỌN CÂU HỎI ĐỂ SOẠN THẢO</p></div>}
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
