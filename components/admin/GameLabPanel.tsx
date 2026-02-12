
import React, { useState } from 'react';
import { InteractiveMechanic, QuestionType, Difficulty, DisplayChallenge } from '../../types';
import AnswerInput from '../AnswerInput';

const GameLabPanel: React.FC = () => {
  const [testMechanic, setTestMechanic] = useState<InteractiveMechanic | null>(null);
  const [testValue, setTestValue] = useState('');

  const labGames = [
    { id: InteractiveMechanic.CANNON, name: 'Pháo xạ kích', icon: '🛸', color: 'bg-slate-900' },
    { id: InteractiveMechanic.RISING_WATER, name: 'Nước dâng cao', icon: '🚢', color: 'bg-blue-600' },
    { id: InteractiveMechanic.SPACE_DASH, name: 'Vũ trụ phiêu lưu', icon: '🌌', color: 'bg-indigo-900' },
    { id: InteractiveMechanic.MARIO, name: 'Nấm lùn phiêu lưu', icon: '🍄', color: 'bg-orange-500' },
    { id: InteractiveMechanic.HIDDEN_TILES, name: 'Lật ô bí mật', icon: '🃏', color: 'bg-emerald-600' },
  ];

  const dummyProblem = (mechanic: InteractiveMechanic) => ({
    id: 'test', title: 'Test', content: 'Thử nghiệm cơ chế.', type: QuestionType.SHORT_ANSWER,
    difficulty: Difficulty.EASY, challenge: DisplayChallenge.NORMAL, topic: 'Test',
    correctAnswer: '123', explanation: 'Demo.', mechanic, timeLimit: 60
  });

  return (
    <div className="h-full animate-in fade-in flex flex-col items-center">
      {testMechanic ? (
        <div className="bg-white rounded-[3rem] p-8 border-8 border-slate-100 shadow-2xl w-full max-w-5xl flex flex-col items-center">
           <div className="w-full flex justify-between items-center mb-8">
              <button onClick={() => setTestMechanic(null)} className="px-6 py-2 bg-slate-100 text-slate-500 font-black rounded-xl uppercase italic text-[10px]">← Quay lại</button>
              <h4 className="text-2xl font-black uppercase italic text-slate-800">Cơ chế: {labGames.find(g => g.id === testMechanic)?.name}</h4>
           </div>
           <div className="w-full h-[500px]">
              <AnswerInput problem={dummyProblem(testMechanic) as any} value={testValue} onChange={setTestValue} onSubmit={() => {}} disabled={false} />
           </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-6 w-full">
          {labGames.map((game) => (
            <div key={game.id} className="bg-white p-6 rounded-[2.5rem] border-4 border-slate-100 shadow-xl flex flex-col items-center text-center group hover:-translate-y-2 transition-all">
               <div className={`w-20 h-20 ${game.color} rounded-[1.5rem] flex items-center justify-center text-4xl mb-4 shadow-lg group-hover:scale-110 transition-transform`}>{game.icon}</div>
               <h5 className="text-sm font-black uppercase italic text-slate-800 mb-4">{game.name}</h5>
               <button onClick={() => setTestMechanic(game.id)} className="w-full py-3 bg-slate-900 text-white font-black rounded-xl uppercase italic text-[9px] hover:bg-blue-600 transition-colors">CHẠY THỬ 🚀</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GameLabPanel;
