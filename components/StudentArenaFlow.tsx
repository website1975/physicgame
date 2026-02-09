
import React, { useState, useEffect, useRef } from 'react';
import { GameState, Teacher, QuestionType, Round } from '../types';
import { getRoomAssignments, fetchSetData, supabase, fetchTeacherByMaGV } from '../services/supabaseService';
import KeywordSelector from './KeywordSelector';

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

interface PlayerInfo {
  name: string;
  shortId: string;
  fullKey: string;
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
  const shortId = uniqueId.slice(-3).toUpperCase();

  // Theo dõi sĩ số toàn bộ các phòng Arena của giáo viên này để hiển thị UI
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

    // Kiểm tra nhanh sĩ số qua cache trước khi nhấn (Optional nhưng tốt cho UX)
    if (roomOccupancy[room.code] >= room.capacity) {
      setError(`Phòng ${room.name} đã đầy (${roomOccupancy[room.code]}/${room.capacity}). Vui lòng chọn phòng khác!`);
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
          const setRounds = data.rounds || [];
          setRounds.forEach((r: any) => { qCount += (r.problems?.length || 0); });
          
          fullSets.push({ 
            id: item.set_id, 
            assigned_at: item.assigned_at, 
            question_count: qCount,
            round_count: setRounds.length,
            title: data.title,
            topic: data.topic,
            grade: data.grade,
            created_at: data.created_at,
            rounds: data.rounds
          });
        }
      }
      
      setAvailableSets(fullSets);
      setJoinedRoom(room);

      if (room.code === 'ARENA_A') {
        if (fullSets.length > 0) {
          setGameState('SET_SELECTION');
        } else {
          setError(`Thầy/Cô chưa gán đề Khối ${studentGrade} vào ${room.name}.`);
        }
      } else {
        if (fullSets.length > 0) {
          setGameState('WAITING_FOR_PLAYERS');
        } else {
          setError(`Thầy/Cô chưa gán bộ đề nào cho ${room.name} để thi đấu.`);
        }
      }
    } catch (e) { 
      setError('Lỗi kết nối CSDL'); 
    } finally { 
      setIsLoading(false); 
    }
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
      const myPresenceKey = `${playerName}_${uniqueId}`;
      const channelName = isTeacherRoom 
        ? `control_TEACHER_ROOM_${targetTeacher?.id}` 
        : `arena_${joinedRoom.code}_${currentTeacher.id}`;
      
      const channel = supabase.channel(channelName, {
        config: { presence: { key: myPresenceKey } }
      });

      matchStartedRef.current = false;
      const requiredCapacity = joinedRoom.capacity || 2;

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const playersKeys = Object.keys(state).sort(); // Sắp xếp để xác định thứ tự vào phòng
          
          // logic KIỂM TRA OVERFLOW (Người thừa)
          if (!isTeacherRoom) {
             const myIndex = playersKeys.indexOf(myPresenceKey);
             // Nếu mình không nằm trong danh sách được phép (theo capacity)
             if (myIndex >= requiredCapacity) {
                setError(`Rất tiếc! Phòng đã vừa đủ người. Hãy chọn phòng khác nhé!`);
                setJoinedRoom(null);
                setGameState('ROOM_SELECTION');
                supabase.removeChannel(channel);
                return;
             }
          }

          const playerInfos = playersKeys
            .filter(k => k !== 'teacher')
            .map(k => {
              const parts = k.split('_');
              return {
                name: parts[0],
                shortId: parts[1]?.slice(-3).toUpperCase() || '???',
                fullKey: k
              };
            });
          
          setPresentPlayers(playerInfos);
          
          if (!isTeacherRoom && playersKeys.length >= requiredCapacity && !matchStartedRef.current) {
            const isMaster = playersKeys[0] === myPresenceKey;
            
            if (isMaster && availableSets.length > 0) {
              const randomIndex = Math.floor(Math.random() * availableSets.length);
              const selectedSet = availableSets[randomIndex];
              
              channel.send({
                type: 'broadcast',
                event: 'match_start_signal',
                payload: {
                  setId: selectedSet.id,
                  masterName: playerName,
                  masterId: uniqueId,
                  joinedRoom: joinedRoom,
                  rounds: selectedSet.rounds,
                  title: selectedSet.title
                }
              });

              matchStartedRef.current = true;
              onStartMatch({
                setId: selectedSet.id,
                title: selectedSet.title,
                rounds: selectedSet.rounds,
                opponentName: playerInfos.filter(n => n.fullKey !== myPresenceKey).map(p => `${p.name} #${p.shortId}`).join(", "),
                joinedRoom: joinedRoom,
                myId: uniqueId
              });
            }
          }
        })
        .on('broadcast', { event: 'match_start_signal' }, ({ payload }) => {
          if (isTeacherRoom || matchStartedRef.current) return;
          
          matchStartedRef.current = true;
          onStartMatch({ 
            setId: payload.setId, 
            title: payload.title, 
            rounds: payload.rounds, 
            opponentName: `${payload.masterName} #${payload.masterId.slice(-3).toUpperCase()}`, 
            joinedRoom: payload.joinedRoom,
            myId: uniqueId
          });
        })
        .on('broadcast', { event: 'teacher_start_game' }, ({ payload }) => {
          if (!isTeacherRoom || matchStartedRef.current) return;
          matchStartedRef.current = true;
          onStartMatch({ 
            setId: payload.setId, 
            title: payload.title, 
            rounds: payload.rounds, 
            joinedRoom: joinedRoom, 
            opponentName: "Cả lớp",
            startIndex: payload.currentQuestionIndex || 0,
            myId: uniqueId
          });
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ role: 'student', online_at: new Date().toISOString() });
          }
        });

      channelRef.current = channel;
      return () => { 
        supabase.removeChannel(channel); 
      };
    }
  }, [gameState, joinedRoom, targetTeacher, playerName, uniqueId, availableSets, currentTeacher.id, setGameState, setJoinedRoom, onStartMatch]);

  const handleSelectSetForKeywords = (set: any) => {
    setSelectedSet(set);
    setGameState('KEYWORD_SELECTION');
  };

  const handleFinalStart = () => {
    onStartMatch({ 
      setId: selectedSet.id, 
      title: selectedSet.title, 
      rounds: selectedSet.rounds, 
      joinedRoom, 
      myId: uniqueId 
    });
  };

  if (gameState === 'ROOM_SELECTION') {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center justify-center relative bg-slate-950">
        <div className="absolute top-8 right-8 z-50">
           <button onClick={() => setGameState('LOBBY')} className="group flex items-center gap-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-8 py-4 rounded-2xl border-2 border-red-500/20 hover:border-red-500 transition-all font-black uppercase italic text-sm shadow-xl">
             <span>🚪</span> <span>Thoát ra</span>
           </button>
        </div>
        <div className="text-center mb-12">
          <h2 className="text-6xl font-black text-white italic uppercase tracking-tighter">Hệ thống Đấu Trường</h2>
          <p className="text-blue-400 font-bold uppercase text-[10px] mt-2 tracking-[0.3em]">Mã Arena: {currentTeacher.magv} – Chiến binh: {playerName} <span className="opacity-40">#{shortId}</span></p>
        </div>
        {error && <div className="mb-8 p-6 bg-red-500/20 text-red-400 rounded-[2rem] border-2 border-red-500/30 font-black uppercase italic text-xs animate-bounce">⚠️ {error}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 w-full max-w-7xl">
          {ARENA_ROOMS.map(room => {
            const currentCount = roomOccupancy[room.code] || 0;
            const isFull = room.code !== 'TEACHER_ROOM' && currentCount >= room.capacity;
            
            return (
              <button 
                key={room.code} 
                onClick={() => handleRoomJoin(room)} 
                disabled={isLoading} 
                className={`bg-white p-8 rounded-[4rem] flex flex-col items-center gap-6 hover:scale-105 transition-all shadow-2xl group relative ${isLoading ? 'opacity-50 cursor-not-allowed' : ''} ${isFull ? 'grayscale-[0.5] opacity-80' : ''}`}
              >
                {/* Badge sĩ số */}
                {room.code !== 'TEACHER_ROOM' && (
                  <div className={`absolute top-6 right-6 px-3 py-1 rounded-full font-black text-[10px] shadow-sm border-2 ${isFull ? 'bg-red-500 text-white border-red-400' : 'bg-emerald-500 text-white border-emerald-400'}`}>
                    {currentCount}/{room.capacity}
                  </div>
                )}
                
                <div className={`text-5xl p-6 rounded-[2rem] ${room.color} text-white shadow-lg group-hover:rotate-12 transition-transform`}>{room.emoji}</div>
                <div className="font-black text-slate-800 uppercase italic text-lg leading-none">{room.name}</div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center px-4">{isFull ? 'PHÒNG ĐÃ ĐẦY' : room.desc}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (gameState === 'ENTER_CODE') {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center justify-center bg-slate-950">
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
              <h2 className="text-6xl font-black text-white uppercase italic tracking-tighter">LUYỆN TẬP CÁ NHÂN</h2>
              <p className="text-blue-500 font-black uppercase italic text-2xl mt-2">{joinedRoom?.name?.toUpperCase()} – KHỐI {studentGrade}</p>
            </div>
            <button onClick={() => { setJoinedRoom(null); setGameState('ROOM_SELECTION'); }} className="px-10 py-4 bg-white/10 text-white rounded-2xl font-black uppercase italic border-2 border-white/20 hover:bg-white hover:text-slate-900 transition-all">QUAY LẠI ✕</button>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 mb-20">
            {availableSets.map((set, i) => (
              <div key={set.id} className="bg-white p-8 rounded-[3.5rem] border-4 border-slate-50 shadow-2xl hover:border-blue-100 transition-all flex flex-col group relative overflow-hidden animate-in zoom-in duration-300">
                 <div className="flex items-center gap-2 mb-4">
                    <span className="px-3 py-1 bg-blue-600 text-white text-[9px] font-black uppercase rounded-lg shadow-sm">
                      {set.topic || 'BÀI TẬP'}
                    </span>
                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                      K{set.grade || '10'} • {set.created_at ? new Date(set.created_at).toLocaleDateString('vi-VN') : 'Mới'}
                    </span>
                 </div>

                 <h4 className="text-2xl font-black text-slate-800 uppercase italic mb-6 line-clamp-2 leading-tight group-hover:text-blue-600 transition-colors">
                   {set.title}
                 </h4>
                 
                 <div className="grid grid-cols-2 gap-3 mb-10">
                    <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex flex-col items-center">
                      <div className="text-[9px] font-black text-slate-400 uppercase mb-1">Cấu trúc</div>
                      <div className="text-xl font-black text-slate-700 italic leading-none">
                        {set.round_count || 1} <span className="text-[10px] uppercase">vòng</span>
                      </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex flex-col items-center">
                      <div className="text-[9px] font-black text-slate-400 uppercase mb-1">Tổng số</div>
                      <div className="text-xl font-black text-slate-700 italic leading-none">
                        {set.question_count || 0} <span className="text-[10px] uppercase">câu</span>
                      </div>
                    </div>
                 </div>

                 <button 
                  onClick={() => handleSelectSetForKeywords(set)} 
                  className="mt-auto w-full py-5 bg-blue-600 text-white hover:bg-blue-700 border-b-6 border-blue-800 rounded-2xl font-black uppercase italic transition-all text-sm flex items-center justify-center gap-3 shadow-lg hover:scale-[1.02] active:scale-95"
                 >
                   <span className="text-xl">⚡</span> BẮT ĐẦU LUYỆN
                 </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'KEYWORD_SELECTION' && selectedSet) {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center justify-center bg-slate-950 overflow-y-auto no-scrollbar">
         <div className="max-w-4xl w-full bg-white rounded-[4rem] p-12 shadow-2xl border-b-[12px] border-blue-600 animate-in zoom-in duration-500">
            <header className="mb-10 text-center">
               <h2 className="text-4xl font-black text-slate-800 uppercase italic mb-2">KHỞI ĐỘNG TƯ DUY</h2>
               <p className="text-slate-400 font-bold text-xs uppercase italic tracking-widest">Chọn các đại lượng & công thức bạn sẽ gặp trong bộ đề này</p>
            </header>

            <div className="bg-slate-50 p-8 rounded-[3rem] border-2 border-slate-100 mb-10">
               <KeywordSelector 
                 selectedQuantities={selectedQuantities}
                 selectedFormulas={selectedFormulas}
                 onToggleQuantity={(s) => setSelectedQuantities(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                 onToggleFormula={(id) => setSelectedFormulas(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
               />
            </div>

            <div className="flex gap-4">
               <button onClick={() => setGameState('SET_SELECTION')} className="flex-1 py-6 bg-slate-100 text-slate-400 rounded-3xl font-black uppercase italic hover:bg-slate-200 transition-all">Quay lại</button>
               <button onClick={handleFinalStart} className="flex-[2] py-6 bg-blue-600 text-white rounded-3xl font-black uppercase italic text-xl shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3 border-b-8 border-blue-800">
                  <span className="text-2xl">⚡</span> SẴN SÀNG CHIẾN ĐẤU
               </button>
            </div>
         </div>
      </div>
    );
  }

  if (gameState === 'WAITING_FOR_PLAYERS' && joinedRoom) {
    const isTeacherRoom = joinedRoom.code === 'TEACHER_ROOM';
    const requiredCapacity = joinedRoom.capacity || 2;
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
        <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-6xl w-full border-b-[12px] border-purple-600 animate-in zoom-in duration-500 flex flex-col lg:flex-row gap-10">
          <div className="flex-1">
             <h2 className="text-3xl font-black text-slate-800 uppercase italic mb-4">SẢNH CHỜ THI ĐẤU</h2>
             <div className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-8">
               {isTeacherRoom ? `PHÒNG THẦY/CÔ: ${targetTeacher?.tengv?.toUpperCase()}` : `PHÒNG ${joinedRoom.name} - ĐANG GHÉP CẶP`}
             </div>
             <div className="py-12 bg-slate-950 rounded-[3rem] text-white flex flex-col items-center gap-10">
                <div className="grid grid-cols-4 gap-6 px-10">
                   {presentPlayers.map((p, i) => (
                     <div key={i} className="flex flex-col items-center gap-3">
                        <div className="w-16 h-16 rounded-full bg-blue-600 border-4 border-white shadow-lg flex items-center justify-center text-2xl">👤</div>
                        <div className="text-[8px] font-black uppercase italic text-white truncate max-w-full text-center">
                           {p.name}<br/>
                           <span className="opacity-40 text-[7px]">#{p.shortId}</span>
                        </div>
                     </div>
                   ))}
                   {Array.from({ length: Math.max(0, requiredCapacity - presentPlayers.length) }).map((_, i) => (
                     <div key={`empty-${i}`} className="flex flex-col items-center gap-3 opacity-20">
                        <div className="w-16 h-16 rounded-full bg-slate-700 border-4 border-slate-600 flex items-center justify-center text-2xl">?</div>
                        <div className="text-[8px] font-black uppercase italic text-slate-500">Đang tìm...</div>
                     </div>
                   ))}
                </div>
                <div className="flex flex-col items-center gap-3">
                   <div className="flex items-center gap-3">
                     <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                     <span className="font-black italic uppercase text-xl text-white animate-pulse">
                       {isTeacherRoom ? 'ĐANG ĐỢI THẦY/CÔ KHỞI CHẠY...' : `ĐANG ĐỢI ĐỐI THỦ (${presentPlayers.length}/${requiredCapacity})`}
                     </span>
                   </div>
                   {!isTeacherRoom && <div className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Hệ thống sẽ tự bốc đề khi đủ người!</div>}
                </div>
             </div>
             <button onClick={() => { setJoinedRoom(null); setGameState('ROOM_SELECTION'); }} className="mt-8 px-10 py-4 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase text-xs italic hover:bg-red-500 hover:text-white transition-all">Rời phòng</button>
          </div>
          <div className="flex-1 bg-slate-50 rounded-[3rem] p-8 text-left">
             <h3 className="text-2xl font-black text-slate-800 uppercase italic mb-6">📜 LUẬT CHƠI ĐỐI KHÁNG</h3>
             <ul className="space-y-4">
                <li className="flex gap-4"><span className="w-6 h-6 bg-slate-900 text-white rounded-full flex items-center justify-center text-[10px] font-black shrink-0">1</span><p className="text-xs font-bold text-slate-500 italic">Mỗi học sinh sẽ có một mã ID đi kèm tên để phân biệt nếu trùng tên nhau.</p></li>
                <li className="flex gap-4"><span className="w-6 h-6 bg-slate-900 text-white rounded-full flex items-center justify-center text-[10px] font-black shrink-0">2</span><p className="text-xs font-bold text-slate-500 italic">Máy tính sẽ chọn ngẫu nhiên một bộ đề từ kho đề Thầy/Cô đã gán cho phòng này.</p></li>
                <li className="flex gap-4"><span className="w-6 h-6 bg-slate-900 text-white rounded-full flex items-center justify-center text-[10px] font-black shrink-0">3</span><p className="text-xs font-bold text-slate-500 italic">Tốc độ là chìa khóa! Ai trả lời đúng và nhanh hơn sẽ giành được ưu thế điểm số.</p></li>
             </ul>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default StudentArenaFlow;
