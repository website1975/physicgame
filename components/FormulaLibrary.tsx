
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
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans p-4 md:p-6">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#141414]/10 pb-4">
        <div>
          <button 
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-black uppercase italic mb-2 hover:translate-x-[-2px] transition-transform"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Quay lại Arena
          </button>
          <h1 className="text-3xl sm:text-4xl font-black uppercase italic tracking-tighter leading-none">
            Thư viện <span className="text-blue-600">Công thức</span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1.5 bg-white/60 p-1 rounded-xl border border-[#141414]/10 shadow-2xs">
            {['10', '11', '12'].map(grade => (
              <button
                key={grade}
                onClick={() => setSelectedGrade(grade)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black italic transition-all ${
                  selectedGrade === grade 
                    ? 'bg-[#141414] text-white shadow-xs' 
                    : 'hover:bg-white/80 text-slate-700'
                }`}
              >
                K{grade}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-30" />
            <input 
              type="text" 
              placeholder="Tìm kiếm tài liệu..."
              className="bg-white border border-[#141414]/30 rounded-xl py-1.5 pl-9 pr-4 w-full md:w-64 text-xs font-bold outline-none focus:border-[#141414] focus:shadow-xs transition-all"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="max-w-6xl mx-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-8 h-8 border-3 border-[#141414] border-t-transparent rounded-full animate-spin"></div>
            <p className="font-black uppercase italic text-xs opacity-40">Đang tải dữ liệu...</p>
          </div>
        ) : filteredResources.length > 0 ? (
          <div className="bg-white border-2 border-[#141414] rounded-2xl overflow-hidden shadow-[6px_6px_0px_0px_rgba(20,20,20,1)]">
            {/* Table Header */}
            <div className="grid grid-cols-[36px_1.5fr_1fr_100px] px-4 py-2.5 border-b border-[#141414]/20 bg-slate-50">
              <div className="font-mono italic text-[10px] uppercase opacity-50">#</div>
              <div className="font-sans font-bold text-[10px] uppercase opacity-60">Tên tài liệu / Công thức</div>
              <div className="font-sans font-bold text-[10px] uppercase opacity-60">Phân loại</div>
              <div className="font-sans font-bold text-[10px] uppercase opacity-60 text-right">Xem</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-[#141414]/10">
              {filteredResources.map((res, idx) => (
                <motion.div 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  key={res.id}
                  className="grid grid-cols-[36px_1.5fr_1fr_100px] px-4 py-3 hover:bg-[#141414] hover:text-white transition-colors cursor-pointer group items-center"
                  onClick={() => window.open(res.url, '_blank')}
                >
                  <div className="font-mono text-xs opacity-40 group-hover:opacity-100">{String(idx + 1).padStart(2, '0')}</div>
                  <div className="flex items-center gap-2.5">
                    {getIcon(res.resource_type)}
                    <span className="font-black uppercase italic text-xs line-clamp-1">{res.title}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="px-2 py-0.5 bg-slate-100 text-[#141414] text-[8px] font-black uppercase rounded-md border border-[#141414]/10 group-hover:bg-white/20 group-hover:text-white group-hover:border-white/20">
                      {res.category || 'Chung'}
                    </span>
                  </div>
                  <div className="flex items-center justify-end">
                    <span className="text-[9px] font-black uppercase italic underline underline-offset-2 opacity-40 group-hover:opacity-100">
                      Xem ngay ↗
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-16 border-2 border-dashed border-[#141414]/20 rounded-2xl">
            <p className="text-lg font-black uppercase italic opacity-30">Không tìm thấy tài liệu nào</p>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="max-w-6xl mx-auto mt-6 pt-4 border-t border-[#141414]/10 flex justify-between items-center">
        <div className="font-mono text-[9px] uppercase opacity-40">
          PhysiQuest Formula System • K{selectedGrade}
        </div>
        <div className="flex gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
            <span className="font-mono text-[9px] uppercase opacity-40">PDF</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
            <span className="font-mono text-[9px] uppercase opacity-40">Web</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
            <span className="font-mono text-[9px] uppercase opacity-40">HTML</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FormulaLibrary;
