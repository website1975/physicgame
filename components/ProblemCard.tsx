
import React, { useState, useEffect, useMemo } from 'react';
import { PhysicsProblem, Difficulty, QuestionType, DisplayChallenge } from '../types';
import LatexRenderer from './LatexRenderer';

interface ProblemCardProps {
  problem: PhysicsProblem;
  isPaused?: boolean;
  isHelpUsed?: boolean; 
}

const ProblemCard: React.FC<ProblemCardProps> = ({ problem, isPaused, isHelpUsed }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
  }, [problem?.id]);

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => setElapsed(p => p + 0.1), 100);
    return () => clearInterval(interval);
  }, [isPaused]);

  const difficultyColor = {
    [Difficulty.EASY]: 'bg-emerald-500 text-white',
    [Difficulty.MEDIUM]: 'bg-amber-400 text-white',
    [Difficulty.HARD]: 'bg-rose-500 text-white',
  };

  if (!problem) return null;

  return (
    <div className="bg-white rounded-[2.5rem] p-6 shadow-xl border-4 border-slate-50 relative overflow-hidden h-full flex flex-col animate-in fade-in duration-700">
      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-sm ${difficultyColor[problem.difficulty]}`}>
            {problem.difficulty}
          </span>
          <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 border border-blue-100 px-3 py-1 rounded-full">
            {problem.type}
          </span>
          <div className="flex-1"></div>
          <span className="text-[8px] font-black text-slate-300 uppercase italic tracking-widest">
            {problem.topic}
          </span>
        </div>
        
        <h2 className="text-lg font-black text-slate-800 mb-4 leading-tight uppercase italic tracking-tighter drop-shadow-sm line-clamp-2">
          {problem.title}
        </h2>
        
        <div className="flex-1 bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 shadow-inner flex flex-col items-start justify-center overflow-y-auto no-scrollbar">
           {problem.imageUrl && (
              <div className="w-full mb-4 flex justify-center">
                 <img src={problem.imageUrl} className="max-h-40 rounded-xl shadow-md border-2 border-white object-contain" alt="Problem Illustration" />
              </div>
           )}
           <div className="w-full">
              <LatexRenderer 
                content={problem.content} 
                className="text-lg md:text-xl text-slate-700 leading-relaxed font-bold italic" 
              />
           </div>
        </div>
      </div>
    </div>
  );
};

export default ProblemCard;
