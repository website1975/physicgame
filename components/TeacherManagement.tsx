
import React, { useState, useEffect, useRef } from 'react';
import { GameState, Teacher, MatchData } from '../../types';
import { fetchTeacherByMaGV, supabase, fetchSetData } from '../../services/supabaseService';

interface TeacherArenaManagerProps {
  gameState: GameState;
  setGameState: (s: GameState) => void;
  playerName: string;
  studentGrade: string;
  currentTeacher: Teacher;
  onStartMatch: (data: MatchData) => void;
  joinedRoom: any;
  setJoinedRoom: (room: any) => void;
  uniqueId: string;
}

const TeacherArenaManager: React.FC<TeacherArenaManagerProps> = ({
  gameState, setGameState, playerName, studentGrade, onStartMatch, joinedRoom, setJoinedRoom, uniqueId, currentTeacher
}) => {
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [presentStudents, setPresentStudents] = useState<string[]>([]);
  const matchLaunchedRef = useRef(false);

  // Chuyển sang WAITING_FOR_PLAYERS nếu đã có currentTeacher
  useEffect(() => {
    if (gameState === 'WAITING_ROOM' && currentTeacher) {
      setGameState('WAITING_FOR_PLAYERS');
    }
  }, [gameState, currentTeacher]);

  const handleManualJoin = async () => {
    setLoading(true);
    setError('');
    try {
      const teacher = await fetchTeacherByMaGV(roomCodeInput);
      if (!teacher) { 
        setError('Mã Giáo Viên không đúng!'); 
        return; 
      }
      setGameState('WAITING_FOR_PLAYERS');
    } catch (e) { setError('Lỗi kết nối Server'); } 
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (gameState === 'WAITING_FOR_PLAYERS' && currentTeacher) {
      const channelName = `room_TEACHER_LIVE_${currentTeacher.id}`;
      const channel = supabase.channel(channelName, { 
        config: { presence: { key: `${playerName}::${uniqueId}` } } 
      });

      const launchGame = async (payload: any) => {
        if (matchLaunchedRef.current) return;

        // KIỂM TRA KHỐI LỚP: HS khối 10 chỉ nhận đề khối 10
        if (payload.grade && String(payload.grade) !== String(studentGrade)) {
          console.log(`Bỏ qua vì sai khối lớp: Đề K${payload.grade} vs HS K${studentGrade}`);
          return;
        }

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
            startIndex: payload.currentQuestionIndex || 0
          });
        } catch (e) { 
          console.error("Lỗi đồng bộ tự động", e);
          matchLaunchedRef.current = false;
        }
      };

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const names = Object.keys(state).map(key => key.split('::')[0]);
          setPresentStudents([...new Set(names)].sort());
        })
        .on('broadcast', { event: 'teacher_start_game' }, ({ payload }) => {
          launchGame(payload);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ online: true, role: 'student', grade: studentGrade });
            // Hỏi giáo viên xem phòng có đang chạy không (trường hợp HS vào muộn)
            channel.send({ type: 'broadcast', event: 'ask_session_state' });
          }
        });

      return () => { supabase.removeChannel(channel); };
    }
  }, [gameState, currentTeacher, playerName, uniqueId, studentGrade]);

  // Giao diện nhập mã GV (Nếu chưa có currentTeacher)
  if (gameState === 'WAITING_ROOM' && !currentTeacher) {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center justify-center bg-slate-50">
        <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-md w-full text-center border-b-[15px] border-blue-600 animate-in zoom-in">
           <div className="text-7xl mb-8">🏫</div>
           <h2 className="text-4xl font-black text-slate-800 uppercase italic mb-6">VÀO PHÒNG HỌC</h2>
           <p className="text-slate-400 font-bold text-xs mb-8 uppercase italic">Nhập mã giáo viên của bạn</p>
           <input 
              type="text" 
              className="w-full p-6 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-center text-4xl uppercase outline-none focus:border-blue-500 mb-8" 
              placeholder="MÃ GV..." 
              value={roomCodeInput} 
              onChange={e => setRoomCodeInput(e.target.value.toUpperCase())} 
           />
           <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setGameState('ROOM_SELECTION')} className="py-6 bg-slate-100 text-slate-400 rounded-3xl font-black uppercase italic text-sm">Hủy</button>
              <button onClick={handleManualJoin} disabled={loading || !roomCodeInput} className="py-6 bg-blue-600 text-white rounded-3xl font-black uppercase italic shadow-xl text-sm">VÀO PHÒNG</button>
           </div>
           {error && <p className="mt-4 text-red-500 font-bold text-xs italic">{error}</p>}
        </div>
      </div>
    );
  }

  // Giao diện Sảnh chờ đẹp mắt (WAITING_FOR_PLAYERS)
  if (gameState === 'WAITING_FOR_PLAYERS') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-100">
        <div className="bg-white rounded-[4.5rem] p-10 shadow-2xl max-w-5xl w-full border-b-[15px] border-rose-500 flex flex-col items-center animate-in fade-in slide-in-from-bottom-8">
             <div className="w-full flex justify-between items-start mb-10 border-b-2 border-slate-50 pb-8">
                <div className="text-left">
                   <div className="flex items-center gap-3 mb-2">
                      <div className="w-4 h-4 bg-emerald-500 rounded-full animate-ping"></div>
                      <span className="text-[11px] font-black text-emerald-600 uppercase italic tracking-widest">Đang kết nối: TRỰC TUYẾN</span>
                   </div>
                   <h2 className="text-4xl font-black text-slate-800 uppercase italic leading-none">PHÒNG HỌC: {currentTeacher?.tengv.toUpperCase()}</h2>
                   <div className="flex gap-2 mt-4">
                      <span className="px-4 py-1.5 bg-blue-50 text-blue-600 rounded-xl font-black text-[10px] uppercase border border-blue-100">KHỐI LỚP: {studentGrade}</span>
                      <span className="px-4 py-1.5 bg-slate-50 text-slate-400 rounded-xl font-black text-[10px] uppercase border border-slate-100">MÃ GV: {currentTeacher?.magv}</span>
                   </div>
                </div>
                <button onClick={() => { setJoinedRoom(null); setGameState('ROOM_SELECTION'); }} className="bg-slate-100 text-slate-400 px-8 py-3 rounded-2xl font-black text-[10px] uppercase hover:bg-red-500 hover:text-white transition-all">✕ RỜI PHÒNG</button>
             </div>

             <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-4 flex flex-col items-center justify-center bg-slate-50 rounded-[3.5rem] p-10 border-4 border-white shadow-inner relative overflow-hidden group">
                   <div className="absolute -top-10 -right-10 text-9xl opacity-5 group-hover:scale-110 transition-transform">🎓</div>
                   <div className="w-40 h-40 bg-rose-100 rounded-[3rem] flex items-center justify-center text-7xl mb-6 shadow-xl border-4 border-white">👨‍🏫</div>
                   <h3 className="text-2xl font-black text-slate-800 uppercase italic text-center mb-2">{currentTeacher?.tengv}</h3>
                   <span className="px-6 py-1.5 bg-rose-600 text-white text-[10px] font-black uppercase rounded-full shadow-lg">CHỦ PHÒNG (HOST)</span>
                   
                   <div className="mt-12 w-full p-8 bg-white rounded-[2.5rem] border-2 border-slate-100 text-center animate-pulse shadow-sm">
                      <p className="text-slate-400 font-bold italic text-sm leading-relaxed">Đang chờ Thầy/Cô phát đề Khối {studentGrade}.<br/><span className="text-[10px] text-emerald-500 font-black uppercase">Vui lòng không rời khỏi màn hình!</span></p>
                   </div>
                </div>

                <div className="lg:col-span-8 bg-slate-900 rounded-[3.5rem] p-10 flex flex-col shadow-2xl border-4 border-slate-800">
                   <div className="flex justify-between items-center mb-8 px-2">
                      <div className="flex items-center gap-3">
                         <span className="text-[11px] font-black text-blue-400 uppercase italic tracking-[0.2em]">CÁC BẠN TRONG LỚP ({presentStudents.length})</span>
                      </div>
                      <div className="h-1 flex-1 mx-6 bg-white/5 rounded-full overflow-hidden">
                         <div className="h-full bg-blue-500 w-1/3 animate-loading"></div>
                      </div>
                   </div>

                   <div className="flex-1 overflow-y-auto no-scrollbar grid grid-cols-2 sm:grid-cols-3 gap-4 min-h-[350px] content-start">
                      {presentStudents.map((name, i) => (
                         <div 
                           key={i} 
                           className={`flex items-center gap-4 p-4 rounded-3xl border-2 transition-all animate-in zoom-in duration-300 ${name === playerName ? 'bg-blue-600 border-blue-400 shadow-xl scale-105' : 'bg-white/5 border-white/5'}`}
                         >
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm shadow-sm ${name === playerName ? 'bg-white text-blue-600' : 'bg-slate-800 text-slate-400'}`}>👤</div>
                            <div className="flex-1 min-w-0">
                               <div className={`text-xs font-black uppercase italic truncate ${name === playerName ? 'text-white' : 'text-slate-300'}`}>
                                  {name}
                               </div>
                               {name === playerName && <span className="text-[8px] font-black text-blue-200 uppercase italic block mt-0.5">Bạn</span>}
                            </div>
                         </div>
                      ))}
                   </div>
                </div>
             </div>
        </div>
      </div>
    );
  }

  // Fallback Loading Screen (Màu Slate sáng thay vì đen tuyền)
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8">
       <div className="relative">
          <div className="w-24 h-24 border-8 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-8 shadow-xl"></div>
          <div className="absolute inset-0 flex items-center justify-center">
             <span className="text-3xl animate-bounce">📡</span>
          </div>
       </div>
       <p className="text-slate-800 font-black italic uppercase text-lg tracking-widest animate-pulse">Đang đồng bộ lớp học...</p>
       <p className="text-slate-400 font-bold text-[10px] uppercase mt-4 italic">Vui lòng đợi trong giây lát</p>
    </div>
  );
};

export default TeacherArenaManager;
