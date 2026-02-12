
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
    <div className="space-y-10">
      <div>
        <h3 className="text-base font-black mb-6 text-slate-500 uppercase tracking-widest flex items-center gap-3 italic">
          <span className="w-8 h-8 bg-slate-900 rounded-xl flex items-center justify-center text-white text-xs shadow-lg">1</span>
          Đại lượng cần tìm
        </h3>
        <div className="flex flex-wrap gap-3">
          {ALL_QUANTITIES.map((q) => (
            <button
              key={q.symbol}
              onClick={() => onToggleQuantity(q.symbol)}
              className={`px-6 py-3 rounded-2xl border-4 transition-all text-base font-black flex items-center gap-3 ${
                selectedQuantities.includes(q.symbol)
                  ? 'bg-blue-600 border-blue-600 text-white shadow-xl -translate-y-1'
                  : 'bg-white border-slate-100 text-slate-600 hover:border-blue-300'
              }`}
            >
              <span className={selectedQuantities.includes(q.symbol) ? 'text-white' : 'text-blue-600'}>
                <LatexRenderer content={`$${q.symbol}$`} />
              </span>
              <span className="text-xs opacity-80 uppercase tracking-tighter">{q.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-base font-black mb-6 text-slate-500 uppercase tracking-widest flex items-center gap-3 italic">
          <span className="w-8 h-8 bg-slate-900 rounded-xl flex items-center justify-center text-white text-xs shadow-lg">2</span>
          Công thức áp dụng
        </h3>
        <div className="grid grid-cols-1 gap-4">
          {ALL_FORMULAS.map((f) => (
            <button
              key={f.id}
              onClick={() => onToggleFormula(f.id)}
              className={`p-6 rounded-[2.5rem] border-4 text-left transition-all relative overflow-hidden group ${
                selectedFormulas.includes(f.id)
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xl -translate-y-1'
                  : 'bg-white border-slate-100 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50/50'
              }`}
            >
              <div className={`mb-2 ${selectedFormulas.includes(f.id) ? 'text-white' : 'text-indigo-600'}`}>
                <LatexRenderer content={`$${f.latex}$`} className="text-3xl font-black" />
              </div>
              <div className="text-sm font-black opacity-60 uppercase tracking-widest italic">{f.name}</div>
              {selectedFormulas.includes(f.id) && (
                <div className="absolute right-8 top-1/2 -translate-y-1/2 text-white/30">
                   <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
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
