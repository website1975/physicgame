
import React, { useState, useEffect, useMemo } from 'react';
import ConfirmModal from './ConfirmModal';
import { updateExamSetTitle, getSetAssignments, removeRoomAssignment } from '../services/supabaseService';

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
  onRefresh,
  teacherId,
  teacherSubject,
  isLoadingSets
}) => {
  const [deleteTarget, setDeleteTarget] = useState<{ id: string, title: string } | null>(null);
  const [distributeTarget, setDistributeTarget] = useState<{ id: string, title: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string, title: string } | null>(null);
  const [manageRoomsTarget, setManageRoomsTarget] = useState<{ id: string, title: string } | null>(null);
  const [assignedRooms, setAssignedRooms] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [showSearchInput, setShowSearchInput] = useState(false);

  const filteredExamSets = useMemo(() => {
    return examSets.filter(set => {
      const matchSearch = (set.title || "").toLowerCase().includes(searchLibrary.toLowerCase());
      
      let matchCat = true;
      if (activeCategory === 'Tất cả') {
        matchCat = true;
      } else if (['10', '11', '12'].includes(activeCategory)) {
        matchCat = set.grade === activeCategory;
      } else {
        matchCat = (set.topic && set.topic === activeCategory) || 
                   (set.subject && set.subject === activeCategory) ||
                   ((set.title || "").toLowerCase().includes(activeCategory.toLowerCase()));
      }
                       
      return matchSearch && matchCat;
    });
  }, [examSets, searchLibrary, activeCategory]);

  const arenaRooms = [
    { id: '1', name: 'Phòng đơn', code: 'ARENA_A' },
    { id: '2', name: 'Phòng đôi', code: 'ARENA_B' },
    { id: '3', name: 'Phòng 3', code: 'ARENA_C' },
    { id: '4', name: 'Phòng 4', code: 'ARENA_D' },
    { id: '5', name: 'GV tổ chức', code: 'TEACHER_ROOM' },
  ];

  const handleRename = async () => {
    if (!renameTarget || !newName.trim()) return;
    try {
      await updateExamSetTitle(renameTarget.id, newName.trim());
      onRefresh();
      setRenameTarget(null);
      setNewName('');
    } catch (e) {
      alert("Lỗi đổi tên");
    }
  };

  const fetchAssignments = async (setId: string) => {
    setIsLoadingRooms(true);
    try {
      const rooms = await getSetAssignments(teacherId, setId);
      setAssignedRooms(rooms);
    } catch (e) {
      console.error("Lỗi lấy ds phòng:", e);
    } finally {
      setIsLoadingRooms(false);
    }
  };

  const handleUnassign = async (roomCode: string) => {
    if (!manageRoomsTarget) return;
    try {
      await removeRoomAssignment(teacherId, roomCode, manageRoomsTarget.id);
      fetchAssignments(manageRoomsTarget.id);
    } catch (e) {
      alert("Lỗi hủy gán");
    }
  };

  useEffect(() => {
    if (manageRoomsTarget) {
      fetchAssignments(manageRoomsTarget.id);
    } else {
      setAssignedRooms([]);
    }
  }, [manageRoomsTarget]);

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
        confirmText="Xóa vĩnh viễn"
      />

      {renameTarget && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setRenameTarget(null)}></div>
           <div className="bg-white rounded-[3rem] p-10 shadow-2xl max-w-md w-full relative z-10 border-4 border-slate-100 animate-in zoom-in duration-200">
              <h3 className="text-2xl font-black text-slate-800 uppercase italic mb-6 text-center leading-none">Đổi tên bộ đề</h3>
              <input 
                type="text" 
                className="w-full p-6 bg-slate-50 border-4 border-slate-100 rounded-2xl font-bold mb-8 outline-none focus:border-blue-500" 
                value={newName} 
                onChange={e => setNewName(e.target.value)}
                placeholder="Nhập tên mới..."
              />
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setRenameTarget(null)} className="py-4 bg-slate-100 text-slate-500 font-black rounded-2xl uppercase italic">Hủy</button>
                <button onClick={handleRename} className="py-4 bg-blue-600 text-white font-black rounded-2xl uppercase italic shadow-lg">Xác nhận</button>
              </div>
           </div>
        </div>
      )}

      {manageRoomsTarget && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setManageRoomsTarget(null)}></div>
           <div className="bg-white rounded-[3rem] p-10 shadow-2xl max-w-md w-full relative z-10 border-4 border-slate-100 animate-in zoom-in duration-200">
              <h3 className="text-2xl font-black text-slate-800 uppercase italic mb-2 text-center">Các phòng đang gán</h3>
              <p className="text-slate-400 font-bold text-center mb-8 uppercase text-[10px] tracking-widest italic leading-none">{manageRoomsTarget.title}</p>
              
              <div className="max-h-[300px] overflow-y-auto space-y-3 mb-8 no-scrollbar">
                {isLoadingRooms ? (
                  <div className="text-center py-10 text-slate-300 font-black animate-pulse">ĐANG TẢI...</div>
                ) : assignedRooms.length > 0 ? (
                  assignedRooms.map(code => (
                    <div key={code} className="flex items-center justify-between p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl">
                       <div className="font-black text-slate-700 italic uppercase leading-none">{arenaRooms.find(r => r.code === code)?.name || code}</div>
                       <button 
                        onClick={() => handleUnassign(code)}
                        className="w-10 h-10 bg-red-100 text-red-500 rounded-xl flex items-center justify-center font-black hover:bg-red-500 hover:text-white transition-all"
                       >
                         ✕
                       </button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 text-slate-200 italic font-bold">Chưa gán cho phòng nào</div>
                )}
              </div>
              
              <button onClick={() => setManageRoomsTarget(null)} className="w-full py-4 bg-slate-900 text-white font-black rounded-2xl uppercase italic">Đóng</button>
           </div>
        </div>
      )}

      {distributeTarget && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setDistributeTarget(null)}></div>
          <div className="bg-white rounded-[3rem] p-10 shadow-2xl max-w-2xl w-full relative z-10 border-4 border-slate-100 animate-in slide-in-from-bottom-8 duration-300">
            <h3 className="text-3xl font-black text-slate-800 uppercase italic mb-2 text-center leading-none">Gán vào Đấu trường</h3>
            <p className="text-slate-400 font-bold text-center mb-10 uppercase text-xs tracking-widest italic leading-none">
              Chọn phòng cho: <span className="text-blue-600 underline">{distributeTarget.title}</span>
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
              {arenaRooms.map(room => (
                <button
                  key={room.id}
                  onClick={() => {
                    onDistribute(distributeTarget.id, distributeTarget.title, room.code);
                    setDistributeTarget(null);
                  }}
                  className="p-6 rounded-3xl border-4 border-slate-50 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 transition-all text-left group"
                >
                  <div className="text-3xl mb-3 group-hover:scale-110 transition-transform">{room.code === 'TEACHER_ROOM' ? '👨‍🏫' : '🛡️'}</div>
                  <div className="font-black text-lg uppercase italic text-slate-800 leading-none mb-1">{room.name}</div>
                  <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Mã: {room.code}</div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setDistributeTarget(null)}
              className="w-full py-4 bg-slate-100 text-slate-500 font-black rounded-2xl uppercase italic"
            >
              Hủy bỏ
            </button>
          </div>
        </div>
      )}

      <div className="mb-12 flex flex-wrap items-center gap-4">
        <button 
          onClick={() => setShowSearchInput(!showSearchInput)}
          className={`w-16 h-16 rounded-full flex items-center justify-center shadow-xl transition-all border-4 ${showSearchInput ? 'bg-slate-900 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-50 hover:border-slate-200'}`}
        >
          <span className="text-xl">🔍</span>
        </button>

        <div className="flex flex-wrap gap-4">
          {filterPills.map(cat => (
            <button 
              key={cat} 
              onClick={() => setActiveCategory(cat)}
              className={`px-10 py-5 rounded-full font-black text-xs uppercase italic transition-all shadow-xl whitespace-nowrap border-4 ${activeCategory === cat ? 'bg-slate-900 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-50 hover:border-slate-200'}`}
            >
              {['10', '11', '12'].includes(cat) ? `KHỐI ${cat}` : cat}
            </button>
          ))}
          <button 
            onClick={onRefresh}
            className={`w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shadow-xl border-4 border-emerald-100 hover:bg-emerald-600 hover:text-white transition-all group ${isLoadingSets ? 'animate-spin' : ''}`}
            title="Làm mới kho đề"
          >
            <span className="text-xl group-hover:rotate-180 transition-transform duration-500">🔄</span>
          </button>
        </div>

        {showSearchInput && (
          <div className="flex-1 min-w-[300px] animate-in slide-in-from-left-4 duration-300">
             <input 
               type="text" 
               placeholder="Tìm kiếm theo tên..." 
               className="w-full px-8 py-5 bg-white border-4 border-slate-50 rounded-full shadow-xl text-xs font-black uppercase italic outline-none focus:border-blue-200 transition-all"
               value={searchLibrary}
               onChange={e => setSearchLibrary(e.target.value)}
               autoFocus
             />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 overflow-y-auto no-scrollbar pb-20">
        {isLoadingSets ? (
          <div className="col-span-full py-40 text-center flex flex-col items-center justify-center">
             <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
             <p className="font-black uppercase italic text-slate-400">Đang đồng bộ kho đề...</p>
          </div>
        ) : filteredExamSets.length > 0 ? filteredExamSets.map(set => (
          <div key={set.id} className="bg-white p-8 rounded-[3.5rem] border-4 border-slate-50 shadow-2xl hover:border-blue-100 transition-all flex flex-col group relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/50 rounded-bl-full -mr-16 -mt-16 group-hover:scale-110 transition-transform" />
             
             <div className="flex items-center gap-2 mb-4">
                <span className="px-3 py-1 bg-blue-600 text-white text-[9px] font-black uppercase rounded-lg shadow-sm">{set.topic || 'BÀI TẬP'}</span>
                {set.is_legacy && <span className="px-3 py-1 bg-amber-500 text-white text-[9px] font-black uppercase rounded-lg shadow-sm animate-pulse">DỮ LIỆU CŨ</span>}
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                  LỚP {set.grade || '10'} • {new Date(set.created_at).toLocaleDateString('vi-VN')}
                </span>
             </div>

             <h4 className="text-2xl font-black text-slate-800 uppercase italic mb-6 line-clamp-2 leading-tight group-hover:text-blue-600 transition-colors">{set.title}</h4>
             
             <div className="grid grid-cols-2 gap-3 mb-10">
                <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex flex-col items-center">
                   <div className="text-[9px] font-black text-slate-400 uppercase mb-1">Cấu trúc</div>
                   <div className="text-xl font-black text-slate-700 italic leading-none">{set.round_count || 1} <span className="text-[10px] uppercase">vòng</span></div>
                </div>
                <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex flex-col items-center">
                   <div className="text-[9px] font-black text-slate-400 uppercase mb-1">Tổng số</div>
                   <div className="text-xl font-black text-slate-700 italic leading-none">{set.question_count || 0} <span className="text-[10px] uppercase">câu</span></div>
                </div>
             </div>

             <div className="mt-auto flex flex-wrap gap-2 pt-4 border-t-2 border-slate-50">
                <button 
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: set.id, title: set.title }); }} 
                  className="flex-1 min-w-[60px] py-4 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white border-2 border-red-100 rounded-[1.2rem] font-black uppercase italic transition-all text-[10px]"
                >
                  Xóa
                </button>
                <button 
                  onClick={() => onEdit(set.id, set.title)} 
                  className="flex-1 min-w-[60px] py-4 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white border-2 border-blue-100 rounded-[1.2rem] font-black uppercase italic transition-all text-[10px]"
                >
                  Sửa
                </button>
                <button 
                  onClick={() => setDistributeTarget({ id: set.id, title: set.title })} 
                  className="flex-1 min-w-[80px] py-4 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white border-2 border-emerald-100 rounded-[1.2rem] font-black uppercase italic transition-all text-[10px]"
                >
                  Gán Arena
                </button>
                <button 
                  onClick={() => setManageRoomsTarget({ id: set.id, title: set.title })} 
                  className="w-full mt-2 py-4 bg-slate-900 text-white border-2 border-slate-800 rounded-2xl font-black uppercase italic transition-all text-[10px] flex items-center justify-center gap-2 hover:bg-slate-800"
                >
                  <span>🏠</span> Xem các phòng đang gán
                </button>
             </div>
          </div>
        )) : (
          <div className="col-span-full py-40 text-center flex flex-col items-center justify-center opacity-30">
             <div className="text-[10rem] mb-6 grayscale select-none">🏜️</div>
             <p className="font-black uppercase italic tracking-[0.3em] text-2xl text-slate-400">Kho đề trống</p>
             <button onClick={onRefresh} className="mt-8 text-blue-600 font-black uppercase text-xs underline animate-pulse">Làm mới dữ liệu 🔄</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExamLibrary;
