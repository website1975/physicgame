
import React, { useState, useEffect, useMemo } from 'react';
import { PhysicsProblem, Difficulty, QuestionType, DisplayChallenge } from '../types';
import LatexRenderer from './LatexRenderer';

interface ProblemCardProps {
  problem: PhysicsProblem;
  isPaused?: boolean;
}

const ProblemCard: React.FC<ProblemCardProps> = ({ problem, isPaused }) => {
  const [elapsed, setElapsed] = useState(0);
  const [isImgLoading, setIsImgLoading] = useState(true);
  const [imgLoadError, setImgLoadError] = useState(false);
  const MEMORY_LIMIT = 8;
  const FOGGY_DURATION = 30;

  useEffect(() => {
    let interval: number;
    if (!isPaused) {
      interval = window.setInterval(() => {
        setElapsed(prev => prev + 0.5);
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isPaused, problem.id]);

  useEffect(() => {
    setElapsed(0);
    setIsImgLoading(true);
    setImgLoadError(false);
  }, [problem.id]);

  const scrambledContent = useMemo(() => {
    if (problem.challenge !== DisplayChallenge.SCRAMBLED) return problem.content;
    const words = problem.content.split(' ');
    return words
      .map(w => ({ w, sort: Math.sin(w.length + words.indexOf(w)) }))
      .sort((a, b) => a.sort - b.sort)
      .map(x => x.w)
      .join(' ');
  }, [problem.content, problem.challenge]);

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

  const isMemoryHidden = problem.challenge === DisplayChallenge.MEMORY && elapsed >= MEMORY_LIMIT;
  
  const blurAmount = useMemo(() => {
    if (problem.challenge !== DisplayChallenge.FOGGY) return 0;
    return Math.min(10, (elapsed / FOGGY_DURATION) * 10);
  }, [problem.challenge, elapsed]);

  return (
    <div className="bg-white rounded-[2rem] md:rounded-[3rem] p-4 md:p-6 shadow-xl border-4 md:border-8 border-slate-50 relative overflow-hidden h-full flex flex-col animate-in fade-in duration-700">
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
          <span className="text-[8px] md:text-[10px] font-black text-white bg-purple-400 px-3 md:px-4 py-1 rounded-lg uppercase tracking-widest flex items-center gap-1 shadow-sm">
             <span className="animate-pulse">🔥</span> {problem.challenge}
          </span>
        </div>
        
        <h2 className="text-xl md:text-2xl font-black text-slate-800 mb-4 leading-tight uppercase italic tracking-tighter drop-shadow-sm line-clamp-2">
          {problem.title}
        </h2>
        
        <div className="relative flex-1 min-h-0 flex flex-col gap-4">
          {problem.challenge === DisplayChallenge.MEMORY && !isPaused && elapsed < MEMORY_LIMIT && (
            <div className="absolute -top-3 left-0 right-0 h-1.5 bg-slate-100 rounded-full overflow-hidden z-20">
              <div 
                className="h-full bg-gradient-to-r from-orange-400 to-rose-500 transition-all duration-500" 
                style={{ width: `${(1 - elapsed/MEMORY_LIMIT) * 100}%` }}
              />
            </div>
          )}

          <div className="bg-slate-50 p-4 md:p-6 rounded-[1.5rem] md:rounded-[2.5rem] border-2 md:border-4 border-slate-100 shadow-inner relative overflow-hidden flex-1 flex flex-col items-start justify-center backdrop-blur-sm gap-4">
            
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
