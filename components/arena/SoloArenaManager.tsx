
import React, { useState, useEffect } from 'react';
import { GameState, Teacher, MatchData, Round } from '../../types';
import { getRoomAssignmentsWithMeta, fetchSetData } from '../../services/supabaseService';
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
  const [isStartingMatch, setIsStartingMatch] = useState(false);

  useEffect(() => {
    const loadSetsMetadata = async () => {
      setLoading(true);
      try {
        // TRUY VẤN NGHIÊM NGẶT: Chỉ lấy bộ đề gán cho GV này + thuộc sở hữu của GV này
        const metaSets = await getRoomAssignmentsWithMeta(currentTeacher.id, 'ARENA_A');
        
        // Lọc thêm theo khối lớp học sinh đã chọn
        const filteredSets = metaSets.filter(s => String(s.grade) === String(studentGrade));
        
        setAvailableSets(filteredSets);
        setGameState('SET_SELECTION');
      } catch (e) { 
        console.error("Lỗi tải danh sách đề:", e); 
      }
      finally { setLoading(false); }
    };
    loadSetsMetadata();
  }, [currentTeacher.id, studentGrade]);

  const startPredefinedMatch = async () => {
    if (!selectedSet || isStartingMatch) return;
    
    setIsStartingMatch(true);
    try {
      const fullData = await fetchSetData(selectedSet.id);
      
      onStartMatch({ 
        setId: selectedSet.id, 
        title: fullData.title, 
        rounds: fullData.rounds, 
        joinedRoom, 
        myId: uniqueId 
      });
    } catch (e) {
      alert("Không thể tải dữ liệu đề thi. Vui lòng thử lại!");
    } finally {
      setIsStartingMatch(false);
    }
  };

  if (gameState === 'SET_SELECTION') {
    return (
      <div className="min-h-screen p-6 md:p-12 flex flex-col items-center bg-slate-950 overflow-y-auto no-scrollbar text-left">
        <div className="max-w-7xl w-full flex flex-col md:flex-row justify-between items-center mb-12 gap-6">
          <div className="text-center md:text-left">
            <h2 className="text-5xl md:text-6xl font-black text-white uppercase italic tracking-tighter">PHÒNG ĐƠN</h2>
            <div className="flex items-center gap-3 mt-3">
               <span className="px-3 py-1 bg-blue-600 text-white text-[9px] font-black uppercase rounded-lg shadow-lg">GIÁO VIÊN: {currentTeacher.tengv}</span>
               <span className="px-3 py-1 bg-white/10 text-blue-400 text-[9px] font-black uppercase rounded-lg border border-white/5 tracking-widest italic">MÔN: {currentTeacher.monday || 'Vật lý'}</span>
            </div>
          </div>
          <button onClick={() => { setJoinedRoom(null); setGameState('ROOM_SELECTION'); }} className="px-10 py-4 bg-white/5 hover:bg-red-500 text-white rounded-2xl font-black uppercase italic transition-all border border-white/10 shadow-2xl">THOÁT ARENA ✕</button>
        </div>

        <div className="w-full max-w-7xl mb-12 bg-white/5 border-4 border-dashed border-white/10 rounded-[3.5rem] p-10 animate-in fade-in slide-in-from-top-4 duration-700">
           <h3 className="text-2xl font-black text-blue-400 uppercase italic mb-8 flex items-center gap-4">
              <span className="text-4xl">📖</span> HƯỚNG DẪN LUYỆN TẬP
           </h3>
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <div className="bg-white/5 p-6 rounded-[2rem] border border-white/5">
                 <div className="text-3xl mb-4">🎯</div>
                 <div className="font-black text-white text-xs uppercase mb-2">Bước 1: Chọn Đề</div>
                 <p className="text-slate-400 text-[10px] leading-relaxed font-bold italic">Lựa chọn bộ đề Khối {studentGrade} do thầy {currentTeacher.tengv} biên soạn.</p>
              </div>
              <div className="bg-white/5 p-6 rounded-[2rem] border border-white/5">
                 <div className="text-3xl mb-4">🕹️</div>
                 <div className="font-black text-white text-xs uppercase mb-2">Bước 2: Điều khiển</div>
                 <p className="text-slate-400 text-[10px] leading-relaxed font-bold italic">Sử dụng Tàu vũ trụ, Nấm hoặc Thợ lặn để di chuyển trong không gian bài tập.</p>
              </div>
              <div className="bg-white/5 p-6 rounded-[2rem] border border-white/5">
                 <div className="text-3xl mb-4">💥</div>
                 <div className="font-black text-white text-xs uppercase mb-2">Bước 3: Nhập liệu</div>
                 <p className="text-slate-400 text-[10px] leading-relaxed font-bold italic">Bắn đáp án hoặc chạm trực tiếp vào các ô số bay lơ lửng để nhập giá trị.</p>
              </div>
              <div className="bg-white/5 p-6 rounded-[2rem] border border-white/5">
                 <div className="text-3xl mb-4">🛡️</div>
                 <div className="font-black text-white text-xs uppercase mb-2">Bước 4: Vượt rào</div>
                 <p className="text-slate-400 text-[10px] leading-relaxed font-bold italic">Ghi nhớ đề bài trong 15 giây trước khi rào cản (sương mù, kiến bò...) kích hoạt.</p>
              </div>
           </div>
        </div>

        <div className="w-full max-w-7xl mb-12 flex items-center gap-4">
           <div className="h-px bg-white/10 flex-1"></div>
           <span className="text-slate-500 font-black uppercase italic text-xs tracking-[0.3em]">DANH SÁCH BỘ ĐỀ KHỐI {studentGrade} - {currentTeacher.monday}</span>
           <div className="h-px bg-white/10 flex-1"></div>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-6"></div>
            <div className="text-white font-black uppercase italic tracking-widest animate-pulse">ĐANG KẾT NỐI KHO ĐỀ CỦA THẦY {currentTeacher.tengv.split(' ').pop().toUpperCase()}...</div>
          </div>
        ) : availableSets.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 w-full max-w-7xl">
            {availableSets.map((set) => (
              <div key={set.id} className="bg-white p-8 rounded-[3.5rem] border-4 border-slate-50 shadow-2xl flex flex-col group hover:border-blue-200 transition-all relative overflow-hidden">
                <div className="flex items-center gap-2 mb-4">
                  <span className="px-3 py-1 bg-blue-600 text-white text-[9px] font-black uppercase rounded-lg shadow-sm">{set.topic || 'BÀI TẬP'}</span>
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">K{set.grade}</span>
                </div>
                <h4 className="text-2xl font-black text-slate-800 uppercase italic mb-8 leading-tight line-clamp-2 min-h-[4rem] group-hover:text-blue-600 transition-colors">
                  {set.title}
                </h4>
                <div className="grid grid-cols-2 gap-3 mb-10">
                  <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex flex-col items-center shadow-inner">
                    <div className="text-[9px] font-black text-slate-400 uppercase mb-1">Cấu trúc</div>
                    <div className="text-xl font-black text-slate-700 italic leading-none">{set.round_count || 0} <span className="text-[10px] uppercase">vòng</span></div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex flex-col items-center shadow-inner">
                    <div className="text-[9px] font-black text-slate-400 uppercase mb-1">Tổng số</div>
                    <div className="text-xl font-black text-slate-700 italic leading-none">{set.question_count || 0} <span className="text-[10px] uppercase">câu</span></div>
                  </div>
                </div>
                <button 
                  onClick={() => { setSelectedSet(set); setGameState('KEYWORD_SELECTION'); }} 
                  className="mt-auto w-full py-5 bg-slate-900 text-white hover:bg-blue-600 rounded-2xl font-black uppercase italic shadow-lg transition-all active:scale-95 border-b-4 border-slate-950 flex items-center justify-center gap-3 group/btn"
                >
                  LUYỆN TẬP NGAY 🚀
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-20 opacity-30 select-none">
             <div className="text-9xl mb-6 grayscale">📭</div>
             <p className="font-black uppercase italic tracking-[0.3em] text-2xl text-white">CHƯA CÓ ĐỀ PHÙ HỢP</p>
             <p className="text-white font-bold italic text-sm mt-4">Vui lòng nhắn thầy {currentTeacher.tengv} gán đề Khối {studentGrade} môn {currentTeacher.monday} vào Arena nhé!</p>
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
              <h2 className="text-4xl font-black text-slate-800 uppercase italic mb-2 tracking-tighter">BẮT ĐẦU ARENA</h2>
              <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest italic">{selectedSet.title}</p>
            </header>
            <div className="bg-slate-50 p-8 rounded-[3rem] mb-10 shadow-inner overflow-y-auto max-h-[50vh] no-scrollbar">
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
                disabled={isStartingMatch}
              >
                QUAY LẠI
              </button>
              <button 
                onClick={startPredefinedMatch} 
                disabled={isStartingMatch}
                className="flex-[2] py-6 bg-blue-600 text-white rounded-3xl font-black uppercase italic text-xl shadow-xl border-b-8 border-blue-800 active:border-b-0 active:translate-y-2 transition-all disabled:opacity-50"
              >
                {isStartingMatch ? (
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                    ĐANG TẢI DỮ LIỆU...
                  </div>
                ) : 'XÁC NHẬN CHIẾN ĐẤU ⚡'}
              </button>
            </div>
         </div>
      </div>
    );
  }

  return null;
};

export default SoloArenaManager;
