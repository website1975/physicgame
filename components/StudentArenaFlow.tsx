
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
  { id: '1', name: 'Phòng đơn', code: 'ARENA_A', emoji: '🛡️', color: 'bg-blue-600' },
  { id: '2', name: 'Phòng đôi', code: 'ARENA_B', emoji: '⚔️', color: 'bg-purple-600' },
  { id: '3', name: 'Phòng 3', code: 'ARENA_C', emoji: '🏹', color: 'bg-emerald-600' },
  { id: '4', name: 'Phòng 4', code: 'ARENA_D', emoji: '🔱', color: 'bg-amber-500' },
  { id: '5', name: 'GV tổ chức', code: 'TEACHER_ROOM', emoji: '👨‍🏫', color: 'bg-slate-800' },
];

const StudentArenaFlow: React.FC<StudentArenaFlowProps> = ({ 
  gameState, setGameState, playerName, studentGrade, currentTeacher, onStartMatch,
  joinedRoom, setJoinedRoom, availableSets, setAvailableSets
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [opponentName, setOpponentName] = useState('');
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

  // Logic Handshake: Đảm bảo cả 2 bên cùng sẵn sàng mới vào trận
  useEffect(() => {
    if (gameState === 'WAITING_FOR_PLAYERS' && joinedRoom && joinedRoom.code !== 'ARENA_A') {
      const presenceKey = `${playerName}_${uniqueId}`;
      const channel = supabase.channel(`arena_${joinedRoom.code}_${currentTeacher.id}`, {
        config: { presence: { key: presenceKey } }
      });

      matchStartedRef.current = false;
      let syncInterval: number | null = null;

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const players = Object.keys(state).sort();
          
          if (players.length >= 2) {
            const isMaster = players[0] === presenceKey;
            const otherKey = players.find(p => p !== presenceKey);
            const otherName = otherKey?.split('_')[0] || '';
            
            // Cập nhật tên đối thủ ngay khi thấy trong sảnh
            setOpponentName(otherName);

            // Bước 1: Nếu là Slave (người vào sau), gửi tín hiệu "EM ĐÃ SẴN SÀNG" cho Master
            if (!isMaster && !matchStartedRef.current) {
              if (!syncInterval) {
                syncInterval = window.setInterval(() => {
                  channel.send({
                    type: 'broadcast',
                    event: 'slave_ready',
                    payload: { from: playerName }
                  });
                }, 1000);
              }
            }
          } else {
            setOpponentName('');
            if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
          }
        })
        // Bước 2: Master nhận lời chào từ Slave và phát lệnh BẮT ĐẦU TRẬN ĐẤU
        .on('broadcast', { event: 'slave_ready' }, ({ payload }) => {
          const state = channel.presenceState();
          const players = Object.keys(state).sort();
          const isMaster = players[0] === presenceKey;

          if (isMaster && !matchStartedRef.current && availableSets.length > 0) {
            const randomSet = availableSets[Math.floor(Math.random() * availableSets.length)];
            
            // Master gửi lệnh chốt đề cho Slave
            channel.send({ 
              type: 'broadcast', 
              event: 'match_start', 
              payload: { setId: randomSet.id, masterName: playerName, joinedRoom } 
            });

            // Master tự vào trận luôn
            matchStartedRef.current = true;
            onStartMatch({ 
              setId: randomSet.id, 
              title: randomSet.title, 
              rounds: randomSet.rounds, 
              opponentName: payload.from, 
              joinedRoom 
            });
          }
        })
        // Bước 3: Slave nhận lệnh từ Master và vào trận
        .on('broadcast', { event: 'match_start' }, ({ payload }) => {
          if (matchStartedRef.current) return;
          
          const targetSet = availableSets.find(s => s.id === payload.setId);
          if (targetSet) {
            matchStartedRef.current = true;
            if (syncInterval) clearInterval(syncInterval);
            
            onStartMatch({ 
              setId: targetSet.id, 
              title: targetSet.title, 
              rounds: targetSet.rounds, 
              opponentName: payload.masterName, 
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
      <div className="min-h-screen p-8 flex flex-col items-center justify-center">
        <h2 className="text-4xl font-black text-white italic uppercase mb-12">Hệ thống Đấu Trường</h2>
        {error && <div className="mb-8 p-4 bg-red-500/20 text-red-400 rounded-2xl border border-red-500/30 font-bold">{error}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 w-full max-w-7xl">
          {ARENA_ROOMS.map(room => (
            <button key={room.code} onClick={() => handleRoomJoin(room)} className="bg-white p-8 rounded-[4rem] flex flex-col items-center gap-6 hover:scale-105 transition-all shadow-2xl group">
              <div className={`text-5xl p-6 rounded-[2rem] ${room.color} text-white shadow-lg group-hover:rotate-12 transition-transform`}>{room.emoji}</div>
              <div className="font-black text-slate-800 uppercase italic text-lg">{room.name}</div>
            </button>
          ))}
        </div>
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
            <button onClick={() => { setJoinedRoom(null); setGameState('ROOM_SELECTION'); }} className="px-10 py-4 bg-white/10 text-white rounded-2xl font-black uppercase italic border-2 border-white/20 hover:bg-white hover:text-slate-900 transition-all">THOÁT ✕</button>
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
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-5xl w-full border-b-[12px] border-purple-600 animate-in zoom-in duration-500">
          <h2 className="text-4xl font-black text-slate-800 uppercase italic mb-10 leading-none">QUÉT TÌM CHIẾN BINH...</h2>
          <div className="py-16 bg-slate-950 rounded-[3rem] text-white flex flex-col items-center gap-12 relative overflow-hidden">
             <div className="flex items-center gap-12 relative z-10">
                <div className="w-32 h-32 bg-blue-600 rounded-full flex items-center justify-center text-5xl shadow-[0_0_40px_#2563eb] border-4 border-white">👤</div>
                <div className="text-5xl font-black italic text-slate-700 animate-pulse">VS</div>
                <div className={`w-32 h-32 rounded-full flex items-center justify-center text-5xl border-4 transition-all duration-500 ${opponentName ? 'bg-red-600 border-white shadow-[0_0_50px_rgba(239,68,68,0.8)] scale-110' : 'bg-slate-800 border-slate-600 border-dashed'}`}>
                  {opponentName ? '👤' : '?'}
                </div>
             </div>
             <div className="flex flex-col items-center gap-4 relative z-10">
                <div className="flex items-center gap-4">
                  {!opponentName && <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>}
                  <span className={`font-black italic uppercase text-2xl tracking-tighter transition-all ${opponentName ? 'text-red-400' : 'text-white animate-pulse'}`}>
                    {opponentName ? `ĐÃ KẾT NỐI VỚI ${opponentName.toUpperCase()}!` : 'ĐANG QUÉT ĐỐI THỦ...'}
                  </span>
                </div>
                <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest italic">
                  {opponentName ? 'Hai máy đang đồng bộ dữ liệu trận đấu...' : 'Chờ chiến binh khác vào sảnh chờ này'}
                </p>
             </div>
          </div>
          <button onClick={() => setGameState('SET_SELECTION')} className="mt-8 px-10 py-4 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase text-xs italic hover:bg-red-500 hover:text-white transition-all">Hủy tìm kiếm</button>
        </div>
      </div>
    );
  }

  return null;
};

export default StudentArenaFlow;
