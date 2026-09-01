
import React, { useState, useEffect, useMemo } from 'react';
import { GameState, Teacher, MatchData, Round } from '../../types';
import { getRoomAssignmentsWithMeta, fetchSetData } from '../../services/supabaseService';
import { getChaptersForGrade, matchExamToCurriculum, joinTopic } from '../../services/curriculumData';
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
  const [selectedWeekFilter, setSelectedWeekFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showGuide, setShowGuide] = useState<boolean>(false);

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

  // Danh sách chương & tuần thuộc khối lớp của học sinh
  const chapters = useMemo(() => {
    return getChaptersForGrade(studentGrade, currentTeacher.id);
  }, [studentGrade, currentTeacher.id]);

  // Bộ lọc đề theo tuần/chương và từ khóa tìm kiếm
  const filteredSets = useMemo(() => {
    return availableSets.filter(set => {
      // Lọc theo tuần / chương
      if (selectedWeekFilter && selectedWeekFilter !== 'ALL') {
        const match = matchExamToCurriculum(set, chapters);
        if (selectedWeekFilter.includes(' - ')) {
          const [tChap, ...tWeeks] = selectedWeekFilter.split(' - ');
          const tChapNorm = tChap.trim().toLowerCase();
          const tWeekNorm = tWeeks.join(' - ').trim().toLowerCase();

          if (match) {
            const chapObj = chapters.find(c => c.id === match.chapterId);
            const weekObj = chapObj?.weeks.find(w => w.id === match.weekId);
            if (chapObj && weekObj) {
              const cNameNorm = chapObj.name.toLowerCase();
              const wNameNorm = weekObj.name.toLowerCase();
              if ((cNameNorm.includes(tChapNorm) || tChapNorm.includes(cNameNorm)) &&
                  (wNameNorm.includes(tWeekNorm) || tWeekNorm.includes(wNameNorm))) {
                // matched
              } else {
                return false;
              }
            } else {
              return false;
            }
          } else {
            const topicNorm = (set.topic || '').toLowerCase();
            if (!topicNorm.includes(tChapNorm) || !topicNorm.includes(tWeekNorm)) {
              return false;
            }
          }
        } else {
          // Lọc cả chương
          const tChapNorm = selectedWeekFilter.trim().toLowerCase();
          if (match) {
            const chapObj = chapters.find(c => c.id === match.chapterId);
            if (chapObj) {
              const cNameNorm = chapObj.name.toLowerCase();
              if (!cNameNorm.includes(tChapNorm) && !tChapNorm.includes(cNameNorm)) {
                return false;
              }
            } else {
              return false;
            }
          } else {
            const topicNorm = (set.topic || '').toLowerCase();
            if (!topicNorm.includes(tChapNorm)) {
              return false;
            }
          }
        }
      }

      // Lọc theo từ khóa tìm kiếm
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = (set.title || '').toLowerCase().includes(q);
        const matchTopic = (set.topic || '').toLowerCase().includes(q);
        if (!matchTitle && !matchTopic) return false;
      }

      return true;
    });
  }, [availableSets, selectedWeekFilter, chapters, searchQuery]);

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
      <div className="min-h-screen p-4 sm:p-6 md:p-8 flex flex-col items-center bg-slate-950 overflow-y-auto no-scrollbar text-left">
        {/* Header bar */}
        <div className="max-w-7xl w-full flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 border-b border-white/10 pb-4">
          <div className="text-center sm:text-left">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white uppercase italic tracking-tighter">PHÒNG ĐƠN</h2>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
               <span className="px-2.5 py-0.5 bg-blue-600 text-white text-[8px] sm:text-[9px] font-black uppercase rounded-md shadow-xs">GIÁO VIÊN: {currentTeacher.tengv}</span>
               <span className="px-2.5 py-0.5 bg-white/10 text-blue-400 text-[8px] sm:text-[9px] font-black uppercase rounded-md border border-white/5 tracking-wider italic">KHỐI {studentGrade} • {currentTeacher.monday || 'Vật lý'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowGuide(g => !g)} 
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase italic transition-all border ${showGuide ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'}`}
            >
              📖 Hướng dẫn {showGuide ? '▲' : '▼'}
            </button>
            <button 
              onClick={() => { setJoinedRoom(null); setGameState('ROOM_SELECTION'); }} 
              className="px-5 py-2 bg-white/5 hover:bg-red-500 text-white rounded-xl text-xs font-black uppercase italic transition-all border border-white/10 shadow-md"
            >
              THOÁT ARENA ✕
            </button>
          </div>
        </div>

        {/* Collapsible Guide */}
        {showGuide && (
          <div className="w-full max-w-7xl mb-6 bg-white/5 border border-white/10 rounded-2xl p-5 animate-in fade-in slide-in-from-top-3 duration-300">
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                   <div className="text-xl mb-1">🎯</div>
                   <div className="font-black text-white text-xs uppercase mb-1">Bước 1: Chọn Đề</div>
                   <p className="text-slate-400 text-[10px] leading-relaxed font-bold italic">Lựa chọn bộ đề Khối {studentGrade} do thầy {currentTeacher.tengv} biên soạn.</p>
                </div>
                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                   <div className="text-xl mb-1">🕹️</div>
                   <div className="font-black text-white text-xs uppercase mb-1">Bước 2: Điều khiển</div>
                   <p className="text-slate-400 text-[10px] leading-relaxed font-bold italic">Sử dụng Tàu vũ trụ, Nấm hoặc Thợ lặn để di chuyển trong bài tập.</p>
                </div>
                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                   <div className="text-xl mb-1">💥</div>
                   <div className="font-black text-white text-xs uppercase mb-1">Bước 3: Nhập liệu</div>
                   <p className="text-slate-400 text-[10px] leading-relaxed font-bold italic">Bắn đáp án hoặc chạm trực tiếp vào các ô số bay lơ lửng.</p>
                </div>
                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                   <div className="text-xl mb-1">🛡️</div>
                   <div className="font-black text-white text-xs uppercase mb-1">Bước 4: Vượt rào</div>
                   <p className="text-slate-400 text-[10px] leading-relaxed font-bold italic">Ghi nhớ đề bài trong 15 giây trước khi rào cản kích hoạt.</p>
                </div>
             </div>
          </div>
        )}

        {/* Toolbar with Program / Week Listbox Filter & Search */}
        <div className="w-full max-w-7xl mb-6 flex flex-wrap items-center gap-3 bg-white/5 p-3 rounded-2xl border border-white/10">
           {/* Listbox Filter */}
           <div className="relative flex-1 min-w-[240px] max-w-md">
              <select
                value={selectedWeekFilter}
                onChange={e => setSelectedWeekFilter(e.target.value)}
                className="w-full pl-3 pr-8 py-2 bg-slate-900 text-white border border-white/15 rounded-xl text-xs font-bold outline-none focus:border-blue-400 appearance-none cursor-pointer"
              >
                <option value="ALL">📚 Tất cả Chương / Tuần (Khối {studentGrade})</option>
                {chapters.map(chap => (
                  <optgroup key={chap.id} label={`📂 ${chap.name}`}>
                    <option value={chap.name}>📂 {chap.name} (Cả chương)</option>
                    {chap.weeks.map(w => (
                      <option key={w.id} value={joinTopic(chap.name, w.name)}>
                        &nbsp;&nbsp;🔹 {w.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-[10px]">
                ▼
              </div>
           </div>

           {/* Quick Clear Filter */}
           {selectedWeekFilter !== 'ALL' && (
             <button
               onClick={() => setSelectedWeekFilter('ALL')}
               className="px-2.5 py-2 bg-red-500/20 text-red-300 hover:bg-red-500 hover:text-white rounded-xl text-[10px] font-black uppercase italic transition-all border border-red-500/30"
               title="Xóa bộ lọc chương"
             >
               ✕ Xóa lọc
             </button>
           )}

           {/* Search Input */}
           <div className="relative flex-1 min-w-[180px]">
              <input
                type="text"
                placeholder="🔍 Tìm kiếm tên đề hoặc chủ đề..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 text-white border border-white/15 rounded-xl text-xs font-medium outline-none focus:border-blue-400 placeholder:text-slate-500"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
           </div>

           <span className="text-[10px] font-black text-slate-400 uppercase italic ml-auto hidden md:inline">
             {filteredSets.length} bộ đề phù hợp
           </span>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16">
            <div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <div className="text-white font-black uppercase italic tracking-widest text-xs animate-pulse">ĐANG KẾT NỐI KHO ĐỀ CỦA THẦY {currentTeacher.tengv.split(' ').pop().toUpperCase()}...</div>
          </div>
        ) : filteredSets.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3.5 w-full max-w-7xl">
            {filteredSets.map((set) => (
              <div 
                key={set.id} 
                className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl hover:border-blue-300 transition-all flex flex-col group relative"
              >
                {/* Header Tag */}
                <div className="flex items-center justify-between gap-1.5 mb-2">
                  <span 
                    className="px-2 py-0.5 bg-blue-600 text-white text-[7.5px] font-black uppercase rounded-md shadow-2xs truncate max-w-[75%]"
                    title={set.topic || 'BÀI TẬP'}
                  >
                    {set.topic || 'BÀI TẬP'}
                  </span>
                  <span className="text-[8px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md italic">
                    K{set.grade}
                  </span>
                </div>

                {/* Title */}
                <h4 
                  className="text-xs sm:text-[13px] font-black text-slate-800 uppercase italic leading-snug group-hover:text-blue-600 transition-colors line-clamp-2 min-h-[2rem] mb-2.5"
                  title={set.title}
                >
                  {set.title}
                </h4>

                {/* Compact Stats */}
                <div className="grid grid-cols-2 gap-1.5 mb-3">
                  <div className="bg-slate-50 p-1.5 rounded-xl border border-slate-100 flex flex-col items-center shadow-2xs">
                    <div className="text-[6.5px] font-black text-slate-400 uppercase leading-none mb-0.5">Cấu trúc</div>
                    <div className="text-xs font-black text-slate-700 italic leading-none">{set.round_count || 1} <span className="text-[7.5px] uppercase">vòng</span></div>
                  </div>
                  <div className="bg-slate-50 p-1.5 rounded-xl border border-slate-100 flex flex-col items-center shadow-2xs">
                    <div className="text-[6.5px] font-black text-slate-400 uppercase leading-none mb-0.5">Tổng số</div>
                    <div className="text-xs font-black text-slate-700 italic leading-none">{set.question_count || 0} <span className="text-[7.5px] uppercase">câu</span></div>
                  </div>
                </div>

                {/* Action button */}
                <button 
                  onClick={() => { setSelectedSet(set); setGameState('KEYWORD_SELECTION'); }} 
                  className="mt-auto w-full py-2 bg-slate-900 text-white hover:bg-blue-600 rounded-xl font-black uppercase italic text-[10px] shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1.5 group/btn"
                >
                  LUYỆN TẬP NGAY 🚀
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-16 opacity-40 select-none">
             <div className="text-6xl mb-3 grayscale">📭</div>
             <p className="font-black uppercase italic tracking-[0.2em] text-lg text-white">CHƯA CÓ ĐỀ PHÙ HỢP</p>
             <p className="text-white font-bold italic text-xs mt-2 max-w-md">Vui lòng kiểm tra lại bộ lọc chương trình hoặc nhắn thầy {currentTeacher.tengv} gán đề Khối {studentGrade} vào Arena!</p>
          </div>
        )}
      </div>
    );
  }

  if (gameState === 'KEYWORD_SELECTION' && selectedSet) {
    return (
      <div className="min-h-screen p-4 sm:p-8 flex flex-col items-center justify-center bg-slate-950">
         <div className="max-w-3xl w-full bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border-b-8 border-blue-600 animate-in zoom-in duration-200">
            <header className="mb-6 text-center">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-800 uppercase italic mb-1 tracking-tighter">BẮT ĐẦU ARENA</h2>
              <p className="text-slate-400 font-bold uppercase text-[9px] tracking-widest italic">{selectedSet.title}</p>
            </header>
            <div className="bg-slate-50 p-4 sm:p-6 rounded-2xl mb-6 shadow-inner overflow-y-auto max-h-[50vh] no-scrollbar">
               <KeywordSelector 
                selectedQuantities={selectedQuantities} 
                selectedFormulas={selectedFormulas} 
                onToggleQuantity={s => setSelectedQuantities(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s])} 
                onToggleFormula={id => setSelectedFormulas(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])} 
               />
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setGameState('SET_SELECTION')} 
                className="flex-1 py-3.5 bg-slate-100 text-slate-500 hover:bg-slate-200 rounded-xl font-black uppercase italic text-sm transition-all"
                disabled={isStartingMatch}
              >
                QUAY LẠI
              </button>
              <button 
                onClick={startPredefinedMatch} 
                disabled={isStartingMatch}
                className="flex-[2] py-3.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl font-black uppercase italic text-sm shadow-md active:scale-98 transition-all disabled:opacity-50"
              >
                {isStartingMatch ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
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
