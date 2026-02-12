
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
      const channel = supabase.channel(`room_TEACHER_LIVE_${targetTeacher.id}`, { 
        config: { presence: { key: `${playerName}::${uniqueId}` } } 
      });

      // Lắng nghe lệnh phát đề từ GV
      channel
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
              startIndex: payload.currentQuestionIndex // Nhảy đúng câu GV đang dạy
            });
          } catch (e) { console.error("Lỗi đồng bộ tự động"); }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ online: true });
            // CHỦ ĐỘNG HỎI GV: "Thầy đã phát đề chưa?" (Xử lý trường hợp vào muộn hoặc lag)
            channel.send({ type: 'broadcast', event: 'ask_session_state' });
          }
        });

      return () => { supabase.removeChannel(channel); };
    }
  }, [gameState, targetTeacher, playerName, uniqueId]);

  if (gameState === 'ENTER_CODE') {
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
        <div className="bg-white rounded-[4.5rem] p-12 shadow-2xl max-w-2xl w-full border-b-[15px] border-emerald-500 flex flex-col items-center text-center">
             <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center text-5xl mb-6 shadow-inner animate-pulse">🎓</div>
             <h2 className="text-3xl font-black text-slate-800 uppercase italic mb-2">ĐÃ VÀO PHÒNG: {targetTeacher?.magv}</h2>
             <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mb-10 italic">Vui lòng đợi giáo viên phát lệnh Bắt đầu...</p>
             
             <div className="w-full p-10 bg-slate-50 rounded-[3rem] border-4 border-dashed border-slate-200 min-h-[150px] flex flex-col items-center justify-center">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-slate-500 font-black uppercase italic text-sm tracking-widest">Đang kết nối trực tiếp...</p>
                </div>
             </div>
             
             <button onClick={() => { setJoinedRoom(null); setGameState('ROOM_SELECTION'); }} className="mt-10 text-slate-300 font-black uppercase text-[10px] italic hover:text-red-500 transition-colors underline">Thoát phòng</button>
        </div>
      </div>
    );
  }

  return null;
};

export default TeacherArenaManager;
