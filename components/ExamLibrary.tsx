
import React, { useState, useEffect, useMemo } from 'react';
import ConfirmModal from './ConfirmModal';
import { updateExamSetTitle, getSetAssignments, removeRoomAssignment, assignSetToRoom, fetchAllAssignmentsForTeacher, getLeaderboard } from '../services/supabaseService';
import { getChaptersForGrade, getCurriculumTree, matchExamToCurriculum, joinTopic } from '../services/curriculumData';

interface ExamLibraryProps {
  examSets: any[];
  searchLibrary: string;
  setSearchLibrary: (s: string) => void;
  activeCategory: string;
  setActiveCategory: (s: string) => void;
  onLoadSet: (setId: string, title: string) => Promise<boolean>;
  onDeleteSet: (setId: string, title: string) => Promise<boolean>;
  onDistribute: (setId: string, title: string, roomCode: string) => void;
  onEdit: (setId: string, title: string) => void;
  onRefresh: () => void;
  teacherId: string;
  teacherSubject?: string;
  isLoadingSets?: boolean;
}

const ExamLibrary: React.FC<ExamLibraryProps> = ({
  examSets,
  searchLibrary,
  setSearchLibrary,
  activeCategory,
  setActiveCategory,
  onLoadSet,
  onDeleteSet,
  onEdit,
  onRefresh,
  teacherId,
  teacherSubject,
  isLoadingSets
}) => {
  const [deleteTarget, setDeleteTarget] = useState<{ id: string, title: string } | null>(null);
  const [distributeTarget, setDistributeTarget] = useState<{ id: string, title: string, assignedRooms: string[] } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string, title: string } | null>(null);
  const [newName, setNewName] = useState('');
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [selectedWeekFilter, setSelectedWeekFilter] = useState<string>('ALL');
  const [setAssignments, setSetAssignments] = useState<Record<string, string[]>>({});
  const [isToggling, setIsToggling] = useState(false);
  const [leaderboardTarget, setLeaderboardTarget] = useState<{ id: string, title: string } | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);

  const arenaRooms = [
    { id: '1', name: 'Phòng đơn', code: 'ARENA_A', emoji: '🛡️', type: 'self' },
    { id: '2', name: 'Phòng đôi', code: 'ARENA_B', emoji: '⚔️', type: 'self' },
    { id: '3', name: 'Phòng 3', code: 'ARENA_C', emoji: '🏹', type: 'self' },
    { id: '4', name: 'Phòng 4', code: 'ARENA_D', emoji: '🔱', type: 'self' },
  ];

  const fetchAllAssignments = async () => {
    try {
      const allAssignments = await fetchAllAssignmentsForTeacher(teacherId);
      const assignmentsMap: Record<string, string[]> = {};
      
      allAssignments.forEach((row: any) => {
        if (!assignmentsMap[row.set_id]) assignmentsMap[row.set_id] = [];
        assignmentsMap[row.set_id].push(row.room_code);
      });
      
      setSetAssignments(assignmentsMap);
    } catch (e) {
      console.error("Lỗi tải gán phòng:", e);
    }
  };

  useEffect(() => {
    if (examSets.length > 0) fetchAllAssignments();
  }, [examSets]);

  // Version counter to force re-computation when curriculum is updated
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

  // Reset week filter when activeCategory changes if it's no longer relevant
  useEffect(() => {
    setSelectedWeekFilter('ALL');
  }, [activeCategory]);

  // Curriculum tree for filtering
  const curriculumOptions = useMemo(() => {
    if (['10', '11', '12'].includes(activeCategory)) {
      const chapters = getChaptersForGrade(activeCategory, teacherId);
      return [{ grade: activeCategory, chapters }];
    }
    return getCurriculumTree(teacherId);
  }, [activeCategory, teacherId, curriculumVersion]);

  // Check if an exam matches the week filter
  const matchesWeek = (set: any, target: string) => {
    if (!target || target === 'ALL') return true;
    const gradeStr = String(set.grade || '10');
    const chapters = getChaptersForGrade(gradeStr, teacherId);
    const match = matchExamToCurriculum(set, chapters);

    if (target.includes(' - ')) {
      const [tChap, ...tWeeks] = target.split(' - ');
      const tChapNorm = tChap.trim().toLowerCase();
      const tWeekNorm = tWeeks.join(' - ').trim().toLowerCase();

      if (match) {
        const chapObj = chapters.find(c => c.id === match.chapterId);
        const weekObj = chapObj?.weeks.find(w => w.id === match.weekId);
        if (chapObj && weekObj) {
          const cNameNorm = chapObj.name.toLowerCase();
          const wNameNorm = weekObj.name.toLowerCase();
          if (cNameNorm.includes(tChapNorm) || tChapNorm.includes(cNameNorm)) {
            if (wNameNorm.includes(tWeekNorm) || tWeekNorm.includes(wNameNorm)) {
              return true;
            }
          }
        }
      }

      // Direct string fallback
      const topicNorm = (set.topic || '').toLowerCase();
      return topicNorm.includes(tChapNorm) && topicNorm.includes(tWeekNorm);
    } else {
      // Filter by whole chapter
      const tChapNorm = target.trim().toLowerCase();
      if (match) {
        const chapObj = chapters.find(c => c.id === match.chapterId);
        if (chapObj) {
          const cNameNorm = chapObj.name.toLowerCase();
          if (cNameNorm.includes(tChapNorm) || tChapNorm.includes(cNameNorm)) {
            return true;
          }
        }
      }
      const topicNorm = (set.topic || '').toLowerCase();
      return topicNorm.includes(tChapNorm);
    }
  };

  const filteredExamSets = useMemo(() => {
    return examSets.filter(set => {
      const matchSearch = (set.title || "").toLowerCase().includes(searchLibrary.toLowerCase()) ||
                          (set.topic || "").toLowerCase().includes(searchLibrary.toLowerCase());
      if (!matchSearch) return false;
      if (['10', '11', '12'].includes(activeCategory)) {
        if (String(set.grade) !== activeCategory) return false;
      } else if (teacherSubject && activeCategory === teacherSubject) {
        if ((set.subject || "").toLowerCase() !== teacherSubject.toLowerCase()) return false;
      } else if (activeCategory !== 'Tất cả') {
        const catMatch = (set.topic && set.topic === activeCategory) || (set.title || "").toLowerCase().includes(activeCategory.toLowerCase());
        if (!catMatch) return false;
      }

      if (selectedWeekFilter && selectedWeekFilter !== 'ALL') {
        if (!matchesWeek(set, selectedWeekFilter)) return false;
      }

      return true;
    });
  }, [examSets, searchLibrary, activeCategory, teacherSubject, selectedWeekFilter]);

  const handleToggleRoom = async (roomCode: string) => {
    if (!distributeTarget || isToggling) return;
    const setId = distributeTarget.id;
    
    const isCurrentlyAssigned = distributeTarget.assignedRooms.includes(roomCode);
    
    const newAssignedRooms = isCurrentlyAssigned 
      ? distributeTarget.assignedRooms.filter(c => c !== roomCode) 
      : [...distributeTarget.assignedRooms, roomCode];
    
    setDistributeTarget(prev => prev ? { ...prev, assignedRooms: newAssignedRooms } : null);
    setSetAssignments(prev => ({ ...prev, [setId]: newAssignedRooms }));

    setIsToggling(true);
    try {
      if (isCurrentlyAssigned) {
        await removeRoomAssignment(teacherId, roomCode, setId);
      } else {
        await assignSetToRoom(teacherId, roomCode, setId);
      }
    } catch (e) {
      console.error("Lỗi cập nhật gán phòng:", e);
      alert("Lỗi khi cập nhật gán phòng. Vui lòng kiểm tra lại kết nối.");
      fetchAllAssignments();
    } finally { setIsToggling(false); }
  };

  const handleRename = async () => {
    if (!renameTarget || !newName.trim()) return;
    try {
      await updateExamSetTitle(renameTarget.id, newName.trim());
      onRefresh();
      setRenameTarget(null);
    } catch (e) { alert("Lỗi đổi tên"); }
  };

  const getFriendlyRoomName = (code: string) => {
    const room = arenaRooms.find(r => r.code === code);
    return room ? room.name : null;
  };

  const handleViewLeaderboard = async (setId: string, title: string) => {
    setLeaderboardTarget({ id: setId, title });
    setIsLoadingLeaderboard(true);
    try {
      const data = await getLeaderboard(setId);
      setLeaderboardData(data);
    } catch (e) {
      console.error("Lỗi tải bảng xếp hạng:", e);
    } finally {
      setIsLoadingLeaderboard(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full animate-in fade-in duration-500 text-left">
      {leaderboardTarget && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setLeaderboardTarget(null)}></div>
           <div className="bg-white rounded-[3rem] p-8 shadow-2xl max-w-xl w-full relative z-10 border-4 border-slate-100 animate-in zoom-in overflow-y-auto no-scrollbar max-h-[90vh]">
              <div className="text-center mb-6">
                <div className="text-5xl mb-2">📊</div>
                <h3 className="text-xl font-black text-slate-800 uppercase italic leading-tight">Bảng xếp hạng Arena</h3>
                <p className="text-blue-600 font-black uppercase text-[10px] italic tracking-widest mt-1">{leaderboardTarget.title}</p>
              </div>

              <div className="bg-slate-50 rounded-[2rem] p-6 border-2 border-slate-100 shadow-inner min-h-[250px]">
                {isLoadingLeaderboard ? (
                  <div className="py-16 flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-[10px] font-black text-slate-400 uppercase italic">Đang tải dữ liệu...</span>
                  </div>
                ) : leaderboardData.length > 0 ? (
                  <div className="space-y-3">
                    {leaderboardData.map((entry, idx) => (
                      <div key={entry.id} className="flex justify-between items-center p-4 bg-white rounded-2xl border-2 border-slate-100 shadow-sm hover:scale-[1.01] transition-transform">
                        <div className="flex items-center gap-4">
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center font-black italic text-xs ${idx === 0 ? 'bg-amber-400 text-white' : idx === 1 ? 'bg-slate-300 text-white' : idx === 2 ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                            {idx + 1}
                          </span>
                          <div className="flex flex-col">
                            <span className="font-black uppercase italic text-xs text-slate-800">{entry.player_name}</span>
                            <span className="text-[8px] font-bold text-slate-400 uppercase italic">{new Date(entry.created_at).toLocaleDateString('vi-VN')}</span>
                          </div>
                        </div>
                        <div className="text-xl font-black text-blue-600 italic">{entry.score}đ</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-16 text-center">
                    <div className="text-5xl mb-2 opacity-20">🏜️</div>
                    <p className="text-slate-300 font-black uppercase italic text-xs">Chưa có ai chinh phục bộ đề này</p>
                  </div>
                )}
              </div>

              <button onClick={() => setLeaderboardTarget(null)} className="w-full py-4 bg-slate-900 text-white font-black rounded-2xl uppercase italic text-xs mt-6 shadow-lg">Đóng</button>
           </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Xóa bộ đề?"
        message={`Bạn có chắc muốn xóa vĩnh viễn bộ đề "${deleteTarget?.title}"?`}
        onConfirm={() => { if (deleteTarget) onDeleteSet(deleteTarget.id, deleteTarget.title); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
        isDestructive={true}
      />

      {renameTarget && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setRenameTarget(null)}></div>
           <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl max-w-md w-full relative z-10 border-4 border-slate-100 animate-in zoom-in">
              <h3 className="text-xl font-black text-slate-800 uppercase italic mb-4 text-center">Đổi tên bộ đề</h3>
              <input type="text" className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold mb-6 outline-none focus:border-blue-400 text-sm" value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setRenameTarget(null)} className="py-3 bg-slate-100 text-slate-500 font-black rounded-xl text-xs uppercase">Hủy</button>
                <button onClick={handleRename} className="py-3 bg-blue-600 text-white font-black rounded-xl text-xs uppercase shadow-md">Lưu</button>
              </div>
           </div>
        </div>
      )}

      {distributeTarget && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setDistributeTarget(null)}></div>
          <div className="bg-white rounded-[3rem] p-8 shadow-2xl max-w-xl w-full relative z-10 border-4 border-slate-100 animate-in slide-in-from-bottom-8">
            <h3 className="text-2xl font-black text-slate-800 uppercase italic mb-1 text-center">Gán Đề Vào Arena</h3>
            <p className="text-slate-400 font-bold text-center mb-6 uppercase text-xs italic">Chọn các phòng để triển khai bộ đề:</p>
            <div className="grid grid-cols-2 gap-3 mb-8 max-h-[45vh] overflow-y-auto no-scrollbar p-1">
              {arenaRooms.map(room => {
                const isAssigned = distributeTarget.assignedRooms.includes(room.code);
                return (
                  <button
                    key={room.id}
                    onClick={() => handleToggleRoom(room.code)}
                    disabled={isToggling}
                    className={`p-4 rounded-2xl border-3 transition-all text-left relative flex flex-col items-center justify-center ${isAssigned ? 'bg-blue-600 border-blue-400 text-white shadow-md' : 'bg-slate-50 border-slate-100 text-slate-800 hover:border-blue-200'} ${isToggling ? 'opacity-70' : ''}`}
                  >
                    {isAssigned && <div className="absolute top-2 right-2 bg-white text-blue-600 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black shadow">✓</div>}
                    <div className="text-3xl mb-1.5">{room.emoji}</div>
                    <div className="font-black text-[11px] uppercase italic text-center">{room.name}</div>
                  </button>
                );
              })}
            </div>
            <button onClick={() => { setDistributeTarget(null); onRefresh(); }} className="w-full py-4 bg-slate-900 text-white font-black rounded-xl uppercase italic text-xs border-b-4 border-slate-800 shadow-md">Hoàn tất</button>
          </div>
        </div>
      )}

      {/* Top Filter Bar */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button 
          onClick={() => setShowSearchInput(!showSearchInput)} 
          className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-md border-2 transition-all ${showSearchInput ? 'bg-slate-900 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-100 hover:text-slate-700'}`}
          title="Tìm kiếm"
        >
          <span className="text-base">🔍</span>
        </button>

        {/* Grade Category Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {['Tất cả', teacherSubject, '10', '11', '12'].filter(Boolean).map(cat => (
            <button 
              key={cat} 
              onClick={() => setActiveCategory(cat!)} 
              className={`px-4 py-2.5 rounded-2xl font-black text-xs uppercase italic transition-all shadow-sm border-2 ${activeCategory === cat ? 'bg-blue-600 text-white border-blue-500 shadow-blue-200 scale-105' : 'bg-white text-slate-500 border-slate-100 hover:border-slate-200'}`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Listbox Chương trình / Tuần học */}
        <div className="flex items-center gap-2 bg-white px-3.5 py-2 rounded-2xl border-2 border-slate-100 shadow-sm min-w-[240px] max-w-sm flex-1 md:flex-initial">
          <span className="text-sm">📚</span>
          <select 
            value={selectedWeekFilter}
            onChange={(e) => setSelectedWeekFilter(e.target.value)}
            className="bg-transparent text-xs font-black text-slate-700 uppercase italic outline-none cursor-pointer w-full truncate"
          >
            <option value="ALL">-- Tất cả Tuần & Chuyên đề --</option>
            {curriculumOptions.map(g => (
              <React.Fragment key={g.grade}>
                {g.chapters.map(chap => (
                  <optgroup key={chap.id} label={`[K${g.grade}] ${chap.name}`}>
                    <option value={chap.name}>📂 {chap.name} (Cả chương)</option>
                    {chap.weeks.map(w => (
                      <option key={w.id} value={joinTopic(chap.name, w.name)}>
                        &nbsp;&nbsp;🔹 {w.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </React.Fragment>
            ))}
          </select>
          {selectedWeekFilter !== 'ALL' && (
            <button 
              onClick={() => setSelectedWeekFilter('ALL')}
              className="text-[10px] font-black text-slate-400 hover:text-red-500 px-1 shrink-0"
              title="Bỏ lọc tuần"
            >
              ✕
            </button>
          )}
        </div>

        <button 
          onClick={onRefresh} 
          className={`w-11 h-11 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-2xl flex items-center justify-center shadow-md border-2 border-emerald-100 transition-all ${isLoadingSets ? 'animate-spin' : ''}`}
          title="Làm mới danh sách"
        >
          🔄
        </button>

        <span className="text-[10px] font-black text-slate-400 uppercase italic ml-auto hidden sm:inline">
          {filteredExamSets.length} bộ đề
        </span>

        {showSearchInput && (
          <div className="w-full mt-2 animate-in slide-in-from-top-2">
             <input 
               type="text" 
               placeholder="Tìm kiếm bộ đề theo tên hoặc chủ đề..." 
               className="w-full px-5 py-3 bg-white border-2 border-slate-200 rounded-2xl shadow-sm text-xs font-bold outline-none focus:border-blue-400" 
               value={searchLibrary} 
               onChange={e => setSearchLibrary(e.target.value)} 
               autoFocus 
             />
          </div>
        )}
      </div>

      {/* Compact Exam Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 overflow-y-auto pb-20">
        {filteredExamSets.length > 0 ? filteredExamSets.map(set => {
          const rawRooms = setAssignments[set.id] || [];
          const uniqueDisplayRooms = Array.from(new Set(rawRooms.map(code => getFriendlyRoomName(code)).filter(Boolean))) as string[];
          
          return (
          <div 
            key={set.id} 
            className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-lg hover:border-blue-300 transition-all flex flex-col group relative"
          >
             {/* Header Tags */}
             <div className="flex items-center justify-between gap-1.5 mb-1.5">
                <span 
                  className="px-1.5 py-0.5 bg-blue-600 text-white text-[7px] font-black uppercase rounded-md shadow-2xs truncate max-w-[70%]" 
                  title={set.topic || 'BÀI TẬP'}
                >
                  {set.topic || 'BÀI TẬP'}
                </span>
                <span className="text-[7.5px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md italic">
                  K{set.grade}
                </span>
             </div>

             {/* Title & Rename */}
             <div className="flex justify-between items-start gap-1.5 mb-1.5">
               <h4 
                 className="text-xs font-black text-slate-800 uppercase italic leading-tight group-hover:text-blue-600 transition-colors flex-1 line-clamp-2 min-h-[1.75rem]"
                 title={set.title}
               >
                 {set.title}
               </h4>
               <button 
                 onClick={() => { setRenameTarget({ id: set.id, title: set.title }); setNewName(set.title); }} 
                 className="w-5 h-5 bg-slate-50 text-slate-400 hover:bg-blue-600 hover:text-white rounded-md flex items-center justify-center transition-all shadow-2xs border border-slate-100 text-[8px] shrink-0"
                 title="Đổi tên"
               >
                 ✏️
               </button>
             </div>
             
             {/* Arena Assigned Rooms */}
             <div className="flex flex-wrap gap-1 mb-2 min-h-[16px] items-center">
                {uniqueDisplayRooms.length > 0 ? uniqueDisplayRooms.map(name => (
                   <span key={name} className="px-1.5 py-0.5 bg-slate-900 text-white text-[6.5px] font-black uppercase rounded italic border border-white/10">{name}</span>
                )) : <span className="text-[7px] font-bold text-slate-300 italic uppercase">Chưa gán Arena</span>}
             </div>

             {/* Compact Stats Row */}
             <div className="grid grid-cols-2 gap-1.5 mb-2">
                <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100 flex flex-col items-center text-center">
                  <div className="text-[6px] font-black text-slate-400 uppercase leading-none mb-0.5">Cấu trúc</div>
                  <div className="text-[11px] font-black text-slate-700 italic leading-none">{set.round_count || 1} <span className="text-[7px] uppercase">vòng</span></div>
                </div>
                <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100 flex flex-col items-center text-center">
                  <div className="text-[6px] font-black text-slate-400 uppercase leading-none mb-0.5">Tổng số</div>
                  <div className="text-[11px] font-black text-slate-700 italic leading-none">{set.question_count || 0} <span className="text-[7px] uppercase">câu</span></div>
                </div>
             </div>

             {/* Action Buttons */}
             <div className="mt-auto flex flex-col gap-1 pt-2 border-t border-slate-100">
                <button 
                  onClick={() => handleViewLeaderboard(set.id, set.title)} 
                  className="w-full py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white border border-emerald-200/60 rounded-lg font-black uppercase italic text-[7.5px] flex items-center justify-center gap-1 transition-all shadow-2xs"
                >
                  <span>📊</span> Bảng xếp hạng
                </button>
                <div className="grid grid-cols-3 gap-1 w-full">
                  <button 
                    onClick={() => setDeleteTarget({ id: set.id, title: set.title })} 
                    className="py-1 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white border border-red-200/60 rounded-lg font-black uppercase italic text-[7.5px] transition-all"
                  >
                    Xóa
                  </button>
                  <button 
                    onClick={() => onEdit(set.id, set.title)} 
                    className="py-1 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white border border-blue-200/60 rounded-lg font-black uppercase italic text-[7.5px] transition-all"
                  >
                    Sửa
                  </button>
                  <button 
                    onClick={() => setDistributeTarget({ id: set.id, title: set.title, assignedRooms: rawRooms })} 
                    className="py-1 bg-amber-50 text-amber-600 hover:bg-amber-600 hover:text-white border border-amber-200/60 rounded-lg font-black uppercase italic text-[7.5px] transition-all"
                  >
                    Gán Arena
                  </button>
                </div>
             </div>
          </div>
        )}) : (
          <div className="col-span-full py-16 text-center flex flex-col items-center justify-center opacity-30">
             <div className="text-8xl mb-4 grayscale">📭</div>
             <p className="font-black uppercase italic tracking-[0.2em] text-lg text-slate-400">Không có bộ đề phù hợp</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExamLibrary;

