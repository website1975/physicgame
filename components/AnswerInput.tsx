
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QuestionType, PhysicsProblem, InteractiveMechanic } from '../types';
import LatexRenderer from './LatexRenderer';

interface AnswerInputProps {
  problem: PhysicsProblem;
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}

interface Target { 
  id: string; 
  value: string; 
  x: number; 
  y: number; 
  vx: number; 
  vy: number; 
  isLit?: boolean; 
  isRevealed?: boolean;
}

const AnswerInput: React.FC<AnswerInputProps> = ({ problem, value, onChange, onSubmit, disabled }) => {
  // dsAnswers quản lý 4 trạng thái Đ hoặc S cho 4 ý a,b,c,d
  const [dsAnswers, setDsAnswers] = useState<string[]>(['', '', '', '']);
  const [playerX, setPlayerX] = useState(50);
  const [playerY, setPlayerY] = useState(85);
  const [targets, setTargets] = useState<Target[]>([]);
  const [projectiles, setProjectiles] = useState<{ x: number; y: number; id: number }[]>([]);
  const [waterLevel, setWaterLevel] = useState(0); 
  
  const requestRef = useRef<number>(null);
  const startTimeRef = useRef<number>(Date.now());
  const valueRef = useRef(value);
  const targetsRef = useRef<Target[]>([]);
  const currentOverlappingTargetId = useRef<string | null>(null);

  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { targetsRef.current = targets; }, [targets]);

  const probType = problem.type;
  const isMultipleChoice = probType === QuestionType.MULTIPLE_CHOICE;
  const isTrueFalse = probType === QuestionType.TRUE_FALSE;
  const isShortAnswer = probType === QuestionType.SHORT_ANSWER;
  const activeMechanic = problem.mechanic || InteractiveMechanic.CANNON;

  useEffect(() => {
    if (isTrueFalse) {
      // Khi sang câu mới, xoá sạch lựa chọn cũ
      setDsAnswers(['', '', '', '']);
    }
    setProjectiles([]);
    setWaterLevel(0);
    setPlayerX(50);
    setPlayerY(88);
    startTimeRef.current = Date.now();
  }, [problem.id, isTrueFalse]);

  const handleToggle = (idx: number, choice: 'Đ' | 'S') => {
    if (disabled) return;
    const newAns = [...dsAnswers];
    newAns[idx] = choice;
    setDsAnswers(newAns);
    // Gửi chuỗi kết quả 4 ký tự (ví dụ: "ĐSĐS") về App.tsx
    onChange(newAns.join(''));
  };

  const handleHit = useCallback((targetId: string, targetValue: string) => {
    onChange(valueRef.current + targetValue);
    setTargets(prev => prev.map(t => t.id === targetId ? { ...t, isLit: true } : t));
    setTimeout(() => {
      setTargets(prev => prev.map(t => t.id === targetId ? { ...t, isLit: false } : t));
    }, 150);
  }, [onChange]);

  const update = useCallback(() => {
    if (disabled) { requestRef.current = requestAnimationFrame(update); return; }
    
    if (activeMechanic === InteractiveMechanic.RISING_WATER) {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const level = Math.min(100, (elapsed / (problem.timeLimit || 40)) * 100);
      setWaterLevel(level);
    }

    const HIT_RADIUS = 5.5; 

    if (activeMechanic === InteractiveMechanic.MARIO) {
      const overlapping = targetsRef.current.find(t => 
        Math.abs(playerX - t.x) < HIT_RADIUS && Math.abs(playerY - t.y) < HIT_RADIUS
      );
      if (overlapping) {
        if (currentOverlappingTargetId.current !== overlapping.id) {
          handleHit(overlapping.id, overlapping.value);
          currentOverlappingTargetId.current = overlapping.id;
        }
      } else {
        currentOverlappingTargetId.current = null;
      }
    }

    setProjectiles(prev => {
      if (prev.length === 0) return prev;
      const next = prev.map(p => ({ ...p, y: p.y - 14 })).filter(p => p.y > -10);
      let hitMade = false;
      const filtered = next.filter(proj => {
        const possibleHits = targetsRef.current.filter(t => 
          !t.isLit && Math.abs(proj.x - t.x) < HIT_RADIUS && Math.abs(proj.y - t.y) < HIT_RADIUS
        );
        if (possibleHits.length > 0) {
          handleHit(possibleHits[0].id, possibleHits[0].value);
          hitMade = true;
          return false;
        }
        return true;
      });
      return hitMade ? filtered : next;
    });

    requestRef.current = requestAnimationFrame(update);
  }, [disabled, activeMechanic, problem.timeLimit, handleHit, playerX, playerY]);

  useEffect(() => {
    if (isShortAnswer) { requestRef.current = requestAnimationFrame(update); }
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [isShortAnswer, update]);

  if (isMultipleChoice) {
    const opts = problem.options || [];
    return (
      <div className="flex flex-col gap-3 overflow-y-auto no-scrollbar max-h-full pb-4">
        {opts.map((opt, idx) => {
          const label = String.fromCharCode(65 + idx);
          const isSelected = value === label;
          return (
            <button 
              key={idx} disabled={disabled} onClick={() => onChange(label)} 
              className={`p-4 md:p-6 rounded-[2rem] border-4 text-left transition-all flex items-center gap-5 relative overflow-hidden group shadow-sm ${isSelected ? 'border-blue-600 bg-white shadow-xl scale-[1.01]' : 'border-slate-100 bg-slate-50 text-slate-700 hover:border-blue-200'}`}
            >
              <span className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl transition-colors ${isSelected ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white'}`}>
                {label}
              </span>
              <div className="flex-1 font-bold text-sm md:text-lg">
                <LatexRenderer content={opt} />
              </div>
              {isSelected && <div className="bg-emerald-500 text-white w-10 h-10 rounded-full flex items-center justify-center font-black">✓</div>}
            </button>
          );
        })}
      </div>
    );
  }

  if (isTrueFalse) {
    return (
      <div className="space-y-3 flex flex-col h-full">
         <div className="bg-white p-4 rounded-[2rem] border-2 border-slate-50 space-y-3 flex-1 overflow-y-auto no-scrollbar shadow-inner">
            {['a', 'b', 'c', 'd'].map((l, i) => (
              <div key={l} className="flex gap-4 items-center bg-slate-50 p-4 rounded-2xl border-2 border-slate-100">
                <span className="font-black text-emerald-600 w-8 italic text-lg">{l})</span>
                <div className="flex-1 font-bold text-slate-600 text-sm">
                   <LatexRenderer content={problem.options?.[i] || '...'} />
                </div>
                <div className="flex gap-1 bg-white p-1 rounded-xl shadow-sm border border-slate-100">
                   {(['Đ', 'S'] as const).map(v => (
                     <button key={v} onClick={() => handleToggle(i, v)} className={`w-10 h-10 rounded-lg font-black transition-all text-sm ${dsAnswers[i] === v ? (v === 'Đ' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white') : 'text-slate-200 hover:bg-slate-50'}`}>{v}</button>
                   ))}
                </div>
              </div>
            ))}
         </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 flex flex-col h-full overflow-hidden">
      <div className="flex justify-between items-center bg-slate-900 p-4 rounded-[1.8rem] border-4 border-slate-800 shadow-xl shrink-0">
         <span className="text-yellow-400 text-3xl font-black tracking-widest drop-shadow-md">{value || '___'}</span>
         <button onClick={() => onChange('')} className="text-red-500 font-black text-xs uppercase bg-white/10 px-4 py-2 rounded-xl">Xóa</button>
      </div>

      <div className="relative w-full flex-1 rounded-[3rem] border-8 overflow-hidden bg-slate-950 border-slate-900 shadow-inner">
        <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_50%_120%,#3b82f6,transparent_75%)]"></div>
        {targets.map(t => (
          <div key={t.id} 
               className="absolute flex items-center justify-center transition-all duration-300" 
               style={{ left: `${t.x}%`, top: `${t.y}%`, transform: 'translate(-50%, -50%)' }}>
            <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center text-xl md:text-3xl font-black shadow-lg border-2 transition-all duration-150 ${t.isLit ? 'bg-white border-white scale-110 shadow-[0_0_40px_#fff] text-blue-600 z-50' : 'bg-yellow-400 border-white/20 text-slate-900'}`}>
              {t.value}
            </div>
          </div>
        ))}
        {projectiles.map(p => (
          <div key={p.id} className="absolute w-2 h-8 bg-gradient-to-t from-orange-600 to-yellow-300 rounded-full shadow-[0_0_15px_#fbbf24] z-20" style={{ left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -50%)' }} />
        ))}
        <div className="absolute transition-all duration-75 z-30" style={{ left: `${playerX}%`, top: `${playerY}%`, transform: 'translate(-50%, -50%)' }}>
          <div className="text-4xl md:text-5xl animate-bounce">🛸</div>
        </div>
        {activeMechanic === InteractiveMechanic.RISING_WATER && (
          <div className="absolute bottom-0 left-0 right-0 bg-blue-500/30 backdrop-blur-[2px] border-t-2 border-blue-300/40 transition-all duration-300 z-10" style={{ height: `${waterLevel}%` }}></div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 shrink-0">
          <button onPointerDown={() => setPlayerX(p => Math.max(5, p-8))} className="bg-slate-200 py-4 rounded-2xl font-black text-xl shadow">←</button>
          <button onPointerDown={() => setPlayerY(p => Math.max(5, p-8))} className="bg-slate-200 py-4 rounded-2xl font-black text-xl shadow">↑</button>
          <button onPointerDown={() => setPlayerX(p => Math.min(95, p+8))} className="bg-slate-200 py-4 rounded-2xl font-black text-xl shadow">→</button>
      </div>
      <button onPointerDown={() => setProjectiles(prev => [...prev, { x: playerX, y: playerY - 5, id: Date.now() }])} className="w-full py-5 bg-red-600 text-white rounded-[1.8rem] font-black uppercase italic shadow-xl active:scale-95 transition-all text-xl border-b-8 border-red-800 shrink-0">BẮN 🚀</button>
    </div>
  );
};

export default React.memo(AnswerInput);
