
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PhysicsProblem, Difficulty, QuestionType, DisplayChallenge } from '../types';
import LatexRenderer from './LatexRenderer';

interface ProblemCardProps {
  problem: PhysicsProblem;
  isPaused?: boolean;
  isHelpUsed?: boolean; 
}

const READING_PHASE_DURATION = 15; // 15 giây đầu để học sinh đọc đề

const ProblemCard: React.FC<ProblemCardProps> = ({ problem, isPaused, isHelpUsed }) => {
  const [elapsed, setElapsed] = useState(0);
  const [isMemoryHidden, setIsMemoryHidden] = useState(false);
  const scrambledCache = useRef<string | null>(null);
  const lastProblemId = useRef<string | null>(null);

  // Reset khi đổi câu hỏi
  useEffect(() => {
    if (problem?.id !== lastProblemId.current) {
      setElapsed(0);
      setIsMemoryHidden(false);
      scrambledCache.current = null;
      lastProblemId.current = problem?.id;
    }
  }, [problem?.id]);

  // Timer điều khiển rào cản
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setElapsed(p => p + 0.1);
    }, 100);
    
    return () => clearInterval(interval);
  }, [isPaused, problem?.id]);

  // Logic Sương mù: Tính độ mờ
  const fogBlur = useMemo(() => {
    if (isHelpUsed) return 0;
    // Hỗ trợ cả mã tiếng Anh và tiếng Việt
    const isFoggy = problem.challenge === DisplayChallenge.FOGGY || (problem.challenge as any) === 'FOGGY';
    if (!isFoggy) return 0;
    
    // Bắt đầu mờ từ giây thứ 5, đạt đỉnh ở giây thứ 15
    if (elapsed < 5) return 0;
    return Math.min(20, ((elapsed - 5) / 10) * 20);
  }, [elapsed, problem.challenge, isHelpUsed]);

  // Logic Ghi nhớ: Ẩn đề bài
  useEffect(() => {
    const isMemory = problem.challenge === DisplayChallenge.MEMORY || (problem.challenge as any) === 'MEMORY';
    if (isMemory && elapsed >= READING_PHASE_DURATION && !isHelpUsed) {
      setIsMemoryHidden(true);
    } else {
      setIsMemoryHidden(false);
    }
  }, [elapsed, problem.challenge, isHelpUsed]);

  // Logic Sắp xếp từ (Scrambled): Tráo 1 lần duy nhất để tránh nhảy chữ
  const displayContent = useMemo(() => {
    const isScrambled = problem.challenge === DisplayChallenge.SCRAMBLED || (problem.challenge as any) === 'SCRAMBLED';
    
    if (isHelpUsed || !isScrambled || elapsed < READING_PHASE_DURATION) {
      return problem.content;
    }

    if (scrambledCache.current) return scrambledCache.current;

    const parts = problem.content.split(/(\$.*?\$)/g);
    const scrambledParts = parts.map(part => {
      if (part.startsWith('$') && part.endsWith('$')) return part;
      const words = part.trim().split(/\s+/);
      if (words.length <= 2) return part;
      
      for (let i = words.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [words[i], words[j]] = [words[j], words[i]];
      }
      return words.join(' ');
    });
    
    const finalScrambled = scrambledParts.join(' ');
    scrambledCache.current = finalScrambled;
    return finalScrambled;
  }, [problem.content, problem.challenge, elapsed, isHelpUsed]);

  // Lớp phủ hình ảnh cho các thử thách
  const challengeOverlay = useMemo(() => {
    if (isHelpUsed) return null;
    
    const challenge = problem.challenge as any;

    if (challenge === DisplayChallenge.FLOODING || challenge === 'FLOODING') {
      const height = Math.min(100, Math.max(0, (elapsed - 2) * 4)); // Nước dâng sau 2 giây
      return (
        <div className="absolute bottom-0 left-0 right-0 bg-blue-500/40 backdrop-blur-[2px] border-t-4 border-blue-300 pointer-events-none z-20 transition-all duration-300" style={{ height: `${height}%` }}>
           <div className="w-full h-8 bg-gradient-to-t from-transparent to-white/20 animate-pulse"></div>
        </div>
      );
    }
    
    if (challenge === DisplayChallenge.ANTS || challenge === 'ANTS') {
      if (elapsed < 5) return null;
      return (
        <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden opacity-40">
          {[...Array(20)].map((_, i) => (
            <div 
              key={i} 
              className="absolute text-2xl animate-ant" 
              style={{ 
                left: `${(Math.sin(i * 123) * 40) + 50}%`, 
                top: `${(Math.cos(i * 456) * 40) + 50}%`,
                animationDelay: `${i * 0.2}s`
              }}
            >
              🐜
            </div>
          ))}
        </div>
      );
    }

    if (challenge === DisplayChallenge.DISTRACTORS || challenge === 'DISTRACTORS') {
      if (elapsed < READING_PHASE_DURATION) return null;
      return (
        <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden bg-white/5">
             {['⚛️', '⚡', '📐', '🔋', '☄️'].map((icon, i) => (
                <div 
                  key={i}
                  className="absolute animate-ant opacity-20 text-7xl md:text-9xl"
                  style={{
                    left: `${(i * 20) + 10}%`,
                    top: `${(Math.sin(elapsed * 0.5 + i) * 30) + 50}%`,
                  }}
                >
                   {icon}
                </div>
             ))}
        </div>
      );
    }

    if (challenge === DisplayChallenge.FOGGY || challenge === 'FOGGY') {
      if (elapsed < 5) return null;
      return (
        <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden opacity-30 animate-fog">
           <div className="absolute inset-0 bg-gradient-to-tr from-white/80 via-transparent to-white/80 scale-150"></div>
           <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/fog.png')] opacity-50"></div>
        </div>
      );
    }
        
    return null;
  }, [problem.challenge, elapsed, isHelpUsed]);

  if (!problem) return null;

  const difficultyColor = {
    [Difficulty.EASY]: 'bg-emerald-500 text-white',
    [Difficulty.MEDIUM]: 'bg-amber-400 text-white',
    [Difficulty.HARD]: 'bg-rose-500 text-white',
  };

  return (
    <div className="bg-white rounded-[2.5rem] p-6 shadow-xl border-4 border-slate-50 relative overflow-hidden h-full flex flex-col animate-in fade-in duration-700">
      {challengeOverlay}

      <div className="relative z-10 flex flex-col h-full">
        {/* Thanh trạng thái Quan sát */}
        {(problem.challenge as any) !== DisplayChallenge.NORMAL && (problem.challenge as any) !== 'NORMAL' && !isHelpUsed && (
           <div className="mb-4 bg-slate-100 p-3 rounded-2xl border-2 border-slate-50 shadow-inner">
              <div className="flex justify-between items-center mb-1 px-1">
                 <span className="text-[9px] font-black text-slate-400 uppercase italic tracking-widest">
                    {elapsed < READING_PHASE_DURATION ? '⏱️ TRÍ NHỚ ĐANG HOẠT ĐỘNG' : '⚠️ RÀO CẢN KÍCH HOẠT'}
                 </span>
                 <span className={`text-[10px] font-black italic ${elapsed >= READING_PHASE_DURATION ? 'text-rose-500' : 'text-blue-500'}`}>
                    {elapsed < READING_PHASE_DURATION ? `${Math.ceil(READING_PHASE_DURATION - elapsed)}s` : 'CHÚ Ý!'}
                 </span>
              </div>
              <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                 <div 
                    className={`h-full transition-all duration-100 ease-linear ${elapsed >= READING_PHASE_DURATION ? 'bg-rose-500 animate-pulse' : 'bg-blue-500'}`}
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
          {(problem.challenge as any) !== DisplayChallenge.NORMAL && (problem.challenge as any) !== 'NORMAL' && (
            <span className="text-[8px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200 animate-pulse italic">
              🔥 {problem.challenge}
            </span>
          )}
        </div>
        
        <h2 className="text-xl md:text-2xl font-black text-slate-800 mb-4 leading-tight uppercase italic tracking-tighter drop-shadow-sm">
          {problem.title}
        </h2>
        
        <div 
          className="flex-1 bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 shadow-inner flex flex-col items-start justify-center relative min-h-[200px] transition-all duration-300"
          style={{ 
            filter: fogBlur > 0 ? `blur(${fogBlur}px)` : 'none' 
          }}
        >
           {isMemoryHidden ? (
             <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 animate-glitch">
                <span className="text-7xl mb-4">🧠</span>
                <p className="font-black uppercase italic tracking-widest text-sm text-center">Nội dung đã bị ẩn!<br/>Sử dụng trí nhớ của bạn.</p>
             </div>
           ) : (
             <div className="w-full">
               {problem.imageUrl && (
                  <div className="w-full mb-6 flex justify-center">
                     <img src={problem.imageUrl} className="max-h-56 rounded-2xl shadow-md border-4 border-white object-contain" alt="Problem" />
                  </div>
               )}
               <LatexRenderer 
                 content={displayContent} 
                 className={`text-lg md:text-2xl text-slate-700 leading-relaxed font-bold italic transition-all duration-500`} 
               />
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default ProblemCard;
