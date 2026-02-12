
import React, { useState, useEffect, useMemo } from 'react';
import { PhysicsProblem, Difficulty, QuestionType, DisplayChallenge } from '../types';
import LatexRenderer from './LatexRenderer';

interface ProblemCardProps {
  problem: PhysicsProblem;
  isPaused?: boolean;
  isHelpUsed?: boolean; 
}

const READING_PHASE_DURATION = 15; // 15 giây đọc đề

const ProblemCard: React.FC<ProblemCardProps> = ({ problem, isPaused, isHelpUsed }) => {
  const [elapsed, setElapsed] = useState(0);
  const [isMemoryHidden, setIsMemoryHidden] = useState(false);

  useEffect(() => {
    setElapsed(0);
    setIsMemoryHidden(false);
  }, [problem?.id]);

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setElapsed(p => p + 0.1);
    }, 100);
    
    return () => clearInterval(interval);
  }, [isPaused, problem?.id]);

  useEffect(() => {
    // Logic cho Ghi nhớ nhanh: Ẩn sau 15 giây
    if (problem?.challenge === DisplayChallenge.MEMORY && elapsed >= READING_PHASE_DURATION && !isHelpUsed) {
      setIsMemoryHidden(true);
    } else {
      setIsMemoryHidden(false);
    }
  }, [elapsed, problem?.challenge, isHelpUsed]);

  // Logic Sắp xếp chữ lộn xộn (Scrambled)
  const displayContent = useMemo(() => {
    if (isHelpUsed || problem.challenge !== DisplayChallenge.SCRAMBLED || elapsed < READING_PHASE_DURATION) {
      return problem.content;
    }

    // Tráo đổi vị trí các từ nhưng giữ nguyên khối LaTeX $...$
    const parts = problem.content.split(/(\$.*?\$)/g);
    const scrambledParts = parts.map(part => {
      if (part.startsWith('$') && part.endsWith('$')) return part; // Giữ nguyên LaTeX
      const words = part.trim().split(/\s+/);
      if (words.length <= 1) return part;
      
      // Thuật toán tráo từ Fisher-Yates
      for (let i = words.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [words[i], words[j]] = [words[j], words[i]];
      }
      return words.join(' ');
    });
    
    return scrambledParts.join(' ');
  }, [problem.content, problem.challenge, elapsed, isHelpUsed]);

  const difficultyColor = {
    [Difficulty.EASY]: 'bg-emerald-500 text-white',
    [Difficulty.MEDIUM]: 'bg-amber-400 text-white',
    [Difficulty.HARD]: 'bg-rose-500 text-white',
  };

  const fogBlur = useMemo(() => {
    if (isHelpUsed || problem.challenge !== DisplayChallenge.FOGGY) return 0;
    return Math.min(15, (elapsed / READING_PHASE_DURATION) * 15);
  }, [elapsed, problem.challenge, isHelpUsed]);

  const challengeOverlay = useMemo(() => {
    if (isHelpUsed) return null;
    
    switch (problem.challenge) {
      case DisplayChallenge.FLOODING:
        const height = Math.min(100, elapsed * 2);
        return <div className="absolute bottom-0 left-0 right-0 bg-blue-500/30 backdrop-blur-[1px] border-t-2 border-blue-400/50 pointer-events-none z-20 transition-all" style={{ height: `${height}%` }}></div>;
      
      case DisplayChallenge.ANTS:
        return (
          <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden opacity-30">
            {[...Array(15)].map((_, i) => (
              <div 
                key={i} 
                className="absolute text-xs animate-bounce" 
                style={{ 
                  left: `${(Math.sin(elapsed + i) * 40) + 50}%`, 
                  top: `${(Math.cos(elapsed * 0.5 + i) * 40) + 50}%`,
                  transition: 'all 0.5s linear'
                }}
              >
                🐜
              </div>
            ))}
          </div>
        );

      case DisplayChallenge.DISTRACTORS:
        if (elapsed < READING_PHASE_DURATION) return null;
        return (
          <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
             {['🍎', '⚛️', '⚡', '📐', '🔋'].map((icon, i) => (
                <div 
                  key={i}
                  className="absolute transition-all duration-1000 ease-in-out opacity-20 text-6xl md:text-8xl"
                  style={{
                    left: `${(Math.sin(elapsed * 0.3 + i) * 35) + 50}%`,
                    top: `${(Math.cos(elapsed * 0.4 + i) * 35) + 50}%`,
                    transform: `rotate(${elapsed * 20 + i * 45}deg) scale(${1 + Math.sin(elapsed + i) * 0.5})`
                  }}
                >
                   {icon}
                </div>
             ))}
             <div className="absolute inset-0 bg-white/5 backdrop-contrast-125 pointer-events-none"></div>
          </div>
        );
        
      default:
        return null;
    }
  }, [problem.challenge, elapsed, isHelpUsed]);

  if (!problem) return null;

  return (
    <div className="bg-white rounded-[2.5rem] p-6 shadow-xl border-4 border-slate-50 relative overflow-hidden h-auto min-h-full flex flex-col animate-in fade-in duration-700">
      {challengeOverlay}

      <div className="relative z-10 flex flex-col h-full">
        {/* Thanh Timeline 15s Quan sát */}
        {problem.challenge !== DisplayChallenge.NORMAL && !isHelpUsed && (
           <div className="mb-4 bg-slate-100 p-3 rounded-2xl border-2 border-slate-50 shadow-inner">
              <div className="flex justify-between items-center mb-1 px-1">
                 <span className="text-[9px] font-black text-slate-400 uppercase italic tracking-widest">
                    {elapsed < READING_PHASE_DURATION ? '⏱️ Đang ghi nhớ đề bài' : '⚠️ Rào cản đã kích hoạt'}
                 </span>
                 <span className={`text-[10px] font-black italic ${elapsed >= READING_PHASE_DURATION ? 'text-red-500' : 'text-blue-500'}`}>
                    {elapsed < READING_PHASE_DURATION ? `${Math.max(0, Math.ceil(READING_PHASE_DURATION - elapsed))}s` : 'READY'}
                 </span>
              </div>
              <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                 <div 
                    className={`h-full transition-all duration-100 ease-linear ${elapsed >= READING_PHASE_DURATION ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-r from-blue-400 to-indigo-500'}`}
                    style={{ width: `${Math.max(0, (1 - elapsed / READING_PHASE_DURATION) * 100)}%` }}
                 />
              </div>
           </div>
        )}

        <div className="flex items-center gap-2 mb-3">
          <span className={`text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-sm ${difficultyColor[problem.difficulty]}`}>
            {problem.difficulty}
          </span>
          <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 border border-blue-100 px-3 py-1 rounded-full">
            {problem.type}
          </span>
          <div className="flex-1"></div>
          {problem.challenge !== DisplayChallenge.NORMAL && (
            <span className="text-[8px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200 animate-pulse italic">
              {problem.challenge}
            </span>
          )}
        </div>
        
        <h2 className="text-xl md:text-2xl font-black text-slate-800 mb-4 leading-tight uppercase italic tracking-tighter drop-shadow-sm">
          {problem.title}
        </h2>
        
        <div 
          className="flex-1 bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 shadow-inner flex flex-col items-start justify-center relative min-h-[200px] transition-all duration-300 overflow-hidden"
          style={{ 
            filter: (problem.challenge === DisplayChallenge.FOGGY && !isHelpUsed) ? `blur(${fogBlur}px)` : 'none' 
          }}
        >
           {isMemoryHidden ? (
             <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                <span className="text-6xl mb-4">🧠</span>
                <p className="font-black uppercase italic tracking-widest text-sm text-center">Nội dung đã bị ẩn!<br/>Dùng trí nhớ của bạn.</p>
             </div>
           ) : (
             <>
               {problem.imageUrl && (
                  <div className="w-full mb-4 flex justify-center">
                     <img src={problem.imageUrl} className="max-h-64 rounded-xl shadow-md border-2 border-white object-contain" alt="Illustration" />
                  </div>
               )}
               <div className="w-full h-auto">
                  <LatexRenderer 
                    content={displayContent} 
                    className={`text-lg md:text-2xl text-slate-700 leading-relaxed font-bold italic transition-all duration-500 ${problem.challenge === DisplayChallenge.SCRAMBLED && elapsed >= READING_PHASE_DURATION ? 'opacity-80 scale-95' : ''}`} 
                  />
               </div>
             </>
           )}
        </div>
        
        {/* Overlay cảnh báo bổ sung */}
        {problem.challenge === DisplayChallenge.SCRAMBLED && elapsed >= READING_PHASE_DURATION && !isHelpUsed && (
          <div className="mt-4 bg-amber-50 border border-amber-200 p-2 rounded-xl text-center">
             <span className="text-[9px] font-black text-amber-600 uppercase italic">⚠️ CHỮ ĐÃ BỊ TRÁO ĐỔI VỊ TRÍ!</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProblemCard;
