
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PhysicsProblem, Difficulty, QuestionType, DisplayChallenge } from '../types';
import LatexRenderer from './LatexRenderer';

interface ProblemCardProps {
  problem: PhysicsProblem;
  isPaused?: boolean;
  isHelpUsed?: boolean; 
}

interface MovingObject {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  icon?: string;
  size: number;
}

const ProblemCard: React.FC<ProblemCardProps> = ({ problem, isPaused, isHelpUsed }) => {
  const [elapsed, setElapsed] = useState(0);
  const [isImgLoading, setIsImgLoading] = useState(true);
  const [imgLoadError, setImgLoadError] = useState(false);
  
  // State cho các đối tượng di động
  const [movingAnts, setMovingAnts] = useState<MovingObject[]>([]);
  const [movingDistractors, setMovingDistractors] = useState<MovingObject[]>([]);
  
  const MEMORY_LIMIT = 8;
  const FOGGY_DURATION = 30;
  const FLOOD_DURATION = 25;

  // Khởi tạo các đối tượng khi bắt đầu câu hỏi mới
  useEffect(() => {
    setElapsed(0);
    setIsImgLoading(true);
    setImgLoadError(false);

    if (!isHelpUsed) {
      if (problem.challenge === DisplayChallenge.ANTS) {
        const initialAnts = Array.from({ length: 12 }).map((_, i) => ({
          id: i,
          x: Math.random() * 80 + 10,
          y: Math.random() * 80 + 10,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          angle: 0,
          size: 20 + Math.random() * 10
        }));
        setMovingAnts(initialAnts);
        setMovingDistractors([]);
      } else if (problem.challenge === DisplayChallenge.DISTRACTORS) {
        const icons = ['🌀', '💢', '💨', '💥', '✨', '⚡', '🛸', '⚛️'];
        const initialDist = Array.from({ length: 8 }).map((_, i) => ({
          id: i,
          x: Math.random() * 80 + 10,
          y: Math.random() * 80 + 10,
          vx: (Math.random() - 0.5) * 1.5,
          vy: (Math.random() - 0.5) * 1.5,
          angle: 0,
          icon: icons[i % icons.length],
          size: 30 + Math.random() * 20
        }));
        setMovingDistractors(initialDist);
        setMovingAnts([]);
      } else {
        setMovingAnts([]);
        setMovingDistractors([]);
      }
    } else {
      setMovingAnts([]);
      setMovingDistractors([]);
    }
  }, [problem.id, problem.challenge, isHelpUsed]);

  // Vòng lặp animation xử lý chuyển động Brown
  useEffect(() => {
    if (isPaused) return;

    const interval = window.setInterval(() => {
      setElapsed(prev => prev + 0.1);

      // Cập nhật kiến
      if (problem.challenge === DisplayChallenge.ANTS && !isHelpUsed) {
        setMovingAnts(current => current.map(ant => {
          // Lực đẩy ngẫu nhiên (Brownian factor)
          let nvx = ant.vx + (Math.random() - 0.5) * 0.4;
          let nvy = ant.vy + (Math.random() - 0.5) * 0.4;

          // Giới hạn tốc độ tối đa
          const speed = Math.sqrt(nvx * nvx + nvy * nvy);
          const maxSpeed = 2.5;
          if (speed > maxSpeed) {
            nvx = (nvx / speed) * maxSpeed;
            nvy = (nvy / speed) * maxSpeed;
          }

          // Cập nhật vị trí
          let nx = ant.x + nvx;
          let ny = ant.y + nvy;

          // Phản xạ biên (Bounce)
          if (nx < 5 || nx > 95) nvx *= -1;
          if (ny < 5 || ny > 95) nvy *= -1;

          // Tính góc xoay dựa trên vector vận tốc (để kiến hướng đầu về phía trước)
          const angle = Math.atan2(nvy, nvx) * (180 / Math.PI) + 90;

          return { ...ant, x: nx, y: ny, vx: nvx, vy: nvy, angle };
        }));
      }

      // Cập nhật vật thể nhiễu (Bay chậm và hỗn loạn hơn)
      if (problem.challenge === DisplayChallenge.DISTRACTORS && !isHelpUsed) {
        setMovingDistractors(current => current.map(d => {
          let nvx = d.vx + (Math.random() - 0.5) * 0.2;
          let nvy = d.vy + (Math.random() - 0.5) * 0.2;
          
          const speed = Math.sqrt(nvx * nvx + nvy * nvy);
          const maxSpeed = 1.5;
          if (speed > maxSpeed) {
            nvx = (nvx / speed) * maxSpeed;
            nvy = (nvy / speed) * maxSpeed;
          }

          let nx = d.x + nvx;
          let ny = d.y + nvy;

          if (nx < 0 || nx > 100) nvx *= -1;
          if (ny < 0 || ny > 100) nvy *= -1;

          return { ...d, x: nx, y: ny, vx: nvx, vy: nvy, angle: d.angle + 2 };
        }));
      }

    }, 50); // 20 FPS cho chuyển động mượt mà mà vẫn đảm bảo hiệu năng

    return () => clearInterval(interval);
  }, [isPaused, problem.challenge, isHelpUsed]);

  const scrambledContent = useMemo(() => {
    if (isHelpUsed || problem.challenge !== DisplayChallenge.SCRAMBLED) return problem.content;
    const words = problem.content.split(' ');
    return words
      .map(w => ({ w, sort: Math.sin(w.length + words.indexOf(w)) }))
      .sort((a, b) => a.sort - b.sort)
      .map(x => x.w)
      .join(' ');
  }, [problem.content, problem.challenge, isHelpUsed]);

  const difficultyColor = {
    [Difficulty.EASY]: 'bg-emerald-500 text-white',
    [Difficulty.MEDIUM]: 'bg-amber-400 text-white',
    [Difficulty.HARD]: 'bg-rose-500 text-white',
  };

  const typeLabels = {
    [QuestionType.MULTIPLE_CHOICE]: 'TRẮC NGHIỆM',
    [QuestionType.TRUE_FALSE]: 'ĐÚNG / SAI',
    [QuestionType.SHORT_ANSWER]: 'TRẢ LỜI NGẮN',
  };

  const isMemoryHidden = !isHelpUsed && problem.challenge === DisplayChallenge.MEMORY && elapsed >= MEMORY_LIMIT;
  
  const blurAmount = useMemo(() => {
    if (isHelpUsed || problem.challenge !== DisplayChallenge.FOGGY) return 0;
    return Math.min(10, (elapsed / FOGGY_DURATION) * 10);
  }, [problem.challenge, elapsed, isHelpUsed]);

  return (
    <div className="bg-white rounded-[2rem] md:rounded-[3rem] p-4 md:p-6 shadow-xl border-4 md:border-8 border-slate-50 relative overflow-hidden h-full flex flex-col animate-in fade-in duration-700">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none overflow-hidden flex flex-wrap gap-x-8 gap-y-6 p-4 text-2xl md:text-3xl font-black italic select-none leading-relaxed">
        {Array.from({length: 12}).map((_, i) => (
          <span key={i} className="whitespace-nowrap">
            E=MC² F=MA v=s/t P=UI A=F.s Δp=F.Δt λ=v/f E=k.Q/r²
          </span>
        ))}
      </div>
      
      <div className="relative z-10 flex flex-col h-full">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className={`text-[8px] md:text-[10px] font-black px-3 md:px-4 py-1 rounded-full uppercase tracking-widest shadow-sm ${difficultyColor[problem.difficulty]}`}>
            {problem.difficulty}
          </span>
          <span className="text-[8px] md:text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 border border-blue-100 px-3 md:px-4 py-1 rounded-full">
            {typeLabels[problem.type]}
          </span>
          <div className="flex-1"></div>
          <span className={`text-[8px] md:text-[10px] font-black text-white ${isHelpUsed ? 'bg-emerald-500' : 'bg-purple-600'} px-3 md:px-4 py-1 rounded-lg uppercase tracking-widest flex items-center gap-1 shadow-sm transition-colors`}>
             <span className="animate-pulse">{isHelpUsed ? '💡' : '🔥'}</span> {isHelpUsed ? 'TRỢ GIÚP ĐANG BẬT' : problem.challenge}
          </span>
        </div>
        
        <h2 className="text-xl md:text-2xl font-black text-slate-800 mb-4 leading-tight uppercase italic tracking-tighter drop-shadow-sm line-clamp-2">
          {problem.title}
        </h2>
        
        <div className="relative flex-1 min-h-0 flex flex-col gap-4">
          {/* Progress Bar cho Memory hoặc Flooding */}
          {(problem.challenge === DisplayChallenge.MEMORY || problem.challenge === DisplayChallenge.FLOODING) && !isPaused && !isHelpUsed && (
            <div className="absolute -top-3 left-0 right-0 h-1.5 bg-slate-100 rounded-full overflow-hidden z-20">
              <div 
                className="h-full bg-gradient-to-r from-orange-400 to-rose-500 transition-all duration-500" 
                style={{ width: `${Math.max(0, (1 - elapsed / (problem.challenge === DisplayChallenge.MEMORY ? MEMORY_LIMIT : FLOOD_DURATION))) * 100}%` }}
              />
            </div>
          )}

          <div className="bg-slate-50 p-4 md:p-6 rounded-[1.5rem] md:rounded-[2.5rem] border-2 md:border-4 border-slate-100 shadow-inner relative overflow-hidden flex-1 flex flex-col items-start justify-center backdrop-blur-sm gap-4">
            
            {/* Thử thách: Nước dâng (Sóng sánh động) */}
            {problem.challenge === DisplayChallenge.FLOODING && !isHelpUsed && (
              <div 
                className="absolute bottom-0 left-0 right-0 bg-blue-500/40 backdrop-blur-[2px] transition-all duration-300 z-30 pointer-events-none overflow-hidden"
                style={{ height: `${Math.min(100, (elapsed / FLOOD_DURATION) * 100)}%` }}
              >
                 <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-white/30 to-transparent animate-pulse"></div>
                 {/* Thêm hiệu ứng bọt nước nhẹ */}
                 <div className="absolute inset-0 opacity-20">
                    {Array.from({length: 10}).map((_, i) => (
                      <div key={i} className="absolute bg-white rounded-full animate-bounce" style={{
                        left: `${(i * 15) % 100}%`,
                        bottom: `${(i * 20) % 100}%`,
                        width: '4px', height: '4px',
                        animationDelay: `${i * 0.2}s`
                      }}></div>
                    ))}
                 </div>
              </div>
            )}

            {/* Thử thách: Kiến bò (Chuyển động Brown) */}
            {movingAnts.map(ant => (
              <div 
                key={ant.id} 
                className="absolute z-40 pointer-events-none transition-transform duration-50"
                style={{ 
                  left: `${ant.x}%`, 
                  top: `${ant.y}%`, 
                  transform: `translate(-50%, -50%) rotate(${ant.angle}deg)`,
                  fontSize: `${ant.size}px`
                }}
              >🐜</div>
            ))}

            {/* Thử thách: Vật thể nhiễu (Bay hỗn loạn) */}
            {movingDistractors.map(d => (
              <div 
                key={d.id} 
                className="absolute z-40 pointer-events-none opacity-40 mix-blend-multiply"
                style={{ 
                  left: `${d.x}%`, 
                  top: `${d.y}%`,
                  transform: `translate(-50%, -50%) rotate(${d.angle}deg) scale(${1 + Math.sin(elapsed) * 0.1})`,
                  fontSize: `${d.size}px`
                }}
              >{d.icon}</div>
            ))}

            {problem.imageUrl && !isMemoryHidden && (
               <div className="max-w-full max-h-[45%] flex flex-col items-center justify-center animate-in zoom-in duration-500 shrink-0 relative self-center">
                  {isImgLoading && !imgLoadError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-100 rounded-2xl animate-pulse">
                      <span className="text-[10px] font-black text-slate-400 uppercase italic">Đang nạp ảnh...</span>
                    </div>
                  )}
                  {imgLoadError ? (
                    <div className="w-full h-32 bg-slate-200 border-4 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center text-slate-400 opacity-50">
                       <span className="text-3xl mb-1">🖼️</span>
                       <span className="font-black text-[8px] uppercase">Không thể hiển thị ảnh</span>
                    </div>
                  ) : (
                    <img 
                      src={problem.imageUrl} 
                      onLoad={() => setIsImgLoading(false)}
                      onError={() => { setImgLoadError(true); setIsImgLoading(false); }}
                      className={`max-w-full max-h-full rounded-2xl shadow-xl border-4 border-white object-contain transition-all duration-500 ${isImgLoading ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`} 
                      alt="Diagram" 
                    />
                  )}
               </div>
            )}

            <div className={`transition-all duration-700 w-full ${isMemoryHidden ? 'opacity-0 scale-90 rotate-1' : 'opacity-100 scale-100 rotate-0'}`} style={{ filter: `blur(${blurAmount}px)` }}>
               <LatexRenderer 
                content={scrambledContent} 
                className="text-sm md:text-base text-slate-600 leading-relaxed font-medium italic text-left" 
               />
            </div>
            
            {isMemoryHidden && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 animate-in fade-in zoom-in duration-500 bg-slate-50/80">
                <div className="text-6xl md:text-8xl mb-3 opacity-20">🧠</div>
                <span className="font-black uppercase tracking-widest text-[8px] md:text-[10px] bg-slate-200 text-slate-500 px-4 py-1.5 rounded-full">Ghi nhớ nhanh</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProblemCard;
