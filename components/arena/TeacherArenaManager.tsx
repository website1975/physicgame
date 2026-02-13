
import React, { useState, useEffect, useRef } from 'react';
import { GameState, Teacher, MatchData } from '../../types';
import { fetchTeacherByMaGV, supabase, fetchSetData } from '../../services/supabaseService';

interface TeacherArenaManagerProps {
  gameState: GameState;
  setGameState: (s: GameState) => void;
  playerName: string;
  onStartMatch: (data: MatchData) => void;
  joinedRoom: any;
  setJoinedRoom: (room: any) => void;
  uniqueId: string;
}

const TeacherArenaManager: React.FC<TeacherArenaManagerProps> = ({
  gameState, setGameState, playerName, onStartMatch, joinedRoom, setJoinedRoom, uniqueId
}) => {
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [targetTeacher, setTargetTeacher] = useState<Teacher | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [presentStudents, setPresentStudents] = useState<string[]>([]);
  const matchLaunchedRef = useRef(false);

  const handleJoin = async () => {
    setLoading(true);
    setError('');
    try {
      const teacher = await fetchTeacherByMaGV(roomCodeInput);
      if (!teacher) { 
        setError('Mã Giáo Viên không đúng!'); 
        return; 
      }
      setTargetTeacher(teacher);
      setGameState('WAITING_FOR_PLAYERS');
    } catch (e) { setError('Lỗi kết nối Server'); } 
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (gameState === 'WAITING_FOR_PLAYERS' && targetTeacher) {
      const channelName = `room_TEACHER_LIVE_${targetTeacher.id}`;
      const channel = supabase.channel(channelName, { 
        config: { presence: { key: `${playerName}::${uniqueId}` } } 
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const names = Object.keys(state).map(key => key.split('::')[0]);
          // Loại bỏ trùng lặp nếu có và sắp xếp
          setPresentStudents([...new Set(names)].sort());
        })
        .on('broadcast', { event: 'teacher_start_game' }, async ({ payload }) => {
          if (matchLaunchedRef.current) return;
          matchLaunchedRef.current = true;
          try {
            const data = await fetchSetData(payload.setId);
            onStartMatch({
              setId: payload.setId,
              title: payload.title,
              rounds: data.rounds,
              joinedRoom,
              opponents: [{ id: 'class', name: 'Lớp học' }],
              myId: uniqueId,
              startIndex: payload.currentQuestionIndex 
            });
          } catch (e) { console.error("Lỗi đồng bộ tự động"); }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ online: true, role: 'student' });
            channel.send({ type: 'broadcast', event: 'ask_session_state' });
          }
        });

      return () => { supabase.removeChannel(channel); };
    }
  }, [gameState, targetTeacher, playerName, uniqueId]);

  if (gameState === 'WAITING_ROOM') {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center justify-center bg-slate-950">
        <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-md w-full text-center border-b-[15px] border-blue-600 animate-in zoom-in">
           <div className="text-7xl mb-8">🏫</div>
           <h2 className="text-4xl font-black text-slate-800 uppercase italic mb-6">MÃ PHÒNG GV</h2>
           <input 
              type="text" 
              className="w-full p-6 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-center text-4xl uppercase outline-none focus:border-blue-500 mb-8" 
              placeholder="Nhập mã..." 
              value={roomCodeInput} 
              onChange={e => setRoomCodeInput(e.target.value.toUpperCase())} 
           />
           <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setGameState('ROOM_SELECTION')} className="py-6 bg-slate-100 text-slate-400 rounded-3xl font-black uppercase italic text-sm">Hủy</button>
              <button onClick={handleJoin} disabled={loading || !roomCodeInput} className="py-6 bg-blue-600 text-white rounded-3xl font-black uppercase italic shadow-xl text-sm">VÀO PHÒNG</button>
           </div>
           {error && <p className="mt-4 text-red-500 font-bold text-xs italic">{error}</p>}
        </div>
      </div>
    );
  }

  if (gameState === 'WAITING_FOR_PLAYERS') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
        <div className="bg-white rounded-[4.5rem] p-10 shadow-2xl max-w-4xl w-full border-b-[15px] border-rose-500 flex flex-col items-center">
             <div className="w-full flex justify-between items-start mb-10">
                <div className="text-left">
                   <div className="flex items-center gap-3 mb-2">
                      <span className="w-3 h-3 bg-emerald-500 rounded-full animate-ping"></span>
                      <span className="text-xs font-black text-emerald-600 uppercase italic tracking-widest">Đang kết nối trực tiếp</span>
                   </div>
                   <h2 className="text-3xl font-black text-slate-800 uppercase italic leading-none">LỚP HỌC: {targetTeacher?.tengv.toUpperCase()}</h2>
                   <p className="text-[10px] font-black text-slate-400 uppercase mt-2 tracking-widest italic">Mã phòng: {targetTeacher?.magv}</p>
                </div>
                <button onClick={() => { setJoinedRoom(null); setGameState('ROOM_SELECTION'); }} className="bg-slate-100 text-slate-400 px-6 py-2 rounded-xl font-black text-[9px] uppercase hover:bg-red-500 hover:text-white transition-all">Thoát</button>
             </div>

             <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Cột trái: Thông tin chính */}
                <div className="lg:col-span-4 flex flex-col items-center justify-center bg-slate-50 rounded-[3rem] p-8 border-4 border-white shadow-inner">
                   <div className="w-32 h-32 bg-rose-100 rounded-[2.5rem] flex items-center justify-center text-6xl mb-6 shadow-lg border-4 border-white">👨‍🏫</div>
                   <h3 className="text-xl font-black text-slate-800 uppercase italic text-center mb-2">{targetTeacher?.tengv}</h3>
                   <span className="px-4 py-1 bg-rose-600 text-white text-[9px] font-black uppercase rounded-full shadow-md">CHỦ PHÒNG</span>
                   
                   <div className="mt-10 w-full p-6 bg-white rounded-3xl border-2 border-slate-100 text-center animate-pulse">
                      <p className="text-slate-400 font-bold italic text-xs">"Vui lòng đợi Giáo viên phát lệnh Bắt đầu bài học..."</p>
                   </div>
                </div>

                {/* Cột phải: Danh sách học sinh */}
                <div className="lg:col-span-8 bg-slate-900 rounded-[3rem] p-8 flex flex-col shadow-2xl border-4 border-slate-800">
                   <div className="flex justify-between items-center mb-6 px-2">
                      <span className="text-[10px] font-black text-blue-400 uppercase italic tracking-[0.2em]">DANH SÁCH CÓ MẶT ({presentStudents.length})</span>
                      <div className="flex -space-x-2">
                         {[...Array(Math.min(3, presentStudents.length))].map((_, i) => (
                            <div key={i} className="w-6 h-6 rounded-full border-2 border-slate-900 bg-blue-500"></div>
                         ))}
                      </div>
                   </div>

                   <div className="flex-1 overflow-y-auto no-scrollbar grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {presentStudents.map((name, i) => (
                         <div 
                           key={i} 
                           className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all animate-in zoom-in duration-300 ${name === playerName ? 'bg-blue-600 border-blue-400 shadow-lg' : 'bg-white/5 border-white/5'}`}
                         >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs shadow-sm ${name === playerName ? 'bg-white text-blue-600' : 'bg-slate-800 text-slate-400'}`}>👤</div>
                            <div className="flex-1 min-w-0">
                               <div className={`text-[10px] font-black uppercase italic truncate ${name === playerName ? 'text-white' : 'text-slate-300'}`}>
                                  {name}
                               </div>
                               {name === playerName && <span className="text-[7px] font-black text-blue-200 uppercase italic block">Là bạn</span>}
                            </div>
                         </div>
                      ))}
                   </div>

                   <div className="mt-6 pt-6 border-t border-white/5 flex items-center gap-4">
                      <div className="flex items-center gap-2">
                         <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                         <span className="text-[9px] font-bold text-slate-500 uppercase italic">Lớp học đang kết nối ổn định...</span>
                      </div>
                   </div>
                </div>
             </div>
        </div>
      </div>
    );
  }

  return null;
};

export default TeacherArenaManager;
