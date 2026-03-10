
import React, { useState, useEffect } from 'react';
import { fetchFormulaResources, saveFormulaResource, updateFormulaResource, deleteFormulaResource } from '@/services/supabaseService';
import { Plus, Trash2, Edit2, Save, X, FileText, ExternalLink, BookOpen, GripVertical } from 'lucide-react';
import { motion } from 'framer-motion';

const FormulaManager: React.FC = () => {
  const [resources, setResources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    grade: 10,
    resource_type: 'web_link',
    url: '',
    category: '',
    description: '',
    sort_order: 0
  });

  const loadData = async () => {
    setLoading(true);
    const data = await fetchFormulaResources();
    setResources(data);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async () => {
    try {
      if (editingId) {
        await updateFormulaResource(editingId, formData);
      } else {
        await saveFormulaResource(formData);
      }
      setEditingId(null);
      setIsAdding(false);
      setFormData({
        title: '',
        grade: 10,
        resource_type: 'web_link',
        url: '',
        category: '',
        description: '',
        sort_order: 0
      });
      loadData();
    } catch (error: any) {
      alert("Lỗi: " + error.message);
    }
  };

  const handleEdit = (res: any) => {
    setEditingId(res.id);
    setFormData({
      title: res.title,
      grade: res.grade,
      resource_type: res.resource_type,
      url: res.url,
      category: res.category || '',
      description: res.description || '',
      sort_order: res.sort_order || 0
    });
    setIsAdding(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa tài liệu này?")) {
      await deleteFormulaResource(id);
      loadData();
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'pdf': return <FileText className="w-5 h-5 text-red-500" />;
      case 'web_link': return <ExternalLink className="w-5 h-5 text-blue-500" />;
      case 'html_page': return <BookOpen className="w-5 h-5 text-emerald-500" />;
      default: return <BookOpen className="w-5 h-5 text-slate-400" />;
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-black uppercase italic tracking-tighter">Quản lý Hệ thống Công thức</h2>
          <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Cập nhật tài liệu học tập cho học sinh</p>
        </div>
        <button 
          onClick={() => {
            setIsAdding(true);
            setEditingId(null);
            setFormData({ title: '', grade: 10, resource_type: 'web_link', url: '', category: '', description: '', sort_order: resources.length });
          }}
          className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black uppercase italic flex items-center gap-2 hover:scale-105 transition-all shadow-lg"
        >
          <Plus className="w-5 h-5" /> Thêm tài liệu
        </button>
      </div>

      {isAdding && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border-4 border-slate-900 rounded-[2rem] p-8 mb-8 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)]"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Tiêu đề tài liệu</label>
              <input 
                type="text" 
                placeholder="VD: Tổng hợp công thức Chương 1"
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500"
                value={formData.title}
                onChange={e => setFormData({...formData, title: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Khối lớp</label>
              <select 
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500"
                value={formData.grade}
                onChange={e => setFormData({...formData, grade: parseInt(e.target.value)})}
              >
                <option value={10}>Khối 10</option>
                <option value={11}>Khối 11</option>
                <option value={12}>Khối 12</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Loại tài liệu</label>
              <select 
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500"
                value={formData.resource_type}
                onChange={e => setFormData({...formData, resource_type: e.target.value})}
              >
                <option value="web_link">Liên kết Web (URL)</option>
                <option value="pdf">Tài liệu PDF</option>
                <option value="html_page">Trang nội bộ (HTML)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Chuyên mục</label>
              <input 
                type="text" 
                placeholder="VD: Cơ học, Điện học..."
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500"
                value={formData.category}
                onChange={e => setFormData({...formData, category: e.target.value})}
              />
            </div>
            <div className="md:col-span-2 space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Đường dẫn (URL)</label>
              <input 
                type="text" 
                placeholder="https://..."
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500"
                value={formData.url}
                onChange={e => setFormData({...formData, url: e.target.value})}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setIsAdding(false)} className="px-6 py-3 bg-slate-100 text-slate-400 rounded-xl font-black uppercase italic">Hủy</button>
            <button onClick={handleSave} className="px-8 py-3 bg-blue-600 text-white rounded-xl font-black uppercase italic shadow-lg flex items-center gap-2">
              <Save className="w-5 h-5" /> {editingId ? 'Cập nhật' : 'Lưu tài liệu'}
            </button>
          </div>
        </motion.div>
      )}

      <div className="bg-white border-4 border-slate-900 rounded-[3rem] overflow-hidden shadow-[12px_12px_0px_0px_rgba(15,23,42,1)]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b-4 border-slate-900">
              <th className="p-6 font-black uppercase italic text-xs text-slate-400">Khối</th>
              <th className="p-6 font-black uppercase italic text-xs text-slate-400">Tài liệu</th>
              <th className="p-6 font-black uppercase italic text-xs text-slate-400">Loại</th>
              <th className="p-6 font-black uppercase italic text-xs text-slate-400 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="p-20 text-center font-black uppercase italic opacity-20">Đang tải dữ liệu...</td>
              </tr>
            ) : resources.length > 0 ? (
              resources.map((res) => (
                <tr key={res.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-6">
                    <span className="bg-blue-600 text-white px-3 py-1 rounded-lg font-black italic text-xs">K{res.grade}</span>
                  </td>
                  <td className="p-6">
                    <div className="font-black uppercase italic text-slate-800">{res.title}</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase">{res.category || 'Chưa phân loại'}</div>
                  </td>
                  <td className="p-6">
                    <div className="flex items-center gap-2">
                      {getIcon(res.resource_type)}
                      <span className="text-[10px] font-black uppercase text-slate-400">{res.resource_type}</span>
                    </div>
                  </td>
                  <td className="p-6 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => handleEdit(res)} className="p-3 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-600 hover:text-white transition-all">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(res.id)} className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="p-20 text-center font-black uppercase italic opacity-20">Chưa có tài liệu nào</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FormulaManager;
