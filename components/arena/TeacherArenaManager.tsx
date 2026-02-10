
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
      if (!teacher) { setError('Mã GV không tồn tại!'); return; }
      setTargetTeacher(teacher);
      setGameState('WAITING_FOR_PLAYERS');
    } catch (e) { setError('Lỗi hệ thống'); } 
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (gameState === 'WAITING_FOR_PLAYERS' && targetTeacher) {
      const channelName = `control_TEACHER_ROOM_${targetTeacher.id}`;
      const channel = supabase.channel(channelName, { config: { presence: { key: `${playerName}_${uniqueId}` } } });

      channel
        .on('broadcast', { event: 'teacher_start_game' }, ({ payload }) => {
          if (matchStartedRef.current) return;
          matchStartedRef.current = true;
          onStartMatch({ setId: payload.setId, title: payload.title, rounds: payload.rounds, joinedRoom, opponents: [{ id: 'class', name: 'Cả lớp' }], startIndex: payload.currentQuestionIndex || 0, myId: uniqueId });
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') await channel.track({ online: true });
        });

      return () => { supabase.removeChannel(channel); };
    }
  }, [gameState, targetTeacher, uniqueId]);

  if (gameState === 'ENTER_CODE') {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center justify-center bg-slate-950">
        <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-md w-full text-center">
           <div className="text-6xl mb-6">🔑</div>
           <h2 className="text-3xl font-black text-slate-800 uppercase italic mb-4">MÃ PHÒNG GIÁO VIÊN</h2>
           <input type="text" className="w-full p-6 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-center text-3xl uppercase mb-8" placeholder="MÃ GV..." value={roomCodeInput} onChange={e => setRoomCodeInput(e.target.value.toUpperCase())} />
           <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setGameState('ROOM_SELECTION')} className="py-5 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase italic">Hủy</button>
              <button onClick={handleJoin} disabled={loading} className="py-5 bg-slate-900 text-white rounded-2xl font-black uppercase italic shadow-lg">{loading ? '...' : 'VÀO PHÒNG'}</button>
           </div>
           {error && <p className="mt-4 text-red-500 font-bold text-xs">{error}</p>}
        </div>
      </div>
    );
  }

  if (gameState === 'WAITING_FOR_PLAYERS') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
        <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-4xl w-full border-b-[12px] border-purple-600 flex flex-col items-center">
             <h2 className="text-3xl font-black text-slate-800 uppercase italic mb-8">PHÒNG LIVE GIÁO VIÊN</h2>
             <div className="w-full py-12 bg-slate-950 rounded-[3rem] text-white flex flex-col items-center gap-10">
                <div className="flex items-center gap-3">
                   <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                   <span className="font-black italic uppercase text-xl text-white animate-pulse">ĐANG ĐỢI GIÁO VIÊN KHỞI CHẠY...</span>
                </div>
                <p className="text-slate-400 text-xs font-black uppercase italic">Mã GV: {targetTeacher?.magv}</p>
             </div>
             <button onClick={() => { setJoinedRoom(null); setGameState('ROOM_SELECTION'); }} className="mt-8 px-10 py-4 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase text-xs italic">Thoát</button>
        </div>
      </div>
    );
  }

  return null;
};

export default TeacherArenaManager;
