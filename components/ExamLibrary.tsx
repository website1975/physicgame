
import React, { useState, useEffect, useMemo } from 'react';
import ConfirmModal from './ConfirmModal';
import { updateExamSetTitle, getSetAssignments, removeRoomAssignment, assignSetToRoom } from '../services/supabaseService';

interface ExamLibraryProps {
  examSets: any[];
  searchLibrary: string;
  setSearchLibrary: (s: string) => void;
  activeCategory: string;
  setActiveCategory: (s: string) => void;
  categories: string[];
  onLoadSet: (setId: string, title: string) => Promise<boolean>;
  onDeleteSet: (setId: string, title: string) => Promise<boolean>;
  onDistribute: (setId: string, title: string, roomCode: string) => void;
  onEdit: (setId: string, title: string) => void;
  onLive: (setId: string, title: string) => void;
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
  categories,
  onLoadSet,
  onDeleteSet,
  onDistribute,
  onEdit,
  onLive,
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
  const [setAssignments, setSetAssignments] = useState<Record<string, string[]>>({});

  // Chỉ bao gồm các phòng Arena tự luyện, loại bỏ TEACHER_ROOM theo yêu cầu
  const arenaRooms = [
    { id: '1', name: 'Phòng đơn', code: 'ARENA_A', emoji: '🛡️' },
    { id: '2', name: 'Phòng đôi', code: 'ARENA_B', emoji: '⚔️' },
    { id: '3', name: 'Phòng 3', code: 'ARENA_C', emoji: '🏹' },
    { id: '4', name: 'Phòng 4', code: 'ARENA_D', emoji: '🔱' },
  ];

  const fetchAllAssignments = async () => {
    const assignmentsMap: Record<string, string[]> = {};
    for (const set of examSets) {
      const rooms = await getSetAssignments(teacherId, set.id);
      // Lọc bỏ TEACHER_ROOM khỏi danh sách hiển thị nếu có dữ liệu cũ
      assignmentsMap[set.id] = rooms.filter(code => code !== 'TEACHER_ROOM');
    }
    setSetAssignments(assignmentsMap);
  };

  useEffect(() => {
    if (examSets.length > 0) fetchAllAssignments();
  }, [examSets]);

  const filteredExamSets = useMemo(() => {
    return examSets.filter(set => {
      const matchSearch = (set.title || "").toLowerCase().includes(searchLibrary.toLowerCase());
      if (!matchSearch) return false;
      if (activeCategory === 'Tất cả') return true;
      if (['10', '11', '12'].includes(activeCategory)) return String(set.grade) === activeCategory;
      return (set.topic && set.topic === activeCategory) || (set.title || "").toLowerCase().includes(activeCategory.toLowerCase());
    });
  }, [examSets, searchLibrary, activeCategory]);

  const handleToggleRoom = async (roomCode: string) => {
    if (!distributeTarget) return;
    const isAssigned = distributeTarget.assignedRooms.includes(roomCode);
    
    try {
      if (isAssigned) {
        await removeRoomAssignment(teacherId, roomCode, distributeTarget.id);
      } else {
        await assignSetToRoom(teacherId, roomCode, distributeTarget.id);
      }
      
      const newAssigned = isAssigned 
        ? distributeTarget.assignedRooms.filter(c => c !== roomCode)
        : [...distributeTarget.assignedRooms, roomCode];
      
      setDistributeTarget({ ...distributeTarget, assignedRooms: newAssigned });
      setSetAssignments(prev => ({ ...prev, [distributeTarget.id]: newAssigned }));
    } catch (e) {
      alert("Lỗi khi cập nhật phòng");
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !newName.trim()) return;
    try {
      await updateExamSetTitle(renameTarget.id, newName.trim());
      onRefresh();
      setRenameTarget(null);
      setNewName('');
    } catch (e) { alert("Lỗi đổi tên"); }
  };

  const filterPills = useMemo(() => {
    const pills = ['Tất cả'];
    if (teacherSubject) pills.push(teacherSubject);
    pills.push('10', '11', '12');
    return pills;
  }, [teacherSubject]);

  return (
    <div className="flex-1 flex flex-col h-full animate-in fade-in duration-500">
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Xóa bộ đề?"
        message={`Bạn có chắc muốn xóa vĩnh viễn bộ đề "${deleteTarget?.title}"?`}
        onConfirm={() => {
          if (deleteTarget) onDeleteSet(deleteTarget.id, deleteTarget.title);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
        isDestructive={true}
      />

      {renameTarget && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setRenameTarget(null)}></div>
           <div className="bg-white rounded-[3rem] p-10 shadow-2xl max-w-md w-full relative z-10 border-4 border-slate-100 animate-in zoom-in">
              <h3 className="text-2xl font-black text-slate-800 uppercase italic mb-6 text-center">Đổi tên bộ đề</h3>
              <input type="text" className="w-full p-6 bg-slate-50 border-4 border-slate-100 rounded-2xl font-bold mb-8" value={newName} onChange={e => setNewName(e.target.value)} />
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setRenameTarget(null)} className="py-4 bg-slate-100 text-slate-500 font-black rounded-2xl">Hủy</button>
                <button onClick={handleRename} className="py-4 bg-blue-600 text-white font-black rounded-2xl shadow-lg">Lưu</button>
              </div>
           </div>
        </div>
      )}

      {distributeTarget && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setDistributeTarget(null)}></div>
          <div className="bg-white rounded-[3rem] p-10 shadow-2xl max-w-xl w-full relative z-10 border-4 border-slate-100 animate-in slide-in-from-bottom-8">
            <h3 className="text-3xl font-black text-slate-800 uppercase italic mb-2 text-center">Phân phối Arena Tự học</h3>
            <p className="text-slate-400 font-bold text-center mb-10 uppercase text-xs italic">Học sinh có thể tự luyện bộ đề này tại các phòng:</p>
            
            <div className="grid grid-cols-2 gap-4 mb-10">
              {arenaRooms.map(room => {
                const isAssigned = distributeTarget.assignedRooms.includes(room.code);
                return (
                  <button
                    key={room.id}
                    onClick={() => handleToggleRoom(room.code)}
                    className={`p-8 rounded-[2.5rem] border-4 transition-all text-left relative group ${isAssigned ? 'bg-blue-600 border-blue-400 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-800 hover:border-blue-200'}`}
                  >
                    {isAssigned && <div className="absolute top-6 right-6 bg-white text-blue-600 w-8 h-8 rounded-full flex items-center justify-center text-sm font-black shadow-lg animate-in zoom-in">✓</div>}
                    <div className="text-4xl mb-4">{room.emoji}</div>
                    <div className="font-black text-xl uppercase italic leading-none mb-1">{room.name}</div>
                    <div className={`text-[10px] font-black uppercase tracking-widest ${isAssigned ? 'text-blue-200' : 'text-slate-400'}`}>Mã: {room.code}</div>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setDistributeTarget(null)} className="w-full py-5 bg-slate-900 text-white font-black rounded-2xl uppercase italic text-sm">Hoàn tất thiết lập</button>
          </div>
        </div>
      )}

      <div className="mb-12 flex flex-wrap items-center gap-4">
        <button onClick={() => setShowSearchInput(!showSearchInput)} className={`w-16 h-16 rounded-full flex items-center justify-center shadow-xl border-4 ${showSearchInput ? 'bg-slate-900 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-50'}`}><span className="text-xl">🔍</span></button>
        <div className="flex flex-wrap gap-4">
          {filterPills.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)} className={`px-10 py-5 rounded-full font-black text-xs uppercase italic transition-all shadow-xl border-4 ${activeCategory === cat ? 'bg-blue-600 text-white border-blue-500 scale-105' : 'bg-white text-slate-400 border-slate-50 hover:border-blue-200'}`}>{['10', '11', '12'].includes(cat) ? `KHỐI ${cat}` : cat}</button>
          ))}
          <button onClick={onRefresh} className={`w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shadow-xl border-4 border-emerald-100 hover:bg-emerald-600 hover:text-white transition-all ${isLoadingSets ? 'animate-spin' : ''}`}><span className="text-xl">🔄</span></button>
        </div>
        {showSearchInput && (
          <div className="flex-1 min-w-[300px] animate-in slide-in-from-left-4">
             <input type="text" placeholder="Tìm kiếm bộ đề..." className="w-full px-8 py-5 bg-white border-4 border-slate-50 rounded-full shadow-xl text-xs font-black uppercase italic outline-none focus:border-blue-200" value={searchLibrary} onChange={e => setSearchLibrary(e.target.value)} autoFocus />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 overflow-y-auto no-scrollbar pb-20">
        {isLoadingSets ? (
          <div className="col-span-full py-40 text-center flex flex-col items-center justify-center"><div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div><p className="font-black uppercase italic text-slate-400">Đang đồng bộ kho đề...</p></div>
        ) : filteredExamSets.length > 0 ? filteredExamSets.map(set => {
          const assignedRoomsForSet = setAssignments[set.id] || [];
          return (
          <div key={set.id} className="bg-white p-8 rounded-[3.5rem] border-4 border-slate-50 shadow-2xl hover:border-blue-100 transition-all flex flex-col group relative overflow-hidden">
             <div className="flex items-center gap-2 mb-4">
                <span className="px-3 py-1 bg-blue-600 text-white text-[9px] font-black uppercase rounded-lg shadow-sm">{set.topic || 'BÀI TẬP'}</span>
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">K{set.grade || '10'} • {new Date(set.created_at).toLocaleDateString('vi-VN')}</span>
             </div>

             <h4 className="text-2xl font-black text-slate-800 uppercase italic mb-4 line-clamp-2 leading-tight group-hover:text-blue-600 transition-colors">{set.title}</h4>
             
             <div className="flex flex-wrap gap-1.5 mb-6 min-h-[24px]">
                {assignedRoomsForSet.length > 0 ? assignedRoomsForSet.map(code => (
                   <span key={code} className="px-2 py-0.5 bg-slate-900 text-white text-[8px] font-black uppercase rounded italic border border-white/10">{arenaRooms.find(r => r.code === code)?.name || code}</span>
                )) : <span className="text-[9px] font-bold text-slate-300 italic uppercase">Chưa gán Arena tĩnh</span>}
             </div>

             <div className="grid grid-cols-2 gap-3 mb-10">
                <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex flex-col items-center"><div className="text-[9px] font-black text-slate-400 uppercase mb-1">Cấu trúc</div><div className="text-xl font-black text-slate-700 italic leading-none">{set.round_count || 1} <span className="text-[10px] uppercase">vòng</span></div></div>
                <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex flex-col items-center"><div className="text-[9px] font-black text-slate-400 uppercase mb-1">Tổng số</div><div className="text-xl font-black text-slate-700 italic leading-none">{set.question_count || 0} <span className="text-[10px] uppercase">câu</span></div></div>
             </div>

             <div className="mt-auto flex flex-wrap gap-2 pt-4 border-t-2 border-slate-50">
                <button onClick={() => onLive(set.id, set.title)} className="w-full py-5 bg-blue-600 text-white hover:bg-blue-700 border-b-4 border-blue-800 rounded-2xl font-black uppercase italic transition-all text-sm flex items-center justify-center gap-3 shadow-lg hover:scale-[1.02] active:scale-95 mb-4"><span className="text-xl">🚀</span> DẠY LIVE PHÒNG GV</button>
                <div className="grid grid-cols-3 gap-2 w-full">
                  <button onClick={() => setDeleteTarget({ id: set.id, title: set.title })} className="py-4 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white border-2 border-red-100 rounded-[1.2rem] font-black uppercase italic transition-all text-[10px]">Xóa</button>
                  <button onClick={() => onEdit(set.id, set.title)} className="py-4 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white border-2 border-blue-100 rounded-[1.2rem] font-black uppercase italic transition-all text-[10px]">Sửa</button>
                  <button onClick={() => setDistributeTarget({ id: set.id, title: set.title, assignedRooms: assignedRoomsForSet })} className="py-4 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white border-2 border-emerald-100 rounded-[1.2rem] font-black uppercase italic transition-all text-[10px]">Gán Arena</button>
                </div>
             </div>
          </div>
        )}) : (
          <div className="col-span-full py-40 text-center opacity-30"><div className="text-[10rem] mb-6 grayscale select-none">🏜️</div><p className="font-black uppercase italic tracking-[0.3em] text-2xl text-slate-400">Kho đề trống</p></div>
        )}
      </div>
    </div>
  );
};

export default ExamLibrary;
