
import React, { useState, useEffect, useRef } from 'react';
import { GameState, Teacher, MatchData } from '../../types';
import { getRoomAssignments, fetchSetData, supabase } from '../../services/supabaseService';

interface MultiPlayerArenaManagerProps {
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
  const heartbeatIntervalRef = useRef<any>(null);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    const myPresenceKey = `${playerName}_${uniqueId}`;
    const channelName = `arena_${joinedRoom.code}_${currentTeacher.id}`;
    
    const channel = supabase.channel(channelName, { 
      config: { presence: { key: myPresenceKey } } 
    });

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

        // CHỈ MASTER MỚI ĐIỀU PHỐI KHỞI TẠO
        if (playerInfos.length >= capacity && !matchStartedRef.current && isMaster && !heartbeatIntervalRef.current) {
          try {
            const assignments = await getRoomAssignments(currentTeacher.id, joinedRoom.code);
            const validSets = [];
            for (const item of assignments) {
               const data = await fetchSetData(item.set_id);
               if (String(data.grade) === String(studentGrade)) validSets.push({ ...data, id: item.set_id });
            }

            if (validSets.length > 0) {
              const selectedSet = validSets[Math.floor(Math.random() * validSets.length)];
              const allPlayersPayload = playerInfos.map(p => ({ id: p.id, name: p.name }));
              
              // Tăng buffer lên 3 giây để đảm bảo sync mạng
              const syncStartTime = Date.now() + 3000;

              const sendSignal = () => {
                if (matchStartedRef.current) return;
                channel.send({
                  type: 'broadcast',
                  event: 'match_start_signal',
                  payload: {
                    setId: selectedSet.id,
                    rounds: selectedSet.rounds,
                    title: selectedSet.title,
                    allPlayers: allPlayersPayload,
                    startTime: syncStartTime
                  }
                });
              };

              sendSignal();
              heartbeatIntervalRef.current = setInterval(sendSignal, 500);

              // Tự đợi đến giờ mới kích hoạt local
              const checkStart = setInterval(() => {
                if (Date.now() >= syncStartTime) {
                  clearInterval(checkStart);
                  if (matchStartedRef.current) return;
                  matchStartedRef.current = true;
                  if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
                  const opponents = allPlayersPayload.filter(p => p.id !== uniqueId);
                  onStartMatch({ 
                    setId: selectedSet.id, title: selectedSet.title, rounds: selectedSet.rounds, 
                    opponents, joinedRoom, myId: uniqueId 
                  });
                }
              }, 100);
            }
          } catch (e) {
            console.error("Lỗi Master khởi tạo:", e);
          }
        }
      })
      .on('broadcast', { event: 'match_start_signal' }, ({ payload }) => {
        if (matchStartedRef.current) return;
        
        const delay = payload.startTime - Date.now();
        
        // Nếu tín hiệu đến quá trễ (quá mốc bắt đầu), bắt đầu ngay lập tức
        // Nếu còn thời gian, đợi đến đúng milli-giây đó
        matchStartedRef.current = true;
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
        const opponents = (payload.allPlayers || []).filter((p: any) => p.id !== uniqueId).map((p: any) => ({ id: p.id, name: p.name }));
        
        setTimeout(() => {
          onStartMatch({ 
            setId: payload.setId, title: payload.title, rounds: payload.rounds, 
            opponents, joinedRoom, myId: uniqueId 
          });
        }, Math.max(0, delay));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ online: true, joined_at: new Date().toISOString() });
        }
      });

    channelRef.current = channel;
    return () => {
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      supabase.removeChannel(channel);
    };
  }, [joinedRoom.code, currentTeacher.id, uniqueId, playerName, studentGrade]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
      <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-4xl w-full border-b-[12px] border-purple-600 flex flex-col items-center">
           <div className="text-5xl mb-6">📡</div>
           <h2 className="text-3xl font-black text-slate-800 uppercase italic mb-8 text-center tracking-tighter">ARENA SYNC</h2>
           <div className="w-full py-12 bg-slate-950 rounded-[3rem] text-white flex flex-col items-center gap-10">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 px-10">
                 {presentPlayers.map((p, i) => (
                   <div key={i} className="flex flex-col items-center gap-3 animate-in zoom-in">
                      <div className="w-16 h-16 rounded-full bg-blue-600 border-4 border-white shadow-lg flex items-center justify-center text-2xl">👤</div>
                      <div className="text-[10px] font-black uppercase italic text-white text-center">
                        {p.name === playerName ? 'BẠN' : p.name}
                      </div>
                   </div>
                 ))}
              </div>
              <div className="flex items-center gap-4 bg-white/5 px-8 py-4 rounded-full border border-white/10">
                 <div className="w-5 h-5 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                 <span className="font-black italic uppercase text-lg text-white tracking-widest">
                   {presentPlayers.length >= (joinedRoom.capacity || 2) ? 'KÍCH HOẠT TRẬN ĐẤU...' : 'ĐANG ĐỢI ĐỐI THỦ...'}
                 </span>
              </div>
           </div>
           <button onClick={() => { setJoinedRoom(null); setGameState('ROOM_SELECTION'); }} className="mt-10 px-12 py-5 bg-slate-100 text-slate-400 rounded-3xl font-black uppercase text-xs italic">Hủy</button>
      </div>
    </div>
  );
};

export default MultiPlayerArenaManager;
