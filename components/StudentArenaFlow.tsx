
import React, { useState, useEffect, useRef } from 'react';
import { GameState, Teacher, QuestionType, Round, MatchData } from '../types';
import { getRoomAssignments, fetchSetData, supabase, fetchTeacherByMaGV } from '../services/supabaseService';
import KeywordSelector from './KeywordSelector';

interface StudentArenaFlowProps {
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
}

interface PlayerInfo {
  name: string;
  shortId: string;
  fullKey: string;
  id: string;
}

const ARENA_ROOMS = [
  { id: '1', name: 'Phòng đơn', code: 'ARENA_A', emoji: '🛡️', color: 'bg-blue-600', capacity: 1, desc: 'Luyện tập cá nhân' },
  { id: '2', name: 'Phòng đôi', code: 'ARENA_B', emoji: '⚔️', color: 'bg-purple-600', capacity: 2, desc: 'Đấu 1 vs 1' },
  { id: '3', name: 'Phòng 3', code: 'ARENA_C', emoji: '🏹', color: 'bg-emerald-600', capacity: 3, desc: 'Hỗn chiến 3 người' },
  { id: '4', name: 'Phòng 4', code: 'ARENA_D', emoji: '🔱', color: 'bg-amber-500', capacity: 4, desc: 'Tứ hùng tranh tài' },
  { id: '5', name: 'GV tổ chức', code: 'TEACHER_ROOM', emoji: '👨‍🏫', color: 'bg-slate-800', capacity: 100, desc: 'Phòng học tương tác' },
];

const StudentArenaFlow: React.FC<StudentArenaFlowProps> = ({ 
  gameState, setGameState, playerName, studentGrade, currentTeacher, onStartMatch,
  joinedRoom, setJoinedRoom, availableSets, setAvailableSets
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [presentPlayers, setPresentPlayers] = useState<PlayerInfo[]>([]);
  const [roomOccupancy, setRoomOccupancy] = useState<Record<string, number>>({});
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [targetTeacher, setTargetTeacher] = useState<Teacher | null>(null);
  const [uniqueId] = useState(() => Math.random().toString(36).substring(7));
  
  const [selectedSet, setSelectedSet] = useState<any>(null);
  const [selectedQuantities, setSelectedQuantities] = useState<string[]>([]);
  const [selectedFormulas, setSelectedFormulas] = useState<string[]>([]);

  const channelRef = useRef<any>(null);
  const matchStartedRef = useRef(false);
  const retryIntervalRef = useRef<any>(null);
  const shortId = uniqueId.slice(-3).toUpperCase();

  useEffect(() => {
    if (gameState === 'ROOM_SELECTION') {
      const channels = ARENA_ROOMS.map(room => {
        if (room.code === 'TEACHER_ROOM') return null;
        const channelName = `arena_${room.code}_${currentTeacher.id}`;
        const chan = supabase.channel(channelName);
        
        chan.on('presence', { event: 'sync' }, () => {
          const state = chan.presenceState();
          setRoomOccupancy(prev => ({
            ...prev,
            [room.code]: Object.keys(state).length
          }));
        }).subscribe();
        
        return chan;
      }).filter(Boolean);

      return () => {
        channels.forEach(ch => supabase.removeChannel(ch!));
      };
    }
  }, [gameState, currentTeacher.id]);

  const handleRoomJoin = async (room: any) => {
    if (room.code === 'TEACHER_ROOM') {
      setJoinedRoom(room);
      setGameState('ENTER_CODE');
      return;
    }
    if (roomOccupancy[room.code] >= room.capacity) {
      setError(`Phòng ${room.name} đã đầy. Vui lòng chọn phòng khác!`);
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const assignments = await getRoomAssignments(currentTeacher.id, room.code);
      const fullSets = [];
      for (const item of assignments) {
        const data = await fetchSetData(item.set_id);
        if (String(data.grade) === String(studentGrade)) {
          let qCount = 0;
          (data.rounds || []).forEach((r: any) => { qCount += (r.problems?.length || 0); });
          fullSets.push({ ...data, id: item.set_id, question_count: qCount, round_count: (data.rounds || []).length });
        }
      }
      setAvailableSets(fullSets);
      setJoinedRoom(room);
      setGameState(room.code === 'ARENA_A' ? 'SET_SELECTION' : 'WAITING_FOR_PLAYERS');
    } catch (e) { setError('Lỗi kết nối CSDL'); } 
    finally { setIsLoading(false); }
  };

  const handleJoinTeacherRoom = async () => {
    setIsLoading(true);
    setError('');
    try {
      const teacher = await fetchTeacherByMaGV(roomCodeInput);
      if (!teacher) { setError('Mã GV không tồn tại!'); return; }
      setTargetTeacher(teacher);
      setGameState('WAITING_FOR_PLAYERS');
    } catch (e) { setError('Lỗi hệ thống'); } 
    finally { setIsLoading(false); }
  };

  useEffect(() => {
    if (gameState === 'WAITING_FOR_PLAYERS' && joinedRoom) {
      const isTeacherRoom = joinedRoom.code === 'TEACHER_ROOM';
      const myPresenceKey = `${playerName}_${uniqueId}`;
      const channelName = isTeacherRoom 
        ? `control_TEACHER_ROOM_${targetTeacher?.id}` 
        : `arena_${joinedRoom.code}_${currentTeacher.id}`;
      
      const channel = supabase.channel(channelName, { config: { presence: { key: myPresenceKey } } });
      matchStartedRef.current = false;

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const playersKeys = Object.keys(state).sort();
          
          const playerInfos = playersKeys.filter(k => k !== 'teacher').map(k => ({
            name: k.split('_')[0],
            shortId: k.split('_')[1]?.slice(-3).toUpperCase() || '???',
            id: k.split('_')[1],
            fullKey: k
          }));
          setPresentPlayers(playerInfos);
          
          const required = joinedRoom.capacity || 2;
          if (!isTeacherRoom && playerInfos.length >= required && !matchStartedRef.current) {
            const isMaster = playersKeys[0] === myPresenceKey;
            if (isMaster && availableSets.length > 0 && !retryIntervalRef.current) {
              const selectedSet = availableSets[Math.floor(Math.random() * availableSets.length)];
              const opponents = playerInfos.filter(p => p.id !== uniqueId).map(p => ({ id: p.id, name: p.name }));

              // Cơ chế Gửi lặp lại: Đảm bảo mọi người đều nhận được tin nhắn
              const sendStartSignal = () => {
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

              sendStartSignal();
              retryIntervalRef.current = setInterval(sendStartSignal, 1500);
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
        .on('broadcast', { event: 'teacher_start_game' }, ({ payload }) => {
          if (!isTeacherRoom || matchStartedRef.current) return;
          matchStartedRef.current = true;
          onStartMatch({ setId: payload.setId, title: payload.title, rounds: payload.rounds, joinedRoom, opponents: [{ id: 'class', name: 'Cả lớp' }], startIndex: payload.currentQuestionIndex || 0, myId: uniqueId });
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') await channel.track({ role: 'student', online_at: new Date().toISOString() });
        });

      channelRef.current = channel;
      return () => { 
        if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
        supabase.removeChannel(channel); 
      };
    }
  }, [gameState, joinedRoom, targetTeacher, playerName, uniqueId, availableSets, currentTeacher.id, onStartMatch]);

  if (gameState === 'ROOM_SELECTION') {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center justify-center bg-slate-950">
        <div className="absolute top-8 right-8"><button onClick={() => setGameState('LOBBY')} className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-8 py-4 rounded-2xl border-2 border-red-500/20 transition-all font-black uppercase italic text-sm">🚪 Thoát</button></div>
        <div className="text-center mb-12"><h2 className="text-6xl font-black text-white italic uppercase tracking-tighter">Hệ thống Đấu Trường</h2><p className="text-blue-400 font-bold uppercase text-[10px] mt-2 tracking-[0.3em]">Chiến binh: {playerName} #{shortId}</p></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 w-full max-w-7xl">
          {ARENA_ROOMS.map(room => (
            <button key={room.code} onClick={() => handleRoomJoin(room)} disabled={isLoading} className="bg-white p-8 rounded-[4rem] flex flex-col items-center gap-6 hover:scale-105 transition-all shadow-2xl group relative">
              <div className="absolute top-6 right-6 px-3 py-1 rounded-full font-black text-[10px] bg-emerald-500 text-white border-2 border-emerald-400">{roomOccupancy[room.code] || 0}/{room.capacity}</div>
              <div className={`text-5xl p-6 rounded-[2rem] ${room.color} text-white shadow-lg`}>{room.emoji}</div>
              <div className="font-black text-slate-800 uppercase italic text-lg">{room.name}</div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">{room.desc}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (gameState === 'ENTER_CODE') {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center justify-center bg-slate-950">
        <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-md w-full text-center">
           <div className="text-6xl mb-6">🔑</div>
           <h2 className="text-3xl font-black text-slate-800 uppercase italic mb-4">MÃ PHÒNG GIÁO VIÊN</h2>
           <input type="text" className="w-full p-6 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-center text-3xl uppercase mb-8" placeholder="MÃ GV..." value={roomCodeInput} onChange={e => setRoomCodeInput(e.target.value.toUpperCase())} />
           <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setGameState('ROOM_SELECTION')} className="py-5 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase italic">Hủy</button>
              <button onClick={handleJoinTeacherRoom} className="py-5 bg-slate-900 text-white rounded-2xl font-black uppercase italic shadow-lg">VÀO PHÒNG</button>
           </div>
        </div>
      </div>
    );
  }

  if (gameState === 'SET_SELECTION') {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center bg-slate-950">
        <div className="max-w-7xl w-full flex justify-between items-start mb-16">
          <h2 className="text-6xl font-black text-white uppercase italic">LUYỆN TẬP</h2>
          <button onClick={() => setGameState('ROOM_SELECTION')} className="px-10 py-4 bg-white/10 text-white rounded-2xl font-black uppercase italic">QUAY LẠI ✕</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {availableSets.map((set) => (
            <div key={set.id} className="bg-white p-8 rounded-[3.5rem] border-4 border-slate-50 shadow-2xl flex flex-col">
              <h4 className="text-2xl font-black text-slate-800 uppercase italic mb-10 leading-tight">{set.title}</h4>
              <button onClick={() => { setSelectedSet(set); setGameState('KEYWORD_SELECTION'); }} className="mt-auto w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase italic shadow-lg">BẮT ĐẦU</button>
            </div>
          ))}
        </div>
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

  if (gameState === 'WAITING_FOR_PLAYERS') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
        <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-4xl w-full border-b-[12px] border-purple-600 flex flex-col items-center">
             <h2 className="text-3xl font-black text-slate-800 uppercase italic mb-8">SẢNH CHỜ ARENA</h2>
             <div className="w-full py-12 bg-slate-950 rounded-[3rem] text-white flex flex-col items-center gap-10">
                <div className="grid grid-cols-4 gap-6 px-10">
                   {presentPlayers.map((p, i) => (
                     <div key={i} className="flex flex-col items-center gap-3">
                        <div className="w-16 h-16 rounded-full bg-blue-600 border-4 border-white shadow-lg flex items-center justify-center text-2xl">👤</div>
                        <div className="text-[10px] font-black uppercase italic text-white text-center">{p.name}<br/><span className="opacity-40 text-[7px]">#{p.shortId}</span></div>
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
                   <span className="font-black italic uppercase text-xl text-white animate-pulse">ĐANG ĐỢI ĐỐI THỦ...</span>
                </div>
             </div>
             <button onClick={() => { setJoinedRoom(null); setGameState('ROOM_SELECTION'); }} className="mt-8 px-10 py-4 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase text-xs italic">Rời phòng</button>
        </div>
      </div>
    );
  }

  return null;
};

export default StudentArenaFlow;
