
import React, { useState, useEffect, useRef } from 'react';
import { GameState, Teacher, MatchData } from '../../types';
// Fixed: getRoomAssignments was not exported from supabaseService. Using getRoomAssignmentsWithMeta instead.
import { getRoomAssignmentsWithMeta, supabase } from '../../services/supabaseService';

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

        // Nếu đủ người và là người dẫn đầu phòng (Master)
        if (playerInfos.length >= capacity && !matchStartedRef.current && isMaster && !heartbeatIntervalRef.current) {
          try {
            // Fixed: use getRoomAssignmentsWithMeta which returns set objects with meta data already attached
            const assignments = await getRoomAssignmentsWithMeta(currentTeacher.id, joinedRoom.code);
            
            // Lọc các bộ đề theo khối lớp học sinh
            const validSets = assignments.filter(s => String(s.grade) === String(studentGrade));

            // Nếu giáo viên đã gán đề, chọn một bộ đề ngẫu nhiên để bắt đầu trận đấu
            if (validSets.length > 0) {
              const selectedSet = validSets[Math.floor(Math.random() * validSets.length)];
              // Trong inferMetadata, rounds được lưu trong trường data
              const rounds = selectedSet.data || [];
              const allPlayersPayload = playerInfos.map(p => ({ id: p.id, name: p.name }));
              const syncStartTime = Date.now() + 4000;

              const sendSignal = () => {
                if (matchStartedRef.current) return;
                channel.send({
                  type: 'broadcast',
                  event: 'match_start_signal',
                  payload: {
                    setId: selectedSet.id,
                    rounds: rounds,
                    title: selectedSet.title,
                    allPlayers: allPlayersPayload,
                    startTime: syncStartTime
                  }
                });
              };

              sendSignal();
              heartbeatIntervalRef.current = setInterval(sendSignal, 800);

              const checkStart = setInterval(() => {
                if (Date.now() >= syncStartTime) {
                  clearInterval(checkStart);
                  if (matchStartedRef.current) return;
                  matchStartedRef.current = true;
                  if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
                  const opponents = allPlayersPayload.filter(p => p.id !== uniqueId);
                  onStartMatch({ 
                    setId: selectedSet.id, title: selectedSet.title, rounds: rounds, 
                    opponents, joinedRoom, myId: uniqueId, startIndex: 0 
                  });
                }
              }, 100);
            } else {
              // Có thể thông báo cho học sinh là chưa có đề gán
              console.warn("Giáo viên chưa gán đề cho phòng này!");
            }
          } catch (e) {
            console.error("Lỗi khởi tạo trận đấu:", e);
          }
        }
      })
      .on('broadcast', { event: 'match_start_signal' }, ({ payload }) => {
        if (matchStartedRef.current) return;
        
        matchStartedRef.current = true;
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
        const opponents = (payload.allPlayers || []).filter((p: any) => p.id !== uniqueId).map((p: any) => ({ id: p.id, name: p.name }));
        
        const checkStart = setInterval(() => {
          if (Date.now() >= payload.startTime) {
            clearInterval(checkStart);
            onStartMatch({ 
              setId: payload.setId, title: payload.title, rounds: payload.rounds, 
              opponents, joinedRoom, myId: uniqueId, startIndex: 0
            });
          }
        }, 100);
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
  }, [joinedRoom.code, currentTeacher.id, uniqueId, playerName, studentGrade, onStartMatch, joinedRoom, setJoinedRoom]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
      <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-4xl w-full border-b-[12px] border-purple-600 flex flex-col items-center">
           <div className="text-6xl mb-6">📡</div>
           <h2 className="text-3xl font-black text-slate-800 uppercase italic mb-8 text-center tracking-tighter">ARENA SYNC</h2>
           <div className="w-full py-12 bg-slate-900 rounded-[3rem] text-white flex flex-col items-center gap-10">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8 px-10">
                 {presentPlayers.map((p, i) => (
                   <div key={i} className="flex flex-col items-center gap-4 animate-in zoom-in">
                      <div className="w-20 h-20 rounded-full bg-blue-600 border-4 border-white shadow-lg flex items-center justify-center text-3xl">👤</div>
                      <div className="text-xs font-black uppercase italic text-white text-center">
                        {p.name === playerName ? 'BẠN' : p.name}
                      </div>
                   </div>
                 ))}
              </div>
              <div className="flex flex-col items-center gap-4">
                 <div className="flex items-center gap-4 bg-white/10 px-8 py-4 rounded-full border border-white/10">
                    <div className="w-5 h-5 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="font-black italic uppercase text-lg text-white tracking-widest">
                      {presentPlayers.length >= (joinedRoom.capacity || 2) ? 'ĐANG KẾT NỐI TRẬN ĐẤU...' : 'ĐANG ĐỢI ĐỐI THỦ...'}
                    </span>
                 </div>
              </div>
           </div>
           <button onClick={() => { setJoinedRoom(null); setGameState('ROOM_SELECTION'); }} className="mt-10 px-12 py-5 bg-slate-100 text-slate-400 rounded-3xl font-black uppercase text-xs italic">Quay lại</button>
      </div>
    </div>
  );
};

export default MultiPlayerArenaManager;
