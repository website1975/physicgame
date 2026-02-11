import React, { useState, useEffect } from 'react';
import { Teacher } from '../types';
import { getAllTeachers, createTeacher, updateTeacher, deleteTeacher } from '../services/supabaseService';
import ConfirmModal from './ConfirmModal';

const TeacherManagement: React.FC = () => {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingTeacher, setEditingTeacher] = useState<Partial<Teacher> | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const loadTeachers = async () => {
    setIsLoading(true);
    try {
      const data = await getAllTeachers();
      setTeachers(data);
    } catch (e) {
      console.error("Lỗi khi tải danh sách giáo viên", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadTeachers(); }, []);

  const handleSave = async () => {
    if (!editingTeacher?.magv || !editingTeacher?.tengv || !editingTeacher?.pass) {
      alert("Vui lòng nhập đầy đủ: Mã GV, Tên GV và Mật khẩu!");
      return;
    }

    try {
      if (editingTeacher.id) {
        await updateTeacher(editingTeacher.id, editingTeacher);
      } else {
        await createTeacher({
          magv: editingTeacher.magv!,
          tengv: editingTeacher.tengv!,
          monday: editingTeacher.monday || 'Vật lý',
          pass: editingTeacher.pass!,
          role: editingTeacher.role || 'TEACHER'
        });
      }
      setShowModal(false);
      setEditingTeacher(null);
      loadTeachers();
    } catch (e) {
      alert("Lỗi khi lưu thông tin");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteTeacher(deleteId);
      setDeleteId(null);
      loadTeachers();
    } catch (e) {
      alert("Lỗi khi xóa giáo viên");
    }
  };

  const filtered = teachers.filter(t => 
    (t.tengv || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
    (t.magv || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full animate-in fade-in duration-500">
      <ConfirmModal 
        isOpen={!!deleteId}
        title="Xóa giáo viên?"
        message="Bạn có chắc muốn xóa giáo viên này khỏi hệ thống?"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        isDestructive={true}
      />

      {showModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowModal(false)}></div>
           <div className="bg-white rounded-[3rem] p-10 shadow-2xl max-w-lg w-full relative z-10 border-4 border-slate-100">
              <h3 className="text-3xl font-black text-slate-800 uppercase italic mb-8 text-center">{editingTeacher?.id ? 'Sửa thông tin' : 'Thêm giáo viên'}</h3>
              <div className="space-y-4 mb-10 text-left">
                 <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase italic mb-1 block">Mã Giáo Viên (Dùng để đăng nhập)</label>
                   <input 
                    type="text" 
                    className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 uppercase"
                    value={editingTeacher?.magv || ''}
                    onChange={e => setEditingTeacher({...editingTeacher, magv: e.target.value.toUpperCase()})}
                   />
                 </div>
                 <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase italic mb-1 block">Họ và Tên</label>
                   <input 
                    type="text" 
                    className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500"
                    value={editingTeacher?.tengv || ''}
                    onChange={e => setEditingTeacher({...editingTeacher, tengv: e.target.value})}
                   />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase italic mb-1 block">Môn giảng dạy</label>
                      <input 
                        type="text" 
                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500"
                        value={editingTeacher?.monday || ''}
                        onChange={e => setEditingTeacher({...editingTeacher, monday: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase italic mb-1 block">Quyền hạn</label>
                      <select 
                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500"
                        value={editingTeacher?.role || 'TEACHER'}
                        onChange={e => setEditingTeacher({...editingTeacher, role: e.target.value as any})}
                      >
                        <option value="TEACHER">Giáo viên</option>
                        <option value="ADMIN">Hiệu Phó/Quản trị</option>
                      </select>
                    </div>
                 </div>
                 <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase italic mb-1 block">Mật khẩu</label>
                   <input 
                    type="text" 
                    className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500"
                    value={editingTeacher?.pass || ''}
                    onChange={e => setEditingTeacher({...editingTeacher, pass: e.target.value})}
                   />
                 </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setShowModal(false)} className="py-4 bg-slate-100 text-slate-500 font-black rounded-2xl uppercase italic">Hủy</button>
                <button onClick={handleSave} className="py-4 bg-blue-600 text-white font-black rounded-2xl uppercase italic shadow-lg">Lưu lại</button>
              </div>
           </div>
        </div>
      )}

      <header className="flex justify-between items-center mb-10">
         <div className="flex-1 max-w-md relative">
            <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input 
              type="text" 
              placeholder="Tìm theo tên hoặc mã GV..." 
              className="w-full pl-14 pr-6 py-5 bg-white border-4 border-slate-50 rounded-full shadow-xl text-xs font-black uppercase italic outline-none focus:border-blue-200 transition-all"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
         </div>
         <button 
           onClick={() => { setEditingTeacher({ role: 'TEACHER', monday: 'Vật lý' }); setShowModal(true); }}
           className="px-10 py-5 bg-blue-600 text-white rounded-full font-black uppercase italic shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
         >
           <span>➕</span> Thêm giáo viên mới
         </button>
      </header>

      <div className="bg-white rounded-[3.5rem] border-4 border-slate-50 shadow-2xl overflow-hidden flex-1 flex flex-col">
         <div className="overflow-x-auto">
            <table className="w-full text-left">
               <thead>
                  <tr className="bg-slate-50 border-b-2 border-slate-100">
                     <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase italic tracking-widest">Giáo viên</th>
                     <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase italic tracking-widest text-center">Mã GV</th>
                     <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase italic tracking-widest text-center">Môn dạy</th>
                     <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase italic tracking-widest text-center">Vai trò</th>
                     <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase italic tracking-widest text-right">Thao tác</th>
               </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                  {isLoading ? (
                    <tr><td colSpan={5} className="py-20 text-center font-black text-slate-300 animate-pulse uppercase italic">Đang tải dữ liệu...</td></tr>
                  ) : filtered.length > 0 ? filtered.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                       <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                             <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl shadow-inner ${t.role === 'ADMIN' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                                {t.role === 'ADMIN' ? '👑' : '👨‍🏫'}
                             </div>
                             <div className="font-black text-slate-800 uppercase italic leading-none">{t.tengv}</div>
                          </div>
                       </td>
                       <td className="px-8 py-6 text-center">
                          <span className="bg-slate-100 px-3 py-1 rounded-lg font-black text-[10px] text-slate-500 border border-slate-200">{t.magv}</span>
                       </td>
                       <td className="px-8 py-6 text-center font-bold text-slate-600 italic">{t.monday}</td>
                       <td className="px-8 py-6 text-center">
                          <span className={`px-3 py-1 rounded-full font-black text-[8px] uppercase tracking-widest ${t.role === 'ADMIN' ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                             {t.role === 'ADMIN' ? 'Hiệu Phó' : 'Giáo viên'}
                          </span>
                       </td>
                       <td className="px-8 py-6 text-right space-x-2">
                          <button 
                            onClick={() => { setEditingTeacher(t); setShowModal(true); }}
                            className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl font-black hover:bg-blue-600 hover:text-white transition-all"
                            title="Sửa"
                          >
                            ✏️
                          </button>
                          <button 
                            onClick={() => setDeleteId(t.id)}
                            className="w-10 h-10 bg-red-50 text-red-500 rounded-xl font-black hover:bg-red-500 hover:text-white transition-all"
                            title="Xóa"
                          >
                            🗑️
                          </button>
                       </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5} className="py-20 text-center text-slate-300 italic">Không tìm thấy giáo viên phù hợp</td></tr>
                  )}
               </tbody>
            </table>
         </div>
      </div>
    </div>
  );
};

export default TeacherManagement;
