
import React, { useEffect, useState } from 'react';
import { fetchFormulaResources } from '@/services/supabaseService';
import { FileText, ExternalLink, BookOpen, ArrowLeft, Search } from 'lucide-react';
import { motion } from 'framer-motion';

interface FormulaLibraryProps {
  onBack: () => void;
  initialGrade?: string;
}

const FormulaLibrary: React.FC<FormulaLibraryProps> = ({ onBack, initialGrade }) => {
  const [resources, setResources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGrade, setSelectedGrade] = useState<string>(initialGrade || '10');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const loadResources = async () => {
      setLoading(true);
      const data = await fetchFormulaResources(parseInt(selectedGrade));
      setResources(data);
      setLoading(false);
    };
    loadResources();
  }, [selectedGrade]);

  const filteredResources = resources.filter(r => 
    r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.category && r.category.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getIcon = (type: string) => {
    switch (type) {
      case 'pdf': return <FileText className="w-5 h-5 text-red-500" />;
      case 'web_link': return <ExternalLink className="w-5 h-5 text-blue-500" />;
      case 'html_page': return <BookOpen className="w-5 h-5 text-emerald-500" />;
      default: return <BookOpen className="w-5 h-5 text-slate-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans p-4 md:p-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-sm font-black uppercase italic mb-4 hover:translate-x-[-4px] transition-transform"
          >
            <ArrowLeft className="w-4 h-4" /> Quay lại Arena
          </button>
          <h1 className="text-6xl font-black uppercase italic tracking-tighter leading-none">
            Thư viện <br /> <span className="text-blue-600">Công thức</span>
          </h1>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex gap-2 bg-white/50 p-1 rounded-2xl border border-[#141414]/10">
            {['10', '11', '12'].map(grade => (
              <button
                key={grade}
                onClick={() => setSelectedGrade(grade)}
                className={`px-6 py-2 rounded-xl font-black italic transition-all ${
                  selectedGrade === grade 
                    ? 'bg-[#141414] text-white shadow-lg' 
                    : 'hover:bg-white/80'
                }`}
              >
                K{grade}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-30" />
            <input 
              type="text" 
              placeholder="Tìm kiếm tài liệu..."
              className="bg-white border-2 border-[#141414] rounded-2xl py-3 pl-12 pr-6 w-full md:w-80 font-bold outline-none focus:shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] transition-all"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="max-w-6xl mx-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-12 h-12 border-4 border-[#141414] border-t-transparent rounded-full animate-spin"></div>
            <p className="font-black uppercase italic text-sm opacity-40">Đang tải dữ liệu...</p>
          </div>
        ) : filteredResources.length > 0 ? (
          <div className="bg-white border-4 border-[#141414] rounded-[3rem] overflow-hidden shadow-[12px_12px_0px_0px_rgba(20,20,20,1)]">
            {/* Table Header */}
            <div className="grid grid-cols-[40px_1.5fr_1fr_1fr] p-6 border-b-2 border-[#141414] bg-slate-50">
              <div className="font-serif italic text-[11px] uppercase opacity-50">#</div>
              <div className="font-serif italic text-[11px] uppercase opacity-50">Tên tài liệu</div>
              <div className="font-serif italic text-[11px] uppercase opacity-50">Phân loại</div>
              <div className="font-serif italic text-[11px] uppercase opacity-50">Hành động</div>
            </div>

            {/* Rows */}
            <div className="divide-y-2 divide-[#141414]/10">
              {filteredResources.map((res, idx) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  key={res.id}
                  className="grid grid-cols-[40px_1.5fr_1fr_1fr] p-6 hover:bg-[#141414] hover:text-white transition-colors cursor-pointer group"
                  onClick={() => window.open(res.url, '_blank')}
                >
                  <div className="font-mono text-sm opacity-40 group-hover:opacity-100">{String(idx + 1).padStart(2, '0')}</div>
                  <div className="flex items-center gap-3">
                    {getIcon(res.resource_type)}
                    <span className="font-black uppercase italic text-sm">{res.title}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="px-3 py-1 bg-slate-100 text-[#141414] text-[10px] font-black uppercase rounded-full border border-[#141414]/10 group-hover:bg-white/20 group-hover:text-white group-hover:border-white/20">
                      {res.category || 'Chung'}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-[10px] font-black uppercase italic underline underline-offset-4 opacity-40 group-hover:opacity-100">
                      Xem ngay
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-20 border-4 border-dashed border-[#141414]/20 rounded-[4rem]">
            <p className="text-2xl font-black uppercase italic opacity-20">Không tìm thấy tài liệu nào</p>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="max-w-6xl mx-auto mt-12 pt-8 border-t border-[#141414]/10 flex justify-between items-center">
        <div className="font-mono text-[10px] uppercase opacity-40">
          PhysiQuest Formula System v1.0
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500"></div>
            <span className="font-mono text-[10px] uppercase opacity-40">PDF</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <span className="font-mono text-[10px] uppercase opacity-40">Web</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span className="font-mono text-[10px] uppercase opacity-40">HTML</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FormulaLibrary;
