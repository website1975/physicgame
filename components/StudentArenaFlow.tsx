
import React, { useState, useEffect, useRef } from 'react';
import { GameState, Teacher, QuestionType, Round } from '../types';
import { getRoomAssignments, fetchSetData, supabase, fetchTeacherByMaGV } from '../services/supabaseService';

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
  const [presentPlayers, setPresentPlayers] = useState<string[]>([]);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [targetTeacher, setTargetTeacher] = useState<Teacher | null>(null);
  const [uniqueId] = useState(() => Math.random().toString(36).substring(7));
  const channelRef = useRef<any>(null);
  const matchStartedRef = useRef(false);

  useEffect(() => {
    if (gameState === 'SET_SELECTION' && !joinedRoom) {
      setGameState('ROOM_SELECTION');
    }
  }, [gameState, joinedRoom]);

  const handleRoomJoin = async (room: any) => {
    if (room.code === 'TEACHER_ROOM') {
      setJoinedRoom(room);
      setGameState('ENTER_CODE');
      return;
    }

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
      } else setError(`Thầy/Cô chưa gán đề Khối ${studentGrade} vào ${room.name}.`);
    } catch (e) { setError('Lỗi kết nối CSDL'); }
    finally { setIsLoading(false); }
  };

  const handleJoinTeacherRoom = async () => {
    setIsLoading(true);
    setError('');
    try {
      const teacher = await fetchTeacherByMaGV(roomCodeInput);
      if (!teacher) {
        setError('Không tìm thấy phòng của Thầy/Cô này. Vui lòng kiểm tra lại mã!');
        setIsLoading(false);
        return;
      }
      setTargetTeacher(teacher);
      setGameState('WAITING_FOR_PLAYERS');
    } catch (e) {
      setError('Lỗi hệ thống khi kết nối phòng.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (gameState === 'WAITING_FOR_PLAYERS' && joinedRoom) {
      const isTeacherRoom = joinedRoom.code === 'TEACHER_ROOM';
      const presenceKey = `${playerName}_${uniqueId}`;
      const channelName = isTeacherRoom 
        ? `control_TEACHER_ROOM_${targetTeacher?.id}` 
        : `arena_${joinedRoom.code}_${currentTeacher.id}`;
      
      const channel = supabase.channel(channelName, {
        config: { presence: { key: presenceKey } }
      });

      matchStartedRef.current = false;
      let syncInterval: number | null = null;
      const requiredCapacity = joinedRoom.capacity || 2;

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const playersKeys = Object.keys(state).sort();
          const playerNames = playersKeys.filter(k => k !== 'teacher').map(k => k.split('_')[0]);
          setPresentPlayers(playerNames);
          
          if (!isTeacherRoom && playersKeys.length >= requiredCapacity) {
            const isMaster = playersKeys[0] === presenceKey;
            if (!isMaster && !matchStartedRef.current && !syncInterval) {
              syncInterval = window.setInterval(() => {
                if (matchStartedRef.current) return;
                channel.send({ type: 'broadcast', event: 'slave_ready', payload: { from: playerName, id: uniqueId } });
              }, 1000);
            }
          }
        })
        .on('broadcast', { event: 'match_start_signal' }, ({ payload }) => {
          if (isTeacherRoom || matchStartedRef.current) return;
          const targetSet = availableSets.find(s => s.id === payload.setId);
          if (targetSet) {
            matchStartedRef.current = true;
            if (syncInterval) clearInterval(syncInterval);
            onStartMatch({ setId: targetSet.id, title: targetSet.title, rounds: targetSet.rounds, opponentName: payload.masterName, joinedRoom: payload.joinedRoom });
          }
        })
        .on('broadcast', { event: 'teacher_start_game' }, ({ payload }) => {
          if (!isTeacherRoom || matchStartedRef.current) return;
          matchStartedRef.current = true;
          // NHẬN currentQuestionIndex ĐỂ SYNC VỚI GV
          onStartMatch({ 
            setId: payload.setId, 
            title: payload.title, 
            rounds: payload.rounds, 
            joinedRoom: joinedRoom, 
            opponentName: "Cả lớp",
            startIndex: payload.currentQuestionIndex || 0 
          });
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ role: 'student', online_at: new Date().toISOString() });
          }
        });

      channelRef.current = channel;
      return () => { 
        if (syncInterval) clearInterval(syncInterval);
        supabase.removeChannel(channel); 
      };
    }
  }, [gameState, joinedRoom, targetTeacher, playerName, uniqueId, availableSets]);

  if (gameState === 'ROOM_SELECTION') {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center justify-center relative">
        <div className="absolute top-8 right-8 z-50">
           <button onClick={() => setGameState('LOBBY')} className="group flex items-center gap-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-8 py-4 rounded-2xl border-2 border-red-500/20 hover:border-red-500 transition-all font-black uppercase italic text-sm shadow-xl">
             <span>🚪</span> <span>Thoát ra</span>
           </button>
        </div>
        <div className="text-center mb-12">
          <h2 className="text-6xl font-black text-white italic uppercase tracking-tighter">Hệ thống Đấu Trường</h2>
          <p className="text-blue-400 font-bold uppercase text-[10px] mt-2 tracking-[0.3em]">Mã Arena: {currentTeacher.magv} – Chiến binh: {playerName}</p>
        </div>
        {error && <div className="mb-8 p-6 bg-red-500/20 text-red-400 rounded-[2rem] border-2 border-red-500/30 font-black uppercase italic text-xs">⚠️ {error}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 w-full max-w-7xl">
          {ARENA_ROOMS.map(room => (
            <button key={room.code} onClick={() => handleRoomJoin(room)} disabled={isLoading} className={`bg-white p-8 rounded-[4rem] flex flex-col items-center gap-6 hover:scale-105 transition-all shadow-2xl group ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <div className={`text-5xl p-6 rounded-[2rem] ${room.color} text-white shadow-lg group-hover:rotate-12 transition-transform`}>{room.emoji}</div>
              <div className="font-black text-slate-800 uppercase italic text-lg leading-none">{room.name}</div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center px-4">{room.desc}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (gameState === 'ENTER_CODE') {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center justify-center">
        <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-md w-full text-center border-b-[12px] border-slate-900 animate-in zoom-in duration-300">
           <div className="text-6xl mb-6">🔑</div>
           <h2 className="text-3xl font-black text-slate-800 uppercase italic mb-4">MÃ PHÒNG GIÁO VIÊN</h2>
           <p className="text-slate-400 font-bold text-[10px] uppercase mb-8 tracking-widest">Nhập mã đấu trường của Thầy/Cô cung cấp</p>
           
           <input 
            type="text" 
            className="w-full p-6 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-center text-3xl uppercase outline-none focus:border-slate-900 mb-8" 
            placeholder="MÃ GV..." 
            value={roomCodeInput} 
            onChange={e => setRoomCodeInput(e.target.value.toUpperCase())}
           />

           <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setGameState('ROOM_SELECTION')} className="py-5 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase italic">Hủy</button>
              <button 
                onClick={handleJoinTeacherRoom} 
                disabled={isLoading || !roomCodeInput}
                className="py-5 bg-slate-900 text-white rounded-2xl font-black uppercase italic shadow-lg hover:scale-105 transition-all"
              >
                {isLoading ? '...' : 'VÀO PHÒNG'}
              </button>
           </div>
           {error && <p className="mt-6 text-red-500 font-bold text-xs uppercase">{error}</p>}
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
            <button onClick={() => { setJoinedRoom(null); setGameState('ROOM_SELECTION'); }} className="px-10 py-4 bg-white/10 text-white rounded-2xl font-black uppercase italic border-2 border-white/20 hover:bg-white hover:text-slate-900 transition-all">QUAY LẠI ✕</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-20">
            {availableSets.map((set, i) => (
              <div key={set.id} className="bg-white rounded-[3.5rem] p-10 border-4 border-slate-50 shadow-2xl flex flex-col min-h-[400px]">
                <div className="flex justify-between items-center mb-6"><span className="text-[10px] font-black text-blue-600 uppercase tracking-widest italic">BỘ ĐỀ {i+1}</span><span className="text-2xl">📚</span></div>
                <div className="mb-8 flex-1"><h4 className="text-[10px] font-black text-slate-400 uppercase mb-1">TOPIC:</h4><div className="text-2xl font-black text-slate-800 uppercase italic leading-tight line-clamp-2">{set.title}</div></div>
                <button onClick={() => onStartMatch({ setId: set.id, title: set.title, rounds: set.rounds, joinedRoom })} className="w-full py-5 bg-blue-600 text-white rounded-[2rem] font-black uppercase italic shadow-xl hover:scale-105 active:scale-95 transition-all">CHỌN ĐỀ ⚡</button>
              </div>
            ))}
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
    const isTeacherRoom = joinedRoom.code === 'TEACHER_ROOM';
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-6xl w-full border-b-[12px] border-purple-600 animate-in zoom-in duration-500 flex flex-col lg:flex-row gap-10">
          <div className="flex-1">
             <h2 className="text-3xl font-black text-slate-800 uppercase italic mb-4">SẢNH CHỜ KẾT NỐI</h2>
             <div className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-8">
               {isTeacherRoom ? `PHÒNG THẦY/CÔ: ${targetTeacher?.tengv?.toUpperCase()}` : `PHÒNG ${joinedRoom.name}`}
             </div>
             <div className="py-12 bg-slate-950 rounded-[3rem] text-white flex flex-col items-center gap-10">
                <div className="grid grid-cols-4 gap-6 px-10">
                   {presentPlayers.map((p, i) => (
                     <div key={i} className="flex flex-col items-center gap-3">
                        <div className="w-16 h-16 rounded-full bg-blue-600 border-4 border-white shadow-lg flex items-center justify-center text-2xl">👤</div>
                        <div className="text-[8px] font-black uppercase italic text-white truncate max-w-full">{p}</div>
                     </div>
                   ))}
                </div>
                <div className="flex flex-col items-center gap-3">
                   <div className="flex items-center gap-3">
                     <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                     <span className="font-black italic uppercase text-xl text-white animate-pulse">
                       {isTeacherRoom ? 'ĐANG ĐỢI THẦY/CÔ KHỞI CHẠY...' : 'ĐANG GHÉP CẶP...'}
                     </span>
                   </div>
                   <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">ĐÃ KẾT NỐI: {presentPlayers.length} CHIẾN BINH</div>
                </div>
             </div>
             <button onClick={() => setGameState('ROOM_SELECTION')} className="mt-8 px-10 py-4 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase text-xs italic hover:bg-red-500 hover:text-white transition-all">Rời phòng</button>
          </div>
          <div className="flex-1 bg-slate-50 rounded-[3rem] p-8 text-left">
             <h3 className="text-2xl font-black text-slate-800 uppercase italic mb-6">📜 NỘI QUY ARENA LIVE</h3>
             <ul className="space-y-4">
                <li className="flex gap-4"><span className="w-6 h-6 bg-slate-900 text-white rounded-full flex items-center justify-center text-[10px] font-black shrink-0">1</span><p className="text-xs font-bold text-slate-500 italic">Thầy/Cô là người điều phối trận đấu. Chỉ Thầy/Cô mới có quyền chuyển câu hỏi.</p></li>
                <li className="flex gap-4"><span className="w-6 h-6 bg-slate-900 text-white rounded-full flex items-center justify-center text-[10px] font-black shrink-0">2</span><p className="text-xs font-bold text-slate-500 italic">Sau khi trả lời, hãy chú ý theo dõi màn hình giảng bài (Whiteboard) nếu Thầy/Cô kích hoạt.</p></li>
                <li className="flex gap-4"><span className="w-6 h-6 bg-slate-900 text-white rounded-full flex items-center justify-center text-[10px] font-black shrink-0">3</span><p className="text-xs font-bold text-slate-500 italic">Mọi chiến binh trong phòng thi đấu cùng lúc, cùng một bộ đề.</p></li>
             </ul>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default StudentArenaFlow;
