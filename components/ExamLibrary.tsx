
import React, { useState, useEffect, useMemo } from 'react';
import ConfirmModal from './ConfirmModal';
import { updateExamSetTitle, getSetAssignments, removeRoomAssignment, assignSetToRoom, createSampleExamSet } from '../services/supabaseService';

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
  onLoadSet,
  onDeleteSet,
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
  const [isToggling, setIsToggling] = useState(false);
  const [isCreatingSample, setIsCreatingSample] = useState(false);

  const arenaRooms = [
    { id: '1', name: 'Phòng đơn', code: 'ARENA_A', emoji: '🛡️', type: 'self' },
    { id: '2', name: 'Phòng đôi', code: 'ARENA_B', emoji: '⚔️', type: 'self' },
    { id: '3', name: 'Phòng 3', code: 'ARENA_C', emoji: '🏹', type: 'self' },
    { id: '4', name: 'Phòng 4', code: 'ARENA_D', emoji: '🔱', type: 'self' },
    { id: '5', name: 'Phòng GV LIVE', code: 'TEACHER_LIVE', emoji: '👨‍🏫', type: 'live' },
  ];

  const fetchAllAssignments = async () => {
    const assignmentsMap: Record<string, string[]> = {};
    for (const set of examSets) {
      try {
        const rooms = await getSetAssignments(teacherId, set.id);
        assignmentsMap[set.id] = rooms;
      } catch (e) {
        assignmentsMap[set.id] = [];
      }
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
      if (teacherSubject && activeCategory === teacherSubject) return (set.subject || "").toLowerCase() === teacherSubject.toLowerCase();
      return (set.topic && set.topic === activeCategory) || (set.title || "").toLowerCase().includes(activeCategory.toLowerCase());
    });
  }, [examSets, searchLibrary, activeCategory, teacherSubject]);

  const handleToggleRoom = async (roomCode: string) => {
    if (!distributeTarget || isToggling) return;
    const setId = distributeTarget.id;
    
    // Kiểm tra xem phòng này hoặc các mã tương đương đã được gán chưa
    const isCurrentlyAssigned = distributeTarget.assignedRooms.some(r => 
      r === roomCode || (roomCode === 'TEACHER_LIVE' && r === 'TEACHER_ROOM')
    );
    
    // Nếu đang gán và bấm vào để bỏ gán: Xóa SẠCH các mã liên quan
    const newAssignedRooms = isCurrentlyAssigned 
      ? distributeTarget.assignedRooms.filter(c => c !== 'TEACHER_LIVE' && c !== 'TEACHER_ROOM' && c !== roomCode) 
      : [...distributeTarget.assignedRooms, roomCode];
    
    // Cập nhật giao diện ngay lập tức (Optimistic UI)
    setDistributeTarget(prev => prev ? { ...prev, assignedRooms: newAssignedRooms } : null);
    setSetAssignments(prev => ({ ...prev, [setId]: newAssignedRooms }));

    setIsToggling(true);
    try {
      if (isCurrentlyAssigned) {
        // Xóa mã được yêu cầu
        await removeRoomAssignment(teacherId, roomCode, setId);
        
        // Nếu là phòng LIVE, thực hiện xóa bổ sung các mã cũ/mã kỹ thuật để dọn sạch DB
        if (roomCode === 'TEACHER_LIVE' || roomCode === 'TEACHER_ROOM') {
          await removeRoomAssignment(teacherId, 'TEACHER_LIVE', setId);
          await removeRoomAssignment(teacherId, 'TEACHER_ROOM', setId);
        }
      } else {
        // Gán mới
        await assignSetToRoom(teacherId, roomCode, setId);
      }
    } catch (e) {
      console.error("Lỗi cập nhật gán phòng:", e);
      fetchAllAssignments(); // Tải lại nếu lỗi
    } finally { 
      setIsToggling(false); 
    }
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
    if (code === 'TEACHER_ROOM' || code === 'TEACHER_LIVE') return 'Phòng GV LIVE';
    const room = arenaRooms.find(r => r.code === code);
    return room ? room.name : code;
  };

  return (
    <div className="flex-1 flex flex-col h-full animate-in fade-in duration-500 text-left">
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
           <div className="bg-white rounded-[3rem] p-10 shadow-2xl max-w-md w-full relative z-10 border-4 border-slate-100 animate-in zoom-in">
              <h3 className="text-2xl font-black text-slate-800 uppercase italic mb-6 text-center">Đổi tên bộ đề</h3>
              <input type="text" className="w-full p-6 bg-slate-50 border-4 border-slate-100 rounded-2xl font-bold mb-8 outline-none focus:border-blue-300" value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
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
          <div className="bg-white rounded-[4rem] p-10 shadow-2xl max-w-2xl w-full relative z-10 border-4 border-slate-100 animate-in slide-in-from-bottom-8">
            <h3 className="text-3xl font-black text-slate-800 uppercase italic mb-2 text-center">Gán Đề Vào Arena</h3>
            <p className="text-slate-400 font-bold text-center mb-10 uppercase text-xs italic">Chọn các phòng để triển khai bộ đề:</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10 max-h-[50vh] overflow-y-auto no-scrollbar p-1">
              {arenaRooms.map(room => {
                const isAssigned = distributeTarget.assignedRooms.some(r => 
                  r === room.code || (room.code === 'TEACHER_LIVE' && r === 'TEACHER_ROOM')
                );
                return (
                  <button
                    key={room.id}
                    onClick={() => handleToggleRoom(room.code)}
                    disabled={isToggling}
                    className={`p-6 rounded-[2.5rem] border-4 transition-all text-left relative flex flex-col items-center justify-center ${isAssigned ? 'bg-blue-600 border-blue-400 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-800 hover:border-blue-200'} ${isToggling ? 'opacity-70' : ''}`}
                  >
                    {isAssigned && <div className="absolute top-4 right-4 bg-white text-blue-600 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shadow-lg">✓</div>}
                    <div className="text-4xl mb-3">{room.emoji}</div>
                    <div className="font-black text-xs uppercase italic text-center">{room.name}</div>
                  </button>
                );
              })}
            </div>
            <button onClick={() => { setDistributeTarget(null); onRefresh(); }} className="w-full py-5 bg-slate-900 text-white font-black rounded-2xl uppercase italic text-sm border-b-8 border-slate-800">Hoàn tất</button>
          </div>
        </div>
      )}

      <div className="mb-12 flex flex-wrap items-center gap-4">
        <button onClick={() => setShowSearchInput(!showSearchInput)} className={`w-16 h-16 rounded-full flex items-center justify-center shadow-xl border-4 ${showSearchInput ? 'bg-slate-900 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-50'}`}><span className="text-xl">🔍</span></button>
        <div className="flex flex-wrap gap-4">
          {['Tất cả', teacherSubject, '10', '11', '12'].filter(Boolean).map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat!)} className={`px-10 py-5 rounded-full font-black text-xs uppercase italic transition-all shadow-xl border-4 ${activeCategory === cat ? 'bg-blue-600 text-white border-blue-500 scale-105' : 'bg-white text-slate-400 border-slate-50'}`}>{cat}</button>
          ))}
          <button onClick={onRefresh} className={`w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shadow-xl border-4 border-emerald-100 ${isLoadingSets ? 'animate-spin' : ''}`}>🔄</button>
        </div>
        {showSearchInput && (
          <div className="flex-1 min-w-[300px] animate-in slide-in-from-left-4">
             <input type="text" placeholder="Tìm kiếm bộ đề..." className="w-full px-8 py-5 bg-white border-4 border-slate-50 rounded-full shadow-xl text-xs font-black uppercase italic outline-none focus:border-blue-200" value={searchLibrary} onChange={e => setSearchLibrary(e.target.value)} autoFocus />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 overflow-y-auto no-scrollbar pb-20">
        {filteredExamSets.length > 0 ? filteredExamSets.map(set => {
          const rawRooms = setAssignments[set.id] || [];
          const uniqueDisplayRooms = Array.from(new Set(rawRooms.map(code => getFriendlyRoomName(code))));
          
          return (
          <div key={set.id} className="bg-white p-8 rounded-[3.5rem] border-4 border-slate-50 shadow-2xl hover:border-blue-100 transition-all flex flex-col group relative">
             <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-blue-600 text-white text-[9px] font-black uppercase rounded-lg shadow-sm">{set.topic || 'BÀI TẬP'}</span>
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">K{set.grade}</span>
                </div>
                {rawRooms.some(r => r.includes('TEACHER')) && (
                  <span className="px-3 py-1 bg-rose-500 text-white text-[9px] font-black uppercase rounded-full shadow-lg animate-pulse">🔥 LIVE READY</span>
                )}
             </div>

             <div className="flex justify-between items-start gap-4 mb-4">
               <h4 className="text-2xl font-black text-slate-800 uppercase italic leading-tight group-hover:text-blue-600 transition-colors flex-1 line-clamp-2">{set.title}</h4>
               <button onClick={() => { setRenameTarget({ id: set.id, title: set.title }); setNewName(set.title); }} className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all shadow-sm border border-slate-100">✏️</button>
             </div>
             
             <div className="flex flex-wrap gap-1.5 mb-6 min-h-[24px]">
                {uniqueDisplayRooms.length > 0 ? uniqueDisplayRooms.map(name => (
                   <span key={name} className="px-2 py-0.5 bg-slate-900 text-white text-[8px] font-black uppercase rounded italic border border-white/10">{name}</span>
                )) : <span className="text-[9px] font-bold text-slate-300 italic uppercase">Chưa gán Arena</span>}
             </div>

             <div className="grid grid-cols-2 gap-3 mb-10">
                <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex flex-col items-center shadow-inner">
                  <div className="text-[9px] font-black text-slate-400 uppercase mb-1">Cấu trúc</div>
                  <div className="text-xl font-black text-slate-700 italic leading-none">{set.round_count || 1} <span className="text-[10px] uppercase">vòng</span></div>
                </div>
                <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex flex-col items-center shadow-inner">
                  <div className="text-[9px] font-black text-slate-400 uppercase mb-1">Tổng số</div>
                  <div className="text-xl font-black text-slate-700 italic leading-none">{set.question_count || 0} <span className="text-[10px] uppercase">câu</span></div>
                </div>
             </div>

             <div className="mt-auto flex flex-col gap-2 pt-4 border-t-2 border-slate-50">
                <div className="grid grid-cols-3 gap-2 w-full">
                  <button onClick={() => setDeleteTarget({ id: set.id, title: set.title })} className="py-4 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white border-2 border-red-100 rounded-[1.2rem] font-black uppercase italic text-[10px]">Xóa</button>
                  <button onClick={() => onEdit(set.id, set.title)} className="py-4 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white border-2 border-blue-100 rounded-[1.2rem] font-black uppercase italic text-[10px]">Sửa</button>
                  <button onClick={() => setDistributeTarget({ id: set.id, title: set.title, assignedRooms: rawRooms })} className="py-4 bg-amber-50 text-amber-600 hover:bg-amber-600 hover:text-white border-2 border-amber-100 rounded-[1.2rem] font-black uppercase italic text-[10px]">Gán Arena</button>
                </div>
             </div>
          </div>
        )}) : (
          <div className="col-span-full py-20 text-center flex flex-col items-center justify-center opacity-30">
             <div className="text-[12rem] mb-6 grayscale">📭</div>
             <p className="font-black uppercase italic tracking-[0.3em] text-2xl text-slate-400">Kho đề trống</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExamLibrary;
