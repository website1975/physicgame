
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  isRevealed: boolean;
  revealTimer: number; 
  isLit: boolean;
  isColliding: boolean; 
}

interface EngineState {
  playerX: number;
  playerY: number;
  projectiles: { x: number; y: number; id: number }[];
  targets: Target[];
  waterLevel: number;
}

const AnswerInput: React.FC<AnswerInputProps> = ({ problem, value, onChange, onSubmit, disabled }) => {
  const [dsAnswers, setDsAnswers] = useState<string[]>(['', '', '', '']);
  const [visual, setVisual] = useState<EngineState | null>(null);

  const engineRef = useRef<EngineState>({
    playerX: 50,
    playerY: 80,
    projectiles: [],
    targets: [],
    waterLevel: 0
  });

  const valueRef = useRef(value);
  const activeMechanic = problem.mechanic || InteractiveMechanic.CANNON;
  const isShortAnswer = problem.type === QuestionType.SHORT_ANSWER;
  
  const REVEAL_DURATION = 150; 

  useEffect(() => { valueRef.current = value; }, [value]);

  useEffect(() => {
    if (isShortAnswer) {
      const chars = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '.', '-'];
      const isHiddenMode = activeMechanic === InteractiveMechanic.HIDDEN_TILES;
      
      const initialTargets = chars.map((char, i) => {
        const row = Math.floor(i / 3);
        const col = i % 3;
        const xOffset = row % 2 === 0 ? 20 : 30;
        return {
          id: `t-${i}`,
          value: char,
          x: xOffset + col * 25,
          y: 12 + row * 18,
          isRevealed: !isHiddenMode,
          revealTimer: 0,
          isLit: false,
          isColliding: false 
        };
      });

      engineRef.current = {
        playerX: 50,
        playerY: 85,
        projectiles: [],
        targets: initialTargets,
        waterLevel: 0
      };
      setVisual({...engineRef.current});
    }
  }, [problem.id, isShortAnswer, activeMechanic]);

  const handleHitLogic = useCallback((target: Target) => {
    if (activeMechanic === InteractiveMechanic.HIDDEN_TILES) {
      if (!target.isRevealed) {
        target.isRevealed = true;
        target.revealTimer = REVEAL_DURATION;
      } else {
        onChange(valueRef.current + target.value);
        target.isLit = true;
        setTimeout(() => { target.isLit = false; }, 300);
      }
    } else {
      onChange(valueRef.current + target.value);
      target.isLit = true;
      setTimeout(() => { target.isLit = false; }, 300);
    }
  }, [activeMechanic, onChange]);

  useEffect(() => {
    if (!isShortAnswer || disabled) return;

    const tick = () => {
      const eng = engineRef.current;
      const HIT_BOX_PROJECTILE = 6; 
      const HIT_BOX_TOUCH = 8; 

      eng.targets.forEach(t => {
        if (activeMechanic === InteractiveMechanic.HIDDEN_TILES && t.revealTimer > 0) {
          t.revealTimer--;
          if (t.revealTimer === 0) t.isRevealed = false;
        }

        if (activeMechanic === InteractiveMechanic.MARIO) {
          const isInside = Math.abs(eng.playerX - t.x) < HIT_BOX_TOUCH && Math.abs(eng.playerY - t.y) < HIT_BOX_TOUCH;
          if (isInside) {
            if (!t.isColliding) {
              handleHitLogic(t);
              t.isColliding = true; 
            }
          } else {
            t.isColliding = false; 
          }
        }
      });

      const canShoot = [InteractiveMechanic.CANNON, InteractiveMechanic.RISING_WATER, InteractiveMechanic.SPACE_DASH].includes(activeMechanic);
      
      if (canShoot) {
        eng.projectiles = eng.projectiles
          .map(p => ({ ...p, y: p.y - 6 }))
          .filter(p => p.y > -5);

        eng.projectiles = eng.projectiles.filter(p => {
          const hit = eng.targets.find(t => Math.abs(p.x - t.x) < HIT_BOX_PROJECTILE && Math.abs(p.y - t.y) < HIT_BOX_PROJECTILE);
          if (hit) {
            handleHitLogic(hit);
            return false; 
          }
          return true;
        });
      }

      if (activeMechanic === InteractiveMechanic.RISING_WATER) {
        eng.waterLevel = Math.min(100, eng.waterLevel + 0.1);
      }

      setVisual({
        playerX: eng.playerX,
        playerY: eng.playerY,
        projectiles: [...eng.projectiles],
        targets: [...eng.targets],
        waterLevel: eng.waterLevel
      });
    };

    const interval = setInterval(tick, 33);
    return () => clearInterval(interval);
  }, [isShortAnswer, disabled, activeMechanic, handleHitLogic]);

  useEffect(() => {
    if (!isShortAnswer || disabled) return;
    const handleKey = (e: KeyboardEvent) => {
      const eng = engineRef.current;
      const speed = 7;
      if (e.key === 'ArrowLeft') eng.playerX = Math.max(5, eng.playerX - speed);
      if (e.key === 'ArrowRight') eng.playerX = Math.min(95, eng.playerX + speed);
      if (e.key === 'ArrowUp') eng.playerY = Math.max(8, eng.playerY - speed);
      if (e.key === 'ArrowDown') eng.playerY = Math.min(92, eng.playerY + speed);
      
      const canShoot = [InteractiveMechanic.CANNON, InteractiveMechanic.RISING_WATER, InteractiveMechanic.SPACE_DASH].includes(activeMechanic);
      if ((e.key === ' ' || e.key === 'Enter') && canShoot) {
        e.preventDefault();
        eng.projectiles.push({ x: eng.playerX, y: eng.playerY - 6, id: Date.now() });
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isShortAnswer, disabled, activeMechanic]);

  const handleTileClick = (target: Target) => {
    if (activeMechanic === InteractiveMechanic.HIDDEN_TILES) {
       handleHitLogic(target);
    }
  };

  if (problem.type === QuestionType.MULTIPLE_CHOICE) {
    return (
      <div className="flex flex-col gap-3 py-2 text-left w-full h-auto">
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Chọn đáp án đúng:</div>
        {(problem.options || []).map((opt, i) => {
          const label = String.fromCharCode(65 + i);
          const isSelected = value === label;
          return (
            <button 
              key={i} 
              disabled={disabled} 
              onClick={() => onChange(label)} 
              className={`group w-full p-4 rounded-xl border-2 text-left transition-all flex items-center gap-4 relative
                ${isSelected 
                  ? 'border-blue-600 bg-blue-50 shadow-md translate-x-1' 
                  : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-slate-50'}`}
            >
              <span className={`w-10 h-10 rounded-lg flex items-center justify-center font-black text-xl transition-all shrink-0
                ${isSelected ? 'bg-blue-600 text-white shadow-inner' : 'bg-slate-100 text-slate-500'}`}>
                {label}
              </span>
              <div className="flex-1 font-bold text-base md:text-lg leading-snug py-1">
                <LatexRenderer content={opt} />
              </div>
              {isSelected && (
                <div className="bg-emerald-500 text-white w-6 h-6 rounded-full flex items-center justify-center font-black animate-in zoom-in shrink-0">
                  ✓
                </div>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  if (problem.type === QuestionType.TRUE_FALSE) {
    return (
      <div className="space-y-3 py-2 text-left w-full h-auto">
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Xác định tính Đúng/Sai:</div>
        {['a', 'b', 'c', 'd'].map((l, i) => (
          <div key={l} className="flex gap-3 items-center bg-white p-4 rounded-xl border-2 border-slate-100 shadow-sm">
            <span className="font-black text-blue-600 w-6 italic text-base uppercase shrink-0">{l})</span>
            <div className="flex-1 font-bold text-slate-600 text-sm md:text-base text-left"><LatexRenderer content={problem.options?.[i] || '...'} /></div>
            <div className="flex gap-1.5 bg-slate-50 p-1 rounded-lg border border-slate-200 shrink-0">
              {(['Đ', 'S'] as const).map(v => (
                <button 
                  key={v} 
                  onClick={() => handleToggleDS(i, v)} 
                  disabled={disabled}
                  className={`w-9 h-9 rounded-md font-black transition-all text-xs border
                    ${dsAnswers[i] === v 
                      ? (v === 'Đ' ? 'bg-emerald-500 text-white border-emerald-400 shadow-sm' : 'bg-red-500 text-white border-red-400 shadow-sm') 
                      : 'bg-white text-slate-300 border-slate-100 hover:text-slate-400'}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!visual) return null;

  const isNấmMode = activeMechanic === InteractiveMechanic.MARIO;
  const isHiddenMode = activeMechanic === InteractiveMechanic.HIDDEN_TILES;
  const isShootMode = [InteractiveMechanic.CANNON, InteractiveMechanic.RISING_WATER, InteractiveMechanic.SPACE_DASH].includes(activeMechanic);

  return (
    <div className="space-y-4 flex flex-col h-full overflow-hidden text-left">
      <div className="flex justify-between items-center bg-slate-900 px-6 py-4 rounded-[2.2rem] border-4 border-slate-800 shadow-xl shrink-0">
         <div className="flex items-center gap-5">
            <span className="text-slate-500 font-black text-[10px] uppercase tracking-widest italic">KẾT QUẢ:</span>
            <span className="text-yellow-400 text-3xl font-black tracking-widest drop-shadow-lg">{value || '...'}</span>
         </div>
         <button onClick={() => onChange('')} disabled={disabled} className="bg-red-500/10 text-red-500 px-4 py-2 rounded-xl font-black text-[10px] uppercase border border-red-500/20 hover:bg-red-500 hover:text-white transition-all italic">Xoá</button>
      </div>

      <div className="relative w-full flex-1 min-h-[400px] rounded-[3.5rem] border-[10px] overflow-hidden bg-slate-950 border-slate-900 shadow-inner">
        {visual.targets.map(t => (
          <div 
            key={t.id} 
            onClick={() => !disabled && handleTileClick(t)}
            className={`absolute w-12 h-12 md:w-16 md:h-16 rounded-2xl flex items-center justify-center text-xl md:text-3xl font-black shadow-lg border-2 transition-all duration-300 
            ${t.isLit ? 'bg-yellow-400 border-white scale-125 text-slate-900 z-50 ring-4 ring-yellow-400/30' : 
              (t.isRevealed ? 'bg-blue-600 border-white text-white' : 'bg-blue-900/40 border-blue-500/20 text-blue-500/30')}
            ${isNấmMode && t.isColliding ? 'bg-emerald-500 ring-4 ring-emerald-400' : ''}
            ${isHiddenMode ? 'cursor-pointer hover:scale-110 active:scale-95' : 'cursor-default'}`} 
            style={{ left: `${t.x}%`, top: `${t.y}%`, transform: 'translate(-50%, -50%)' }}>
            {t.isRevealed ? t.value : '?'}
          </div>
        ))}

        {isShootMode && visual.projectiles.map(p => (
          <div key={p.id} className="absolute w-2 h-7 bg-gradient-to-t from-orange-600 to-yellow-300 rounded-full shadow-[0_0_15px_#fbbf24] z-20" style={{ left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -50%)' }} />
        ))}

        {!isHiddenMode && (
          <div className="absolute transition-all duration-100 z-30" style={{ left: `${visual.playerX}%`, top: `${visual.playerY}%`, transform: 'translate(-50%, -50%)' }}>
            <div className={`text-5xl md:text-7xl ${isNấmMode ? 'animate-bounce' : ''}`}>
              {activeMechanic === InteractiveMechanic.SPACE_DASH ? '🚀' : isNấmMode ? '🍄' : '🛸'}
            </div>
          </div>
        )}

        {activeMechanic === InteractiveMechanic.RISING_WATER && (
          <div className="absolute bottom-0 left-0 right-0 bg-blue-500/20 backdrop-blur-[1px] border-t-2 border-blue-400/30 transition-all duration-300 z-10" style={{ height: `${visual.waterLevel}%` }}></div>
        )}
      </div>

      {!isHiddenMode && !disabled && (
        <div className="grid grid-cols-3 gap-3 shrink-0">
            <button onPointerDown={() => engineRef.current.playerX = Math.max(5, engineRef.current.playerX - 10)} className="bg-slate-800 text-white py-4 rounded-2xl font-black text-xl shadow-lg active:scale-90 transition-transform">←</button>
            <div className="grid grid-rows-2 gap-2">
              <button onPointerDown={() => engineRef.current.playerY = Math.max(10, engineRef.current.playerY - 10)} className="bg-slate-800 text-white py-2 rounded-xl font-black text-lg shadow-md active:scale-90 transition-transform">↑</button>
              <button onPointerDown={() => engineRef.current.playerY = Math.min(92, engineRef.current.playerY + 10)} className="bg-slate-800 text-white py-2 rounded-xl font-black text-lg shadow-md active:scale-90 transition-transform">↓</button>
            </div>
            <button onPointerDown={() => engineRef.current.playerX = Math.min(95, engineRef.current.playerX + 10)} className="bg-slate-800 text-white py-4 rounded-2xl font-black text-xl shadow-lg active:scale-90 transition-transform">→</button>
        </div>
      )}

      {isShootMode && !disabled && (
        <button onPointerDown={() => engineRef.current.projectiles.push({ x: engineRef.current.playerX, y: engineRef.current.playerY - 6, id: Date.now() })} className="w-full py-5 bg-blue-600 text-white rounded-[1.8rem] font-black uppercase shadow-xl active:scale-95 transition-all text-xl border-b-8 border-blue-800 shrink-0">BẮN ĐÁP ÁN 🎯</button>
      )}
      
      {isNấmMode && !disabled && (
        <div className="w-full py-5 bg-orange-600 text-white rounded-[1.8rem] font-black uppercase text-center italic text-sm shrink-0 border-b-8 border-orange-800 shadow-lg">
           DI CHUYỂN NẤM ĐỂ CHẠM VÀO SỐ! ✨
        </div>
      )}

      {isHiddenMode && !disabled && (
        <div className="w-full py-5 bg-emerald-600 text-white rounded-[1.8rem] font-black uppercase text-center italic text-sm shrink-0 border-b-8 border-emerald-800 shadow-lg">
           CHẠM TRỰC TIẾP ĐỂ LẬT VÀ CHỌN SỐ! 🃏
        </div>
      )}
    </div>
  );

  function handleToggleDS(idx: number, val: string) {
    if (disabled) return;
    setDsAnswers(prev => {
      const next = [...prev];
      next[idx] = val;
      onChange(next.map(a => a || ' ').join(''));
      return next;
    });
  }
};

export default React.memo(AnswerInput);
