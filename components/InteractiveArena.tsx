
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { InteractiveMechanic } from '../types';

interface InteractiveArenaProps {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  mechanic?: InteractiveMechanic;
}

interface Bullet {
  id: number;
  x: number;
  y: number;
}

const InteractiveArena: React.FC<InteractiveArenaProps> = ({ value, onChange, disabled, mechanic }) => {
  const [playerPos, setPlayerPos] = useState({ x: 50, y: 85 });
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Cấu hình các phím số - Thu nhỏ lại và phân bố rộng hơn
  const keys = [
    { n: '1', x: 20, y: 15 }, { n: '2', x: 50, y: 15 }, { n: '3', x: 80, y: 15 },
    { n: '4', x: 30, y: 35 }, { n: '5', x: 50, y: 35 }, { n: '6', x: 70, y: 35 },
    { n: '7', x: 20, y: 55 }, { n: '8', x: 50, y: 55 }, { n: '9', x: 80, y: 55 },
    { n: '0', x: 35, y: 72 }, { n: '.', x: 50, y: 72 }, { n: '-', x: 65, y: 72 },
  ];

  // Game Loop cho đạn
  useEffect(() => {
    if (disabled) return;
    const interval = setInterval(() => {
      setBullets(prev => {
        const next = prev.map(b => ({ ...b, y: b.y - 4 })).filter(b => b.y > 0);
        
        // Kiểm tra va chạm
        next.forEach((bullet, bIdx) => {
          keys.forEach(key => {
            const dx = Math.abs(bullet.x - key.x);
            const dy = Math.abs(bullet.y - key.y);
            if (dx < 6 && dy < 6) {
              onChange(value + key.n);
              next.splice(bIdx, 1);
            }
          });
        });
        
        return [...next];
      });
    }, 30);
    return () => clearInterval(interval);
  }, [bullets, value, onChange, disabled]);

  const move = (dx: number, dy: number) => {
    if (disabled) return;
    setPlayerPos(prev => ({
      x: Math.max(5, Math.min(95, prev.x + dx)),
      y: Math.max(5, Math.min(95, prev.y + dy))
    }));
  };

  const shoot = () => {
    if (disabled) return;
    setBullets(prev => [...prev, { id: Date.now(), x: playerPos.x, y: playerPos.y - 5 }]);
  };

  const getAvatar = () => {
    switch (mechanic) {
      case InteractiveMechanic.MARIO: return '🍄';
      case InteractiveMechanic.SPACE_DASH: return '🚀';
      case InteractiveMechanic.RISING_WATER: return '🚢';
      default: return '🛸';
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full bg-slate-950 rounded-[2.5rem] relative overflow-hidden flex flex-col p-4 border-2 border-slate-900 shadow-inner select-none touch-none">
      {/* Không gian chơi */}
      <div className="flex-1 relative">
        {/* Background Stars */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="absolute bg-white rounded-full animate-pulse" style={{
              width: '2px', height: '2px',
              top: `${Math.random() * 100}%`, left: `${Math.random() * 100}%`
            }} />
          ))}
        </div>

        {/* Các ô số mục tiêu - Thu nhỏ lại */}
        {keys.map((key) => (
          <div
            key={key.n}
            className="absolute w-10 h-10 md:w-12 md:h-12 bg-blue-600 rounded-xl border-b-4 border-blue-800 flex items-center justify-center shadow-lg transition-transform"
            style={{ 
              left: `${key.x}%`, 
              top: `${key.y}%`, 
              transform: 'translate(-50%, -50%)',
              animation: `float ${3 + Math.random()}s ease-in-out infinite alternate`
            }}
          >
            <span className="text-white text-lg font-black italic">{key.n}</span>
          </div>
        ))}

        {/* Đạn */}
        {bullets.map(b => (
          <div key={b.id} className="absolute w-2 h-4 bg-yellow-400 rounded-full shadow-[0_0_8px_rgba(250,204,21,0.8)]"
            style={{ left: `${b.x}%`, top: `${b.y}%`, transform: 'translateX(-50%)' }} />
        ))}

        {/* Nhân vật chính */}
        <div 
          className="absolute w-12 h-12 flex items-center justify-center text-3xl transition-all duration-75 z-20"
          style={{ left: `${playerPos.x}%`, top: `${playerPos.y}%`, transform: 'translate(-50%, -50%)' }}
        >
          <div className="relative">
             <span className="drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]">{getAvatar()}</span>
             {mechanic === InteractiveMechanic.RISING_WATER && (
                <div className="absolute -bottom-2 w-full h-1 bg-blue-400/30 blur-sm rounded-full animate-pulse" />
             )}
          </div>
        </div>
      </div>

      {/* Bộ điều khiển (D-Pad & Action) */}
      <div className="h-40 shrink-0 flex items-center justify-between px-4 pb-2">
        {/* D-Pad */}
        <div className="grid grid-cols-3 gap-1 scale-90 md:scale-100">
          <div />
          <button onPointerDown={() => move(0, -8)} className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center text-white active:bg-blue-600 shadow-lg border-b-4 border-slate-950 active:border-b-0 active:translate-y-1">▲</button>
          <div />
          <button onPointerDown={() => move(-8, 0)} className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center text-white active:bg-blue-600 shadow-lg border-b-4 border-slate-950 active:border-b-0 active:translate-y-1">◀</button>
          <button onPointerDown={() => move(0, 8)} className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center text-white active:bg-blue-600 shadow-lg border-b-4 border-slate-950 active:border-b-0 active:translate-y-1">▼</button>
          <button onPointerDown={() => move(8, 0)} className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center text-white active:bg-blue-600 shadow-lg border-b-4 border-slate-950 active:border-b-0 active:translate-y-1">▶</button>
        </div>

        {/* Nút Bắn / Action */}
        <div className="flex flex-col items-center gap-2">
          <button 
            onPointerDown={shoot}
            className="w-20 h-20 bg-red-600 rounded-full border-b-[8px] border-red-800 flex items-center justify-center shadow-2xl active:border-b-0 active:translate-y-2 active:scale-95 transition-all group"
          >
            <div className="w-14 h-14 rounded-full border-4 border-white/20 flex items-center justify-center">
              <span className="text-white font-black text-xs uppercase italic tracking-widest">FIRE</span>
            </div>
          </button>
          <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest">Bắn để chọn số</span>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes float {
          0% { transform: translate(-50%, -50%) translateY(0px); }
          100% { transform: translate(-50%, -50%) translateY(-10px); }
        }
      `}} />
    </div>
  );
};

export default InteractiveArena;
