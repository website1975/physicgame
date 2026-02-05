
import React from 'react';
import { ALL_QUANTITIES, ALL_FORMULAS } from '../constants';
import LatexRenderer from './LatexRenderer';

interface KeywordSelectorProps {
  selectedQuantities: string[];
  selectedFormulas: string[];
  onToggleQuantity: (symbol: string) => void;
  onToggleFormula: (id: string) => void;
}

const KeywordSelector: React.FC<KeywordSelectorProps> = ({
  selectedQuantities,
  selectedFormulas,
  onToggleQuantity,
  onToggleFormula
}) => {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-black mb-4 text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <span className="w-6 h-6 bg-slate-100 rounded flex items-center justify-center text-slate-600 text-[10px]">1</span>
          Đại lượng cần tìm
        </h3>
        <div className="flex flex-wrap gap-2">
          {ALL_QUANTITIES.map((q) => (
            <button
              key={q.symbol}
              onClick={() => onToggleQuantity(q.symbol)}
              className={`px-4 py-2 rounded-xl border-2 transition-all text-sm font-bold flex items-center gap-2 ${
                selectedQuantities.includes(q.symbol)
                  ? 'bg-blue-600 border-blue-600 text-white shadow-lg -translate-y-1'
                  : 'bg-white border-slate-100 text-slate-600 hover:border-blue-200'
              }`}
            >
              <span className={selectedQuantities.includes(q.symbol) ? 'text-white' : 'text-blue-500'}>
                <LatexRenderer content={`$${q.symbol}$`} />
              </span>
              <span className="text-[10px] opacity-75 font-medium">{q.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-black mb-4 text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <span className="w-6 h-6 bg-slate-100 rounded flex items-center justify-center text-slate-600 text-[10px]">2</span>
          Công thức áp dụng
        </h3>
        <div className="grid grid-cols-1 gap-3">
          {ALL_FORMULAS.map((f) => (
            <button
              key={f.id}
              onClick={() => onToggleFormula(f.id)}
              className={`p-4 rounded-2xl border-2 text-left transition-all relative overflow-hidden group ${
                selectedFormulas.includes(f.id)
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl -translate-y-1'
                  : 'bg-white border-slate-100 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/30'
              }`}
            >
              <div className={`mb-1 ${selectedFormulas.includes(f.id) ? 'text-white' : 'text-indigo-600'}`}>
                <LatexRenderer content={`$${f.latex}$`} className="text-xl font-bold" />
              </div>
              <div className="text-xs font-bold opacity-60 uppercase tracking-tight">{f.name}</div>
              {selectedFormulas.includes(f.id) && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20">
                   <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default KeywordSelector;
