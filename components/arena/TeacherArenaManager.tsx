
import React, { useState, useEffect, useRef } from 'react';
import { GameState, Teacher, MatchData } from '../../types';
import { fetchTeacherByMaGV, supabase } from '../../services/supabaseService';

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
  const matchStartedRef = useRef(false);

  const handleJoin = async () => {
    setLoading(true);
    setError('');
    try {
      const teacher = await fetchTeacherByMaGV(roomCodeInput);
      if (!teacher) { 
        setError('Mã Giáo Viên không tồn tại trên hệ thống!'); 
        return; 
      }
      setTargetTeacher(teacher);
      setGameState('WAITING_FOR_PLAYERS');
    } catch (e) { 
      setError('Lỗi kết nối dữ liệu, vui lòng thử lại'); 
    } 
    finally { setLoading(false); }
  };

  useEffect(() => {
    // Chỉ kích hoạt lắng nghe khi đã nhập mã GV và đang ở phòng chờ
    if (gameState === 'WAITING_FOR_PLAYERS' && targetTeacher) {
      const LIVE_CHANNEL_NAME = `room_TEACHER_LIVE_${targetTeacher.id}`;
      console.log("Student Listening on Live Channel:", LIVE_CHANNEL_NAME);
      
      const channel = supabase.channel(LIVE_CHANNEL_NAME, { 
        config: { presence: { key: `${playerName}_${uniqueId}` } } 
      });

      channel
        .on('broadcast', { event: 'teacher_start_game' }, ({ payload }) => {
          if (matchStartedRef.current) return;
          matchStartedRef.current = true;
          
          console.log("Teacher Started! Syncing data...");
          // Đồng bộ hóa toàn bộ dữ liệu trận đấu nhận từ GV
          onStartMatch({ 
            setId: payload.setId, 
            title: payload.title, 
            rounds: payload.rounds, 
            joinedRoom, 
            opponents: [{ id: 'class', name: 'Cả lớp' }], 
            startIndex: payload.currentQuestionIndex || 0, 
            myId: uniqueId 
          });
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
             await channel.track({ online: true, role: 'student', entered_at: new Date().toISOString() });
          }
        });

      return () => { supabase.removeChannel(channel); };
    }
  }, [gameState, targetTeacher, uniqueId, playerName, onStartMatch, joinedRoom]);

  if (gameState === 'ENTER_CODE') {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center justify-center bg-slate-950">
        <div className="bg-white rounded-[4.5rem] p-14 shadow-2xl max-w-md w-full text-center border-b-[15px] border-blue-600 animate-in zoom-in duration-500">
           <div className="text-7xl mb-8">🔑</div>
           <h2 className="text-4xl font-black text-slate-800 uppercase italic mb-6 tracking-tighter">PHÒNG LIVE</h2>
           <p className="text-slate-400 font-bold uppercase text-[10px] mb-8 tracking-widest italic">Vui lòng nhập Mã Giáo Viên (MaGV)</p>
           
           <div className="relative mb-10">
              <input 
                type="text" 
                className="w-full p-8 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-center text-4xl uppercase outline-none focus:border-blue-500 transition-all shadow-inner" 
                placeholder="---" 
                maxLength={10}
                value={roomCodeInput} 
                onChange={e => setRoomCodeInput(e.target.value.toUpperCase())} 
              />
           </div>

           <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setGameState('ROOM_SELECTION')} className="py-6 bg-slate-100 text-slate-400 rounded-3xl font-black uppercase italic hover:bg-slate-200 transition-all">Hủy</button>
              <button onClick={handleJoin} disabled={loading || !roomCodeInput} className="py-6 bg-blue-600 text-white rounded-3xl font-black uppercase italic shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50">
                {loading ? 'ĐANG KẾT NỐI...' : 'VÀO PHÒNG 🚀'}
              </button>
           </div>
           {error && <p className="mt-6 text-red-500 font-bold text-sm bg-red-50 py-3 rounded-2xl border border-red-100">{error}</p>}
        </div>
      </div>
    );
  }

  if (gameState === 'WAITING_FOR_PLAYERS') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
        <div className="bg-white rounded-[4.5rem] p-14 shadow-2xl max-w-3xl w-full border-b-[15px] border-purple-600 flex flex-col items-center animate-in slide-in-from-bottom-10">
             <div className="w-24 h-24 bg-purple-100 rounded-[2rem] flex items-center justify-center text-5xl mb-8 shadow-xl">🏫</div>
             <h2 className="text-4xl font-black text-slate-800 uppercase italic mb-10 tracking-tighter text-center">ĐÃ KẾT NỐI ARENA</h2>
             
             <div className="w-full py-16 bg-slate-950 rounded-[3.5rem] text-white flex flex-col items-center gap-12 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-tr from-purple-900/20 to-transparent pointer-events-none"></div>
                <div className="flex items-center gap-5 relative z-10">
                   <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
                   <span className="font-black italic uppercase text-2xl text-white animate-pulse tracking-widest text-center px-6">ĐỢI GIÁO VIÊN BẮT ĐẦU TRẬN ĐẤU...</span>
                </div>
                
                <div className="bg-white/5 px-10 py-5 rounded-2xl border border-white/10 flex flex-col items-center relative z-10">
                   <span className="text-[10px] font-black text-slate-500 uppercase italic mb-1">DẠY LIVE: GIÁO VIÊN</span>
                   <div className="text-2xl font-black text-blue-400 italic">@{targetTeacher?.magv}@</div>
                </div>
             </div>
             
             <button onClick={() => { setJoinedRoom(null); setGameState('ROOM_SELECTION'); }} className="mt-12 px-14 py-5 bg-slate-100 text-slate-400 rounded-3xl font-black uppercase text-xs italic hover:bg-red-50 hover:text-red-500 transition-all">Thoát phòng</button>
        </div>
      </div>
    );
  }

  return null;
};

export default TeacherArenaManager;
