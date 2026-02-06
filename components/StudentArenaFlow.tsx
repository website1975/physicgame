
import React, { useState, useEffect, useRef } from 'react';
import { GameState, Teacher, QuestionType, Round } from '../types';
import { getRoomAssignments, fetchSetData, supabase } from '../services/supabaseService';

interface StudentArenaFlowProps {
  gameState: GameState;
  setGameState: (s: GameState) => void;
  playerName: string;
  studentGrade: string;
  currentTeacher: Teacher;
  onStartMatch: (data: any) => void;
  joinedRoom: any;
  setJoinedRoom: (room: any) => void;
  availableSets: any[];
  setAvailableSets: (sets: any[]) => void;
}

const ARENA_ROOMS = [
  { id: '1', name: 'Phòng đơn', code: 'ARENA_A', emoji: '🛡️', color: 'bg-blue-600', capacity: 1 },
  { id: '2', name: 'Phòng đôi', code: 'ARENA_B', emoji: '⚔️', color: 'bg-purple-600', capacity: 2 },
  { id: '3', name: 'Phòng 3', code: 'ARENA_C', emoji: '🏹', color: 'bg-emerald-600', capacity: 3 },
  { id: '4', name: 'Phòng 4', code: 'ARENA_D', emoji: '🔱', color: 'bg-amber-500', capacity: 4 },
  { id: '5', name: 'GV tổ chức', code: 'TEACHER_ROOM', emoji: '👨‍🏫', color: 'bg-slate-800', capacity: 2 },
];

const StudentArenaFlow: React.FC<StudentArenaFlowProps> = ({ 
  gameState, setGameState, playerName, studentGrade, currentTeacher, onStartMatch,
  joinedRoom, setJoinedRoom, availableSets, setAvailableSets
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [presentPlayers, setPresentPlayers] = useState<string[]>([]);
  const [uniqueId] = useState(() => Math.random().toString(36).substring(7));
  const channelRef = useRef<any>(null);
  const matchStartedRef = useRef(false);

  useEffect(() => {
    if (gameState === 'SET_SELECTION' && !joinedRoom) {
      setGameState('ROOM_SELECTION');
    }
  }, [gameState, joinedRoom]);

  const handleRoomJoin = async (room: any) => {
    setIsLoading(true);
    setError('');
    try {
      const assignments = await getRoomAssignments(currentTeacher.id, room.code);
      const fullSets = [];
      for (const item of assignments) {
        const data = await fetchSetData(item.set_id);
        if (data.grade === studentGrade) {
          fullSets.push({ id: item.set_id, assigned_at: item.assigned_at, ...data });
        }
      }
      if (fullSets.length > 0) {
        setAvailableSets(fullSets);
        setJoinedRoom(room);
        setGameState('SET_SELECTION');
      } else setError(`Khối ${studentGrade} chưa có đề tại ${room.name}.`);
    } catch (e) { setError('Lỗi kết nối CSDL'); }
    finally { setIsLoading(false); }
  };

  const getStats = (rounds: Round[]) => {
    let tn = 0, ds = 0, tl = 0, total = 0;
    rounds.forEach(r => {
      (r.problems || []).forEach(p => {
        total++;
        if (p.type === QuestionType.MULTIPLE_CHOICE) tn++;
        else if (p.type === QuestionType.TRUE_FALSE) ds++;
        else if (p.type === QuestionType.SHORT_ANSWER) tl++;
      });
    });
    return { tn, ds, tl, total, rounds: rounds.length };
  };

  useEffect(() => {
    if (gameState === 'WAITING_FOR_PLAYERS' && joinedRoom && joinedRoom.code !== 'ARENA_A') {
      const presenceKey = `${playerName}_${uniqueId}`;
      const channelName = `arena_${joinedRoom.code}_${currentTeacher.id}`;
      const channel = supabase.channel(channelName, {
        config: { presence: { key: presenceKey } }
      });

      matchStartedRef.current = false;
      let syncInterval: number | null = null;
      let masterData: any = null;
      const requiredCapacity = joinedRoom.capacity || 2;

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const playersKeys = Object.keys(state).sort();
          const playerNames = playersKeys.map(k => k.split('_')[0]);
          setPresentPlayers(playerNames);
          
          if (playersKeys.length >= requiredCapacity) {
            const isMaster = playersKeys[0] === presenceKey;
            
            // Chỉ bắt đầu nếu mình không phải là Master (nhận tín hiệu) hoặc mình là Master (phát tín hiệu)
            if (!isMaster && !matchStartedRef.current) {
              if (!syncInterval) {
                syncInterval = window.setInterval(() => {
                  if (matchStartedRef.current) return;
                  channel.send({
                    type: 'broadcast',
                    event: 'slave_ready',
                    payload: { from: playerName, id: uniqueId }
                  });
                }, 1000);
              }
            }
          } else {
            if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
          }
        })
        .on('broadcast', { event: 'slave_ready' }, ({ payload }) => {
          const state = channel.presenceState();
          const playersKeys = Object.keys(state).sort();
          const isMaster = playersKeys[0] === presenceKey;

          // Master chỉ phát lệnh khi đủ người
          if (isMaster && !matchStartedRef.current && playersKeys.length >= requiredCapacity && availableSets.length > 0) {
            if (!masterData) {
              const randomSet = availableSets[Math.floor(Math.random() * availableSets.length)];
              masterData = {
                setId: randomSet.id,
                title: randomSet.title,
                rounds: randomSet.rounds,
                opponentName: playersKeys.filter(k => k !== presenceKey).map(k => k.split('_')[0]).join(', '),
                joinedRoom
              };
            }

            channel.send({
              type: 'broadcast',
              event: 'match_start_signal',
              payload: { ...masterData, masterName: playerName }
            });

            setTimeout(() => {
              if (matchStartedRef.current) return;
              matchStartedRef.current = true;
              if (syncInterval) clearInterval(syncInterval);
              onStartMatch(masterData);
            }, 500);
          }
        })
        .on('broadcast', { event: 'match_start_signal' }, ({ payload }) => {
          if (matchStartedRef.current) return;

          const targetSet = availableSets.find(s => s.id === payload.setId);
          if (targetSet) {
            matchStartedRef.current = true;
            if (syncInterval) clearInterval(syncInterval);
            
            onStartMatch({
              setId: targetSet.id,
              title: targetSet.title,
              rounds: targetSet.rounds,
              opponentName: payload.masterName, // Trong 2+ người, opponentName sẽ là tên người tạo phòng/Master
              joinedRoom: payload.joinedRoom
            });
          }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ online_at: new Date().toISOString() });
          }
        });

      channelRef.current = channel;
      return () => { 
        if (syncInterval) clearInterval(syncInterval);
        supabase.removeChannel(channel); 
      };
    }
  }, [gameState, joinedRoom, availableSets, playerName, uniqueId]);

  if (gameState === 'ROOM_SELECTION') {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center justify-center relative">
        <div className="absolute top-8 right-8 z-50">
           <button 
            onClick={() => setGameState('LOBBY')}
            className="group flex items-center gap-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-8 py-4 rounded-2xl border-2 border-red-500/20 hover:border-red-500 transition-all font-black uppercase italic text-sm shadow-xl"
           >
             <span className="text-xl group-hover:rotate-12 transition-transform">🚪</span>
             <span>Thoát ra</span>
           </button>
        </div>

        <div className="text-center mb-12 animate-in slide-in-from-top-4 duration-500">
          <h2 className="text-6xl font-black text-white italic uppercase tracking-tighter">Hệ thống Đấu Trường</h2>
          <p className="text-blue-400 font-bold uppercase text-[10px] mt-2 tracking-[0.3em]">Chào mừng chiến binh: {playerName}</p>
        </div>

        {error && (
          <div className="mb-8 p-6 bg-red-500/20 text-red-400 rounded-[2rem] border-2 border-red-500/30 font-black uppercase italic text-xs animate-in zoom-in">
            ⚠️ {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 w-full max-w-7xl">
          {ARENA_ROOMS.map(room => (
            <button 
              key={room.code} 
              onClick={() => handleRoomJoin(room)} 
              disabled={isLoading}
              className={`bg-white p-8 rounded-[4rem] flex flex-col items-center gap-6 hover:scale-105 transition-all shadow-2xl group ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className={`text-5xl p-6 rounded-[2rem] ${room.color} text-white shadow-lg group-hover:rotate-12 transition-transform`}>{room.emoji}</div>
              <div className="font-black text-slate-800 uppercase italic text-lg leading-none">{room.name}</div>
              <div className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{room.code}</div>
            </button>
          ))}
        </div>
        
        {isLoading && (
          <div className="mt-12 flex flex-col items-center gap-4">
             <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
             <span className="font-black text-blue-400 uppercase italic text-[10px]">Đang mở cổng kết nối...</span>
          </div>
        )}
      </div>
    );
  }

  if (gameState === 'SET_SELECTION' && joinedRoom) {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center bg-slate-950 overflow-y-auto no-scrollbar">
        <div className="max-w-7xl w-full">
          <div className="flex justify-between items-start mb-16">
            <div className="text-left">
              <h2 className="text-6xl font-black text-white uppercase italic tracking-tighter">THƯ VIỆN ĐỀ THI</h2>
              <p className="text-blue-500 font-black uppercase italic text-2xl mt-2">PHÒNG {joinedRoom?.name?.toUpperCase()} – KHỐI {studentGrade}</p>
            </div>
            <button onClick={() => { setJoinedRoom(null); setGameState('ROOM_SELECTION'); }} className="px-10 py-4 bg-white/10 text-white rounded-2xl font-black uppercase italic border-2 border-white/20 hover:bg-white hover:text-slate-900 transition-all">QUAY LẠI ✕</button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-20">
            {availableSets.map((set, i) => {
              const stats = getStats(set.rounds || []);
              return (
                <div key={set.id} className="bg-white rounded-[3.5rem] p-10 border-4 border-slate-50 shadow-2xl flex flex-col min-h-[480px]">
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest italic">BỘ ĐỀ {i+1}</span>
                    <span className="text-2xl">📚</span>
                  </div>
                  <div className="mb-8">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase mb-1">TOPIC:</h4>
                    <div className="text-2xl font-black text-slate-800 uppercase italic leading-tight line-clamp-2">{set.title}</div>
                  </div>
                  <div className="space-y-4 mb-10 flex-1">
                    <div className="flex justify-between border-b-2 border-slate-50 pb-2"><span className="text-xs font-black text-slate-400 uppercase italic">Vòng:</span><span className="text-xl font-black text-slate-800 italic">{stats.rounds}</span></div>
                    <div className="flex justify-between border-b-2 border-slate-50 pb-2"><span className="text-xs font-black text-slate-400 uppercase italic">Số câu:</span><span className="text-xl font-black text-slate-800 italic">{stats.total}</span></div>
                    <div className="pt-4 grid grid-cols-3 gap-2 text-center">
                      <div className="bg-blue-50 p-2 rounded-xl"><div className="text-lg font-black text-blue-600 italic">{stats.tn}</div><div className="text-[8px] font-black text-blue-400 uppercase">TN</div></div>
                      <div className="bg-emerald-50 p-2 rounded-xl"><div className="text-lg font-black text-emerald-600 italic">{stats.ds}</div><div className="text-[8px] font-black text-emerald-400 uppercase">ĐS</div></div>
                      <div className="bg-purple-50 p-2 rounded-xl"><div className="text-lg font-black text-purple-600 italic">{stats.tl}</div><div className="text-[8px] font-black text-purple-400 uppercase">TL</div></div>
                    </div>
                  </div>
                  {joinedRoom.code === 'ARENA_A' ? (
                    <button onClick={() => onStartMatch({ setId: set.id, title: set.title, rounds: set.rounds, joinedRoom })} className="w-full py-5 bg-blue-600 text-white rounded-[2rem] font-black uppercase italic shadow-xl hover:scale-105 active:scale-95 transition-all">CHỌN ĐỀ ⚡</button>
                  ) : (
                    <div className="w-full py-4 bg-slate-50 text-slate-300 rounded-[2rem] font-black uppercase italic text-center text-xs border-2 border-dashed italic">Sẵn sàng chờ đối thủ</div>
                  )}
                </div>
              );
            })}
          </div>

          {joinedRoom.code !== 'ARENA_A' && (
            <div className="flex justify-center pb-20">
              <button onClick={() => setGameState('WAITING_FOR_PLAYERS')} className="px-28 py-10 bg-blue-600 text-white rounded-[3.5rem] font-black uppercase italic text-4xl shadow-2xl hover:scale-110 active:scale-95 transition-all border-b-[14px] border-blue-800">TÌM ĐỐI THỦ ⚔️</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (gameState === 'WAITING_FOR_PLAYERS') {
    const required = joinedRoom.capacity || 2;
    const slots = Array.from({ length: required });

    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-[4rem] p-8 md:p-12 shadow-2xl max-w-6xl w-full border-b-[12px] border-purple-600 animate-in zoom-in duration-500 flex flex-col lg:flex-row gap-10">
          
          <div className="flex-1">
             <h2 className="text-3xl font-black text-slate-800 uppercase italic mb-4">SẢNH CHỜ KẾT NỐI</h2>
             <div className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-8">PHÒNG {joinedRoom.name} - YÊU CẦU: {required} CHIẾN BINH</div>
             
             <div className="py-12 bg-slate-950 rounded-[3rem] text-white flex flex-col items-center gap-10 relative overflow-hidden">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 relative z-10 w-full px-10">
                   {slots.map((_, idx) => {
                      const pName = presentPlayers[idx];
                      const isMe = pName === playerName;
                      return (
                        <div key={idx} className="flex flex-col items-center gap-3">
                           <div className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl border-4 transition-all duration-500 
                             ${pName ? (isMe ? 'bg-blue-600 border-white shadow-[0_0_30px_#2563eb]' : 'bg-red-600 border-white shadow-[0_0_30px_#dc2626]') : 'bg-slate-800 border-slate-700 border-dashed opacity-40'}`}>
                             {pName ? '👤' : '?'}
                           </div>
                           <div className={`text-[10px] font-black uppercase italic truncate max-w-full ${pName ? 'text-white' : 'text-slate-600'}`}>
                             {pName || 'ĐANG ĐỢI...'}
                           </div>
                           {isMe && <div className="text-[8px] bg-blue-500 px-2 py-0.5 rounded font-black">BẠN</div>}
                        </div>
                      );
                   })}
                </div>
                
                <div className="flex flex-col items-center gap-3 relative z-10">
                   <div className="flex items-center gap-3">
                     {presentPlayers.length < required && <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>}
                     <span className={`font-black italic uppercase text-xl tracking-tighter transition-all ${presentPlayers.length >= required ? 'text-emerald-400' : 'text-white animate-pulse'}`}>
                       {presentPlayers.length >= required ? 'ĐỦ QUÂN SỐ - BẮT ĐẦU!' : `ĐANG ĐỢI THÊM ${required - presentPlayers.length} NGƯỜI...`}
                     </span>
                   </div>
                   <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">TIẾN ĐỘ: {presentPlayers.length}/{required}</div>
                </div>
             </div>
             <button onClick={() => setGameState('SET_SELECTION')} className="mt-8 px-10 py-4 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase text-xs italic hover:bg-red-500 hover:text-white transition-all">Hủy kết nối</button>
          </div>

          <div className="flex-1 bg-slate-50 rounded-[3rem] p-8 text-left border-4 border-white shadow-inner">
             <h3 className="text-2xl font-black text-slate-800 uppercase italic mb-6 flex items-center gap-3">
               <span className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center text-sm">📜</span>
               LUẬT CHƠI ĐẤU TRƯỜNG
             </h3>
             <ul className="space-y-4">
               {[
                 { t: "Bấm chuông", c: "Ai bấm chuông trước sẽ giành quyền trả lời câu hỏi hiện tại." },
                 { t: "Thời gian", c: "Bạn có 40 giây để suy nghĩ. Trả lời sai nhường lượt cho đối thủ." },
                 { t: "Điểm số", c: "Mỗi câu đúng nhận +100đ. Sai không bị trừ điểm nhưng mất lượt." },
                 { t: "Giải thích", c: "Sau mỗi câu sẽ có 15 giây để xem lời giải chi tiết từ hệ thống." },
                 { t: "Arena Lab", c: "Với các câu tự luận, hãy sử dụng phím mũi tên hoặc chuột để di chuyển và bắn đáp án." }
               ].map((item, idx) => (
                 <li key={idx} className="flex gap-4">
                    <span className="w-6 h-6 bg-slate-900 text-white rounded-full flex items-center justify-center text-[10px] font-black shrink-0">{idx+1}</span>
                    <div>
                       <span className="block font-black text-slate-800 uppercase italic text-[11px] mb-1">{item.t}</span>
                       <p className="text-xs font-bold text-slate-500 italic">{item.c}</p>
                    </div>
                 </li>
               ))}
             </ul>
          </div>

        </div>
      </div>
    );
  }

  return null;
};

export default StudentArenaFlow;
