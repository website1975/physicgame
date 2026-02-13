
import React, { useState, useEffect, useRef } from 'react';
import { GameState, Teacher, MatchData } from '../../types';
import { supabase, fetchSetData, getRoomAssignmentsWithMeta } from '../../services/supabaseService';

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
  const [assignedSet, setAssignedSet] = useState<any>(null);
  const [presentStudents, setPresentStudents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const matchLaunchedRef = useRef(false);

  // Bước 1: Tìm đề đã gán
  const checkAssignment = async () => {
    try {
      const sets = await getRoomAssignmentsWithMeta(currentTeacher.id, 'TEACHER_LIVE');
      // Lọc đề theo khối lớp của HS
      const validSet = sets.find(s => String(s.grade) === String(studentGrade));
      setAssignedSet(validSet || null);
    } catch (e) { 
      console.error("Lỗi kiểm tra gán đề:", e); 
    } finally { 
      setLoading(false); 
      setGameState('WAITING_FOR_PLAYERS'); 
    }
  };

  useEffect(() => { 
    if (currentTeacher) checkAssignment(); 
  }, [currentTeacher?.id, studentGrade]);

  // Bước 2: Kết nối và chờ lệnh từ GV
  useEffect(() => {
    if (gameState === 'WAITING_FOR_PLAYERS' && currentTeacher) {
      // Kênh chung: room_TEACHER_LIVE_{teacherId}
      const channel = supabase.channel(`room_TEACHER_LIVE_${currentTeacher.id}`, { 
        config: { presence: { key: `${playerName}::${uniqueId}` } } 
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const names = Object.keys(state).map(k => k.split('::')[0]);
          setPresentStudents([...new Set(names)].sort());
        })
        .on('broadcast', { event: 'teacher_command' }, async ({ payload }) => {
          // Khi GV nhấn "BẮT ĐẦU" hoặc "SYNC"
          if ((payload.type === 'START' || payload.type === 'SYNC') && !matchLaunchedRef.current) {
            console.log("[LOBBY] Nhận lệnh START từ GV");
            matchLaunchedRef.current = true;
            
            // Lấy dữ liệu đầy đủ của bộ đề
            try {
              const data = await fetchSetData(payload.setId);
              onStartMatch({ 
                setId: payload.setId, 
                title: data.title, 
                rounds: data.rounds, 
                joinedRoom, 
                opponents: [{ id: 'class', name: 'Cả lớp' }], 
                myId: uniqueId, 
                startIndex: payload.index || 0, 
                grade: studentGrade 
              } as any);
            } catch (err) {
              matchLaunchedRef.current = false;
              console.error("Lỗi nạp dữ liệu trận đấu:", err);
            }
          }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ online: true, role: 'student' });
            // Báo cáo sự hiện diện ngay lập tức
            channel.send({ 
              type: 'broadcast', 
              event: 'student_presence_report', 
              payload: { name: playerName, uniqueId, grade: studentGrade, progress: 'Đang ở sảnh chờ' } 
            });
          }
        });

      return () => { supabase.removeChannel(channel); };
    }
  }, [gameState, currentTeacher, playerName, uniqueId, assignedSet]);

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
       <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
       <div className="text-white font-black italic uppercase text-xs tracking-widest">Đang kết nối đấu trường...</div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-100">
      <div className="bg-white rounded-[4.5rem] p-10 shadow-2xl max-w-5xl w-full border-b-[15px] border-rose-500 animate-in zoom-in">
           <div className="w-full flex justify-between items-start mb-10 border-b-2 border-slate-50 pb-8 text-left">
              <div>
                <h2 className="text-4xl font-black text-slate-800 uppercase italic leading-none">PHÒNG LIVE: {currentTeacher?.tengv.toUpperCase()}</h2>
                <p className="text-blue-600 font-bold uppercase text-[10px] mt-3 italic tracking-widest">MÃ GV: {currentTeacher?.magv} • KHỐI: {studentGrade}</p>
              </div>
              <button onClick={() => { setJoinedRoom(null); setGameState('ROOM_SELECTION'); }} className="bg-slate-100 text-slate-400 px-8 py-4 rounded-2xl font-black text-[10px] uppercase italic hover:bg-red-500 hover:text-white transition-all">✕ RỜI PHÒNG</button>
           </div>
           
           <div className="grid grid-cols-12 gap-10">
              <div className="col-span-4 flex flex-col items-center bg-slate-50 rounded-[3.5rem] p-10 border-4 border-white shadow-inner">
                 <div className="w-40 h-40 bg-rose-100 rounded-[3rem] flex items-center justify-center text-7xl mb-6 shadow-xl border-4 border-white">👨‍🏫</div>
                 <h3 className="text-2xl font-black text-slate-800 uppercase italic mb-2 text-center">{currentTeacher?.tengv}</h3>
                 
                 {assignedSet ? (
                   <div className="mt-8 p-8 bg-emerald-50 rounded-[2.5rem] border-2 border-emerald-100 text-center animate-pulse">
                      <p className="text-emerald-600 font-black uppercase text-xs italic mb-2">ĐỀ ĐÃ SẴN SÀNG!</p>
                      <p className="text-slate-500 font-bold italic text-[11px] leading-relaxed line-clamp-2">"{assignedSet.title}"</p>
                      <p className="text-[9px] text-slate-400 mt-4 uppercase font-black">Chờ Thầy nhấn Bắt đầu...</p>
                   </div>
                 ) : (
                   <div className="mt-8 p-8 bg-rose-50 rounded-[2.5rem] border-2 border-rose-100 text-center text-rose-500 font-black uppercase italic text-[10px] leading-relaxed">
                      Thầy chưa gán bộ đề Khối {studentGrade} vào Arena.
                   </div>
                 )}
              </div>

              <div className="col-span-8 bg-slate-900 rounded-[3.5rem] p-10 flex flex-col shadow-2xl text-left">
                 <div className="mb-8 px-2 flex justify-between items-center">
                    <span className="text-[11px] font-black text-blue-400 uppercase italic tracking-widest">DANH SÁCH LỚP HỌC ({presentStudents.length})</span>
                    <div className="flex gap-1">
                       <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></div>
                       <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                    </div>
                 </div>
                 <div className="flex-1 overflow-y-auto no-scrollbar grid grid-cols-2 gap-4 min-h-[350px] content-start">
                    {presentStudents.map((name, i) => (
                      <div key={i} className={`flex items-center gap-4 p-4 rounded-3xl border-2 transition-all ${name === playerName ? 'bg-blue-600 border-blue-400 shadow-xl text-white scale-105' : 'bg-white/5 border-white/5 text-slate-400'}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm ${name === playerName ? 'bg-white text-blue-600 font-black' : 'bg-slate-800'}`}>👤</div>
                        <div className="text-[11px] font-black uppercase italic truncate">{name === playerName ? 'BẠN' : name}</div>
                      </div>
                    ))}
                    {presentStudents.length === 0 && (
                      <div className="col-span-2 h-full flex items-center justify-center text-slate-600 italic text-sm">Đang đợi các bạn khác vào phòng...</div>
                    )}
                 </div>
              </div>
           </div>
      </div>
    </div>
  );
};

export default TeacherArenaManager;
