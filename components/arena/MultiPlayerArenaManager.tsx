
import React, { useState, useEffect, useRef } from 'react';
import { GameState, Teacher, MatchData } from '../../types';
import { getRoomAssignments, fetchSetData, supabase } from '../../services/supabaseService';

interface MultiPlayerArenaManagerProps {
  gameState: GameState;
  setGameState: (s: GameState) => void;
  playerName: string;
  studentGrade: string;
  currentTeacher: Teacher;
  onStartMatch: (data: MatchData) => void;
  joinedRoom: any;
  setJoinedRoom: (room: any) => void;
  uniqueId: string;
}

const MultiPlayerArenaManager: React.FC<MultiPlayerArenaManagerProps> = ({
  setGameState, playerName, studentGrade, currentTeacher, onStartMatch, 
  joinedRoom, setJoinedRoom, uniqueId
}) => {
  const [presentPlayers, setPresentPlayers] = useState<any[]>([]);
  const matchStartedRef = useRef(false);
  const retryIntervalRef = useRef<any>(null);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    const myPresenceKey = `${playerName}_${uniqueId}`;
    const channelName = `arena_${joinedRoom.code}_${currentTeacher.id}`;
    const channel = supabase.channel(channelName, { config: { presence: { key: myPresenceKey } } });

    channel
      .on('presence', { event: 'sync' }, async () => {
        const state = channel.presenceState();
        const keys = Object.keys(state).sort();
        
        const playerInfos = keys.map(k => ({
          name: k.split('_')[0],
          id: k.split('_')[1],
          fullKey: k
        }));
        setPresentPlayers(playerInfos);
        
        const capacity = joinedRoom.capacity || 2;
        const isMaster = keys[0] === myPresenceKey;

        if (playerInfos.length >= capacity && !matchStartedRef.current && isMaster) {
          // Master load đề và bắt đầu Heartbeat Signal
          const assignments = await getRoomAssignments(currentTeacher.id, joinedRoom.code);
          const validSets = [];
          for (const item of assignments) {
             const data = await fetchSetData(item.set_id);
             if (String(data.grade) === String(studentGrade)) validSets.push({ ...data, id: item.set_id });
          }

          if (validSets.length > 0 && !retryIntervalRef.current) {
            const selectedSet = validSets[Math.floor(Math.random() * validSets.length)];
            const opponents = playerInfos.filter(p => p.id !== uniqueId).map(p => ({ id: p.id, name: p.name }));
            
            const signal = () => {
              if (matchStartedRef.current) return;
              channel.send({
                type: 'broadcast',
                event: 'match_start_signal',
                payload: {
                  setId: selectedSet.id,
                  rounds: selectedSet.rounds,
                  title: selectedSet.title,
                  allPlayers: playerInfos.map(p => ({ id: p.id, name: p.name }))
                }
              });
            };

            signal();
            retryIntervalRef.current = setInterval(signal, 1500);
          }
        }
      })
      .on('broadcast', { event: 'match_start_signal' }, ({ payload }) => {
        if (matchStartedRef.current) return;
        matchStartedRef.current = true;
        if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
        
        const opponents = (payload.allPlayers || []).filter((p: any) => p.id !== uniqueId).map((p: any) => ({ id: p.id, name: p.name }));
        onStartMatch({ setId: payload.setId, title: payload.title, rounds: payload.rounds, opponents, joinedRoom, myId: uniqueId });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await channel.track({ online: true });
      });

    channelRef.current = channel;
    return () => {
      if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
      supabase.removeChannel(channel);
    };
  }, [joinedRoom.code, currentTeacher.id, uniqueId]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
      <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-4xl w-full border-b-[12px] border-purple-600 flex flex-col items-center">
           <h2 className="text-3xl font-black text-slate-800 uppercase italic mb-8">SẢNH CHỜ ARENA</h2>
           <div className="w-full py-12 bg-slate-950 rounded-[3rem] text-white flex flex-col items-center gap-10">
              <div className="grid grid-cols-4 gap-6 px-10">
                 {presentPlayers.map((p, i) => (
                   <div key={i} className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-blue-600 border-4 border-white shadow-lg flex items-center justify-center text-2xl">👤</div>
                      <div className="text-[10px] font-black uppercase italic text-white text-center">{p.name}<br/><span className="opacity-40 text-[7px]">#{p.id.slice(-3).toUpperCase()}</span></div>
                   </div>
                 ))}
                 {Array.from({ length: Math.max(0, (joinedRoom?.capacity || 2) - presentPlayers.length) }).map((_, i) => (
                   <div key={`empty-${i}`} className="flex flex-col items-center gap-3 opacity-20">
                      <div className="w-16 h-16 rounded-full bg-slate-700 border-4 border-slate-600 flex items-center justify-center text-2xl">?</div>
                      <div className="text-[8px] font-black uppercase italic text-slate-500">Đang tìm...</div>
                   </div>
                 ))}
              </div>
              <div className="flex items-center gap-3">
                 <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                 <span className="font-black italic uppercase text-xl text-white animate-pulse">ĐANG KẾT NỐI ARENA...</span>
              </div>
           </div>
           <button onClick={() => { setJoinedRoom(null); setGameState('ROOM_SELECTION'); }} className="mt-8 px-10 py-4 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase text-xs italic">Rời phòng</button>
      </div>
    </div>
  );
};

export default MultiPlayerArenaManager;
