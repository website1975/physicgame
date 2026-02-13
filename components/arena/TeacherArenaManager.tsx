
import React, { useState, useEffect, useRef } from 'react';
import { GameState, Teacher, MatchData } from '../../types';
import { fetchTeacherByMaGV, supabase, fetchSetData, getRoomAssignmentsWithMeta } from '../../services/supabaseService';

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
  const channelRef = useRef<any>(null);

  // 1. Kiểm tra bộ đề đã gán cho GV này
  useEffect(() => {
    const checkAssignment = async () => {
      setLoading(true);
      try {
        const sets = await getRoomAssignmentsWithMeta(currentTeacher.id, 'TEACHER_LIVE');
        const validSet = sets.find(s => String(s.grade) === String(studentGrade));
        setAssignedSet(validSet || null);
        setGameState('WAITING_FOR_PLAYERS');
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    if (currentTeacher) checkAssignment();
  }, [currentTeacher?.id, studentGrade]);

  const sendCheckin = (channel: any) => {
    channel.send({
      type: 'broadcast',
      event: 'student_checkin',
      payload: { name: playerName, uniqueId, grade: studentGrade }
    });
  };

  useEffect(() => {
    if (gameState === 'WAITING_FOR_PLAYERS' && currentTeacher && assignedSet) {
      const channelName = `room_TEACHER_LIVE_${currentTeacher.id}`;
      const channel = supabase.channel(channelName, { 
        config: { presence: { key: `${playerName}::${uniqueId}` } } 
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const names = Object.keys(state).map(key => key.split('::')[0]);
          setPresentStudents([...new Set(names)].sort());
        })
        .on('broadcast', { event: 'teacher_presence_ping' }, () => sendCheckin(channel))
        .on('broadcast', { event: 'teacher_sync_action' }, async ({ payload }) => {
          if (payload.action === 'START' && !matchLaunchedRef.current) {
            matchLaunchedRef.current = true;
            const data = await fetchSetData(assignedSet.id);
            onStartMatch({
              setId: assignedSet.id,
              title: assignedSet.title,
              rounds: data.rounds,
              joinedRoom,
              opponents: [{ id: 'class', name: 'Cả lớp' }],
              myId: uniqueId,
              startIndex: payload.index || 0,
              grade: studentGrade
            } as any);
          }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ online: true, role: 'student', grade: studentGrade });
            sendCheckin(channel);
            channel.send({ type: 'broadcast', event: 'ask_session_state' });
          }
        });

      channelRef.current = channel;
      return () => { supabase.removeChannel(channel); };
    }
  }, [gameState, currentTeacher, playerName, uniqueId, assignedSet]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8">
         <div className="w-20 h-20 border-8 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-8"></div>
         <p className="text-white font-black italic uppercase tracking-widest animate-pulse">Đang kết nối phòng học...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-100">
      <div className="bg-white rounded-[4.5rem] p-10 shadow-2xl max-w-5xl w-full border-b-[15px] border-rose-500 flex flex-col items-center animate-in zoom-in">
           <div className="w-full flex justify-between items-start mb-10 border-b-2 border-slate-50 pb-8">
              <div className="text-left">
                 <h2 className="text-4xl font-black text-slate-800 uppercase italic">LỚP HỌC: {currentTeacher?.tengv.toUpperCase()}</h2>
                 <p className="text-blue-600 font-bold italic uppercase text-xs mt-2">Mã GV: {currentTeacher?.magv}</p>
              </div>
              <button onClick={() => { setJoinedRoom(null); setGameState('ROOM_SELECTION'); }} className="bg-slate-100 text-slate-400 px-8 py-3 rounded-2xl font-black text-[10px] uppercase italic">✕ RỜI PHÒNG</button>
           </div>

           <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-10">
              <div className="lg:col-span-4 flex flex-col items-center justify-center bg-slate-50 rounded-[3.5rem] p-10 border-4 border-white shadow-inner">
                 <div className="w-40 h-40 bg-rose-100 rounded-[3rem] flex items-center justify-center text-7xl mb-6 shadow-xl border-4 border-white">👨‍🏫</div>
                 <h3 className="text-2xl font-black text-slate-800 uppercase italic text-center mb-2">{currentTeacher?.tengv}</h3>
                 
                 {assignedSet ? (
                   <div className="mt-8 w-full p-8 bg-white rounded-[2.5rem] border-2 border-blue-100 text-center animate-pulse">
                      <p className="text-blue-600 font-black uppercase italic text-sm mb-2">ĐỀ ĐÃ SẴN SÀNG!</p>
                      <p className="text-slate-400 font-bold italic text-[10px] leading-relaxed">"{assignedSet.title}"<br/>Vui lòng đợi Thầy nhấn Bắt đầu.</p>
                   </div>
                 ) : (
                   <div className="mt-8 w-full p-8 bg-rose-50 rounded-[2.5rem] border-2 border-rose-100 text-center">
                      <p className="text-rose-500 font-black uppercase italic text-xs leading-relaxed">Thầy chưa gán bộ đề Khối {studentGrade} cho phòng LIVE.</p>
                   </div>
                 )}
              </div>

              <div className="lg:col-span-8 bg-slate-900 rounded-[3.5rem] p-10 flex flex-col shadow-2xl">
                 <div className="mb-8 px-2 flex justify-between items-center">
                    <span className="text-[11px] font-black text-blue-400 uppercase italic tracking-widest">HS ĐANG CÓ MẶT ({presentStudents.length})</span>
                    <span className="text-[9px] font-black text-white/40 uppercase italic">Khối {studentGrade}</span>
                 </div>
                 <div className="flex-1 overflow-y-auto no-scrollbar grid grid-cols-2 gap-4 min-h-[350px] content-start">
                    {presentStudents.map((name, i) => (
                       <div key={i} className={`flex items-center gap-4 p-4 rounded-3xl border-2 transition-all ${name === playerName ? 'bg-blue-600 border-blue-400 shadow-xl' : 'bg-white/5 border-white/5'}`}>
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm ${name === playerName ? 'bg-white text-blue-600' : 'bg-slate-800 text-slate-400'}`}>👤</div>
                          <div className={`text-xs font-black uppercase italic truncate ${name === playerName ? 'text-white' : 'text-slate-300'}`}>{name}</div>
                       </div>
                    ))}
                 </div>
              </div>
           </div>
      </div>
    </div>
  );
};

export default TeacherArenaManager;
