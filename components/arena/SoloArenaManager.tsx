
import React, { useState, useEffect } from 'react';
import { GameState, Teacher, MatchData } from '../../types';
import { getRoomAssignments, fetchSetData } from '../../services/supabaseService';
import KeywordSelector from '../KeywordSelector';

interface SoloArenaManagerProps {
  gameState: GameState;
  setGameState: (s: GameState) => void;
  playerName: string;
  studentGrade: string;
  currentTeacher: Teacher;
  onStartMatch: (data: MatchData) => void;
  joinedRoom: any;
  setJoinedRoom: (room: any) => void;
  availableSets: any[];
  setAvailableSets: (sets: any[]) => void;
  uniqueId: string;
}

const SoloArenaManager: React.FC<SoloArenaManagerProps> = ({
  gameState, setGameState, studentGrade, currentTeacher, onStartMatch, 
  joinedRoom, setJoinedRoom, availableSets, setAvailableSets, uniqueId
}) => {
  const [selectedSet, setSelectedSet] = useState<any>(null);
  const [selectedQuantities, setSelectedQuantities] = useState<string[]>([]);
  const [selectedFormulas, setSelectedFormulas] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadSets = async () => {
      setLoading(true);
      try {
        const assignments = await getRoomAssignments(currentTeacher.id, 'ARENA_A');
        const fullSets = [];
        for (const item of assignments) {
          const data = await fetchSetData(item.set_id);
          if (String(data.grade) === String(studentGrade)) {
            // Tính toán số câu hỏi
            const qCount = (data.rounds || []).reduce((acc: number, r: any) => acc + (r.problems?.length || 0), 0);
            fullSets.push({ ...data, id: item.set_id, question_count: qCount });
          }
        }
        setAvailableSets(fullSets);
        setGameState('SET_SELECTION');
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    loadSets();
  }, [currentTeacher.id, studentGrade]);

  if (gameState === 'SET_SELECTION') {
    return (
      <div className="min-h-screen p-6 md:p-12 flex flex-col items-center bg-slate-950 overflow-y-auto no-scrollbar text-left">
        <div className="max-w-7xl w-full flex flex-col md:flex-row justify-between items-center mb-12 gap-6">
          <div className="text-center md:text-left">
            <h2 className="text-5xl md:text-6xl font-black text-white uppercase italic tracking-tighter">PHÒNG ĐƠN</h2>
            <p className="text-blue-400 font-bold uppercase text-[10px] mt-2 tracking-[0.3em]">CHỌN BỘ ĐỀ ĐỂ BẮT ĐẦU LUYỆN TẬP</p>
          </div>
          <button onClick={() => { setJoinedRoom(null); setGameState('ROOM_SELECTION'); }} className="px-10 py-4 bg-white/5 hover:bg-red-500 text-white rounded-2xl font-black uppercase italic transition-all border border-white/10">THOÁT ✕</button>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-6"></div>
            <div className="text-white font-black uppercase italic tracking-widest animate-pulse">ĐANG TẢI KHO ĐỀ...</div>
          </div>
        ) : availableSets.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 w-full max-w-7xl">
            {availableSets.map((set) => (
              <div key={set.id} className="bg-white p-8 rounded-[3.5rem] border-4 border-slate-50 shadow-2xl flex flex-col group hover:border-blue-200 transition-all relative overflow-hidden">
                <div className="flex items-center gap-2 mb-4">
                  <span className="px-3 py-1 bg-blue-600 text-white text-[9px] font-black uppercase rounded-lg shadow-sm">{set.topic || 'CHƯA PHÂN LOẠI'}</span>
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">K{set.grade}</span>
                </div>

                <h4 className="text-2xl font-black text-slate-800 uppercase italic mb-8 leading-tight line-clamp-2 min-h-[4rem] group-hover:text-blue-600 transition-colors">
                  {set.title}
                </h4>

                <div className="grid grid-cols-2 gap-3 mb-10">
                  <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex flex-col items-center shadow-inner">
                    <div className="text-[9px] font-black text-slate-400 uppercase mb-1">Cấu trúc</div>
                    <div className="text-xl font-black text-slate-700 italic leading-none">{(set.rounds || []).length} <span className="text-[10px] uppercase">vòng</span></div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex flex-col items-center shadow-inner">
                    <div className="text-[9px] font-black text-slate-400 uppercase mb-1">Tổng số</div>
                    <div className="text-xl font-black text-slate-700 italic leading-none">{set.question_count || 0} <span className="text-[10px] uppercase">câu</span></div>
                  </div>
                </div>

                <button 
                  onClick={() => { setSelectedSet(set); setGameState('KEYWORD_SELECTION'); }} 
                  className="mt-auto w-full py-5 bg-slate-900 text-white hover:bg-blue-600 rounded-2xl font-black uppercase italic shadow-lg transition-all active:scale-95 border-b-4 border-slate-950 active:border-b-0 flex items-center justify-center gap-3 group/btn"
                >
                  BẮT ĐẦU LUYỆN <span className="group-hover/btn:translate-x-1 transition-transform">🚀</span>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-20 opacity-20 select-none">
             <div className="text-[10rem] mb-6 grayscale">📭</div>
             <p className="font-black uppercase italic tracking-[0.3em] text-2xl text-white">CHƯA CÓ ĐỀ ĐƯỢC GÁN</p>
             <p className="text-white font-bold italic text-sm mt-4">Vui lòng báo giáo viên gán đề cho phòng ARENA_A</p>
          </div>
        )}
      </div>
    );
  }

  if (gameState === 'KEYWORD_SELECTION' && selectedSet) {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center justify-center bg-slate-950">
         <div className="max-w-4xl w-full bg-white rounded-[4rem] p-12 shadow-2xl border-b-[12px] border-blue-600 animate-in zoom-in duration-300">
            <header className="mb-10 text-center">
              <h2 className="text-4xl font-black text-slate-800 uppercase italic mb-2 tracking-tighter">KHỞI ĐỘNG ARENA</h2>
              <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">{selectedSet.title}</p>
            </header>
            <div className="bg-slate-50 p-8 rounded-[3rem] mb-10 shadow-inner">
               <KeywordSelector 
                selectedQuantities={selectedQuantities} 
                selectedFormulas={selectedFormulas} 
                onToggleQuantity={s => setSelectedQuantities(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s])} 
                onToggleFormula={id => setSelectedFormulas(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])} 
               />
            </div>
            <div className="flex gap-4">
              <button 
                onClick={() => setGameState('SET_SELECTION')} 
                className="flex-1 py-6 bg-slate-100 text-slate-400 rounded-3xl font-black uppercase italic text-xl shadow-lg border-b-8 border-slate-200"
              >
                HỦY
              </button>
              <button 
                onClick={() => onStartMatch({ setId: selectedSet.id, title: selectedSet.title, rounds: selectedSet.rounds, joinedRoom, myId: uniqueId })} 
                className="flex-[2] py-6 bg-blue-600 text-white rounded-3xl font-black uppercase italic text-xl shadow-xl border-b-8 border-blue-800 active:border-b-0 active:translate-y-2 transition-all"
              >
                ⚡ SẴN SÀNG CHIẾN ĐẤU
              </button>
            </div>
         </div>
      </div>
    );
  }

  return null;
};

export default SoloArenaManager;
