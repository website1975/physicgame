
import React, { useState, useEffect } from 'react';
import { GameState, Teacher, MatchData } from '../../types';
import { getRoomAssignments, fetchSetData } from '../../services/supabaseService';
import KeywordSelector from '../KeywordSelector';

interface SoloArenaManagerProps {
  gameState: GameState;
  setGameState: (s: GameState) => void;
  playerName: string;
  studentGrade: string;
  currentTeacher: Teacher;
  onStartMatch: (data: MatchData) => void;
  joinedRoom: any;
  setJoinedRoom: (room: any) => void;
  availableSets: any[];
  setAvailableSets: (sets: any[]) => void;
  uniqueId: string;
}

const SoloArenaManager: React.FC<SoloArenaManagerProps> = ({
  gameState, setGameState, studentGrade, currentTeacher, onStartMatch, 
  joinedRoom, setJoinedRoom, availableSets, setAvailableSets, uniqueId
}) => {
  const [selectedSet, setSelectedSet] = useState<any>(null);
  const [selectedQuantities, setSelectedQuantities] = useState<string[]>([]);
  const [selectedFormulas, setSelectedFormulas] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadSets = async () => {
      setLoading(true);
      try {
        const assignments = await getRoomAssignments(currentTeacher.id, 'ARENA_A');
        const fullSets = [];
        for (const item of assignments) {
          const data = await fetchSetData(item.set_id);
          if (String(data.grade) === String(studentGrade)) {
            fullSets.push({ ...data, id: item.set_id });
          }
        }
        setAvailableSets(fullSets);
        setGameState('SET_SELECTION');
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    loadSets();
  }, [currentTeacher.id, studentGrade]);

  if (gameState === 'SET_SELECTION') {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center bg-slate-950 overflow-y-auto no-scrollbar">
        <div className="max-w-7xl w-full flex justify-between items-start mb-16">
          <h2 className="text-6xl font-black text-white uppercase italic">LUYỆN TẬP</h2>
          <button onClick={() => { setJoinedRoom(null); setGameState('ROOM_SELECTION'); }} className="px-10 py-4 bg-white/10 text-white rounded-2xl font-black uppercase italic">QUAY LẠI ✕</button>
        </div>
        {loading ? (
          <div className="text-white font-black animate-pulse">ĐANG TẢI KHO ĐỀ...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {availableSets.map((set) => (
              <div key={set.id} className="bg-white p-8 rounded-[3.5rem] border-4 border-slate-50 shadow-2xl flex flex-col">
                <h4 className="text-2xl font-black text-slate-800 uppercase italic mb-10 leading-tight">{set.title}</h4>
                <button onClick={() => { setSelectedSet(set); setGameState('KEYWORD_SELECTION'); }} className="mt-auto w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase italic shadow-lg">BẮT ĐẦU</button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (gameState === 'KEYWORD_SELECTION' && selectedSet) {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center justify-center bg-slate-950">
         <div className="max-w-4xl w-full bg-white rounded-[4rem] p-12 shadow-2xl border-b-[12px] border-blue-600">
            <header className="mb-10 text-center"><h2 className="text-4xl font-black text-slate-800 uppercase italic mb-2">KHỞI ĐỘNG</h2></header>
            <div className="bg-slate-50 p-8 rounded-[3rem] mb-10">
               <KeywordSelector selectedQuantities={selectedQuantities} selectedFormulas={selectedFormulas} onToggleQuantity={s => setSelectedQuantities(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s])} onToggleFormula={id => setSelectedFormulas(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])} />
            </div>
            <button onClick={() => onStartMatch({ setId: selectedSet.id, title: selectedSet.title, rounds: selectedSet.rounds, joinedRoom, myId: uniqueId })} className="w-full py-6 bg-blue-600 text-white rounded-3xl font-black uppercase italic text-xl shadow-xl border-b-8 border-blue-800">⚡ SẴN SÀNG CHIẾN ĐẤU</button>
         </div>
      </div>
    );
  }

  return null;
};

export default SoloArenaManager;
