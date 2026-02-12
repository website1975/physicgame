
import React, { useState, useEffect, useRef } from 'react';
import { Round, Teacher } from '../../types';
// Fixed: Changed assignSetToTeacherRoom to assignSetToRoom which exists in supabaseService
import { supabase, getLatestRoomAssignment, fetchSetData, assignSetToRoom } from '../../services/supabaseService';

interface ControlPanelProps {
  teacherId: string;
  teacherMaGV: string;
  loadedSetId: string | null;
  loadedSetTitle: string | null;
  rounds: Round[];
  liveSessionKey?: number;
}

// Interface for typed student session tracking
interface StudentSessionInfo {
  name: string;
  score: number;
  progress: string;
  lastStatus: string;
  isOnline: boolean;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ 
  teacherId, teacherMaGV, loadedSetId, loadedSetTitle, rounds, liveSessionKey 
}) => {
  const [studentRegistry, setStudentRegistry] = useState<Record<string, StudentSessionInfo>>({});
  const [activeSetInfo, setActiveSetInfo] = useState<{ id: string, title: string } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(-1); // -1: Chờ, 0+: Đang làm câu X
  const [isStarting, setIsStarting] = useState(false);
  const channelRef = useRef<any>(null);

  const refreshActiveSet = async () => {
    setIsRefreshing(true);
    try {
      const setId = await getLatestRoomAssignment(teacherId, 'TEACHER_ROOM');
      if (setId) {
        const data = await fetchSetData(setId);
        setActiveSetInfo({ id: setId, title: data.title });
      } else {
        setActiveSetInfo(null);
      }
    } catch (e) { console.error(e); } finally { setIsRefreshing(false); }
  };

  useEffect(() => {
    refreshActiveSet();
    setStudentRegistry({});
    setCurrentQuestionIdx(-1);
  }, [liveSessionKey, teacherId]);

  useEffect(() => {
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    
    const channelName = `room_TEACHER_LIVE_${teacherId}`;
    const channel = supabase.channel(channelName);
    
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const onlineKeys = Object.keys(state);
        setStudentRegistry(prev => {
          const next = { ...prev };
          onlineKeys.forEach(key => {
            const name = key.split('::')[0];
            if (!next[key]) next[key] = { name, score: 0, progress: 'Đang chờ...', lastStatus: '-', isOnline: true };
            else next[key].isOnline = true;
          });
          Object.keys(next).forEach(key => { if (!onlineKeys.includes(key)) next[key].isOnline = false; });
          return next;
        });
      })
      .on('broadcast', { event: 'student_report' }, ({ payload }) => {
        const registryKey = `${payload.name}::${payload.uniqueId}`;
        setStudentRegistry(prev => {
          const existing = prev[registryKey];
          return {
            ...prev,
            [registryKey]: {
              name: existing?.name || payload.name,
              isOnline: true,
              score: payload.score,
              progress: payload.progress,
              lastStatus: payload.isCorrect ? 'ĐÚNG ✅' : 'SAI ❌'
            }
          };
        });
      })
      .on('broadcast', { event: 'ask_session_state' }, () => {
        // HS hỏi trạng thái (cho trường hợp vào muộn hoặc mất mạng quay lại)
        if (currentQuestionIdx >= 0 && loadedSetId) {
          channel.send({
            type: 'broadcast',
            event: 'teacher_start_game',
            payload: { setId: loadedSetId, title: loadedSetTitle || '', currentQuestionIndex: currentQuestionIdx }
          });
        }
      })
      .subscribe();

    channelRef.current = channel;
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [teacherId, liveSessionKey, currentQuestionIdx, loadedSetId, loadedSetTitle]);

  const handleStartGame = async () => {
    if (!loadedSetId) { 
      alert("⚠️ Không tìm thấy đề đang chọn! Vui lòng vào Kho Đề và nhấn 'DÙNG CHO TIẾT DẠY' trước."); 
      return; 
    }
    
    setIsStarting(true);
    try {
      // Đảm bảo gán đề vào cơ sở dữ liệu để HS vào sau vẫn nhận được
      // Fixed: Replaced assignSetToTeacherRoom with assignSetToRoom using 'TEACHER_ROOM' code
      await assignSetToRoom(teacherId, 'TEACHER_ROOM', loadedSetId);
      
      setCurrentQuestionIdx(0);
      setActiveSetInfo({ id: loadedSetId, title: loadedSetTitle || 'Bộ đề' });

      // Phát sóng tín hiệu bắt đầu 5 lần để đảm bảo HS nhận được dù mạng yếu
      let count = 0;
      const interval = setInterval(() => {
        channelRef.current?.send({
          type: 'broadcast',
          event: 'teacher_start_game',
          payload: { 
            setId: loadedSetId, 
            title: loadedSetTitle || '', 
            currentQuestionIndex: 0 
          }
        });
        count++;
        if (count >= 5) clearInterval(interval);
      }, 300);

    } catch (err) {
      alert("Lỗi khi bắt đầu tiết dạy. Vui lòng thử lại!");
    } finally {
      setIsStarting(false);
    }
  };

  const handleNextQuestion = () => {
    const nextIdx = currentQuestionIdx + 1;
    setCurrentQuestionIdx(nextIdx);
    
    channelRef.current?.send({
      type: 'broadcast',
      event: 'teacher_next_question',
      payload: { nextIndex: nextIdx }
    });
  };

  const studentsList = (Object.values(studentRegistry) as StudentSessionInfo[]).sort((a, b) => b.score - a.score);

  return (
    <div className="flex flex-col gap-6 h-full text-left">
      <header className="bg-white p-8 rounded-[3rem] shadow-xl border-4 border-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-6">
           <div className="bg-slate-950 text-white p-5 rounded-[2rem] text-center min-w-[140px] shadow-2xl border-b-8 border-slate-800">
              <span className="text-[10px] font-black uppercase text-blue-400 block mb-1">MÃ PHÒNG</span>
              <div className="text-3xl font-black italic tracking-widest">{teacherMaGV}</div>
           </div>
           <div>
              <h3 className="text-2xl font-black text-slate-800 uppercase italic leading-none">Điều phối tiết dạy</h3>
              <div className="flex items-center gap-2 mt-2">
                 <p className="text-xs font-bold uppercase text-slate-400">
                   {loadedSetTitle ? `Sẵn sàng: ${loadedSetTitle}` : (activeSetInfo ? `Đang dạy: ${activeSetInfo.title}` : '⚠️ CHƯA GÁN ĐỀ')}
                 </p>
              </div>
           </div>
        </div>

        <div className="flex gap-4">
           {currentQuestionIdx === -1 ? (
             <button 
               onClick={handleStartGame}
               disabled={isStarting || !loadedSetId}
               className={`px-12 py-6 rounded-[2rem] font-black uppercase italic shadow-xl border-b-8 transition-all flex items-center gap-3
                 ${isStarting || !loadedSetId 
                   ? 'bg-slate-200 text-slate-400 border-slate-300' 
                   : 'bg-blue-600 text-white border-blue-800 hover:scale-105 active:translate-y-2 active:border-b-0'}`}
             >
               <span className="text-2xl">{isStarting ? '⏳' : '🚀'}</span> 
               {isStarting ? 'ĐANG KHỞI TẠO...' : 'BẮT ĐẦU TIẾT DẠY'}
             </button>
           ) : (
             <button 
               onClick={handleNextQuestion}
               className="px-12 py-6 bg-emerald-500 text-white rounded-[2rem] font-black uppercase italic shadow-xl border-b-8 border-emerald-700 hover:scale-105 active:translate-y-2 active:border-b-0 transition-all flex items-center gap-3"
             >
               <span className="text-2xl">⏩</span> CÂU KẾ TIẾP ({currentQuestionIdx + 1})
             </button>
           )}
        </div>
      </header>

      <div className="flex-1 bg-white rounded-[3.5rem] border-4 border-slate-50 shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 bg-slate-50 border-b-2 border-slate-100 flex justify-between items-center">
           <span className="text-[10px] font-black text-slate-400 uppercase italic">Thành viên trong phòng ({studentsList.length})</span>
           <div className="flex items-center gap-3">
              {currentQuestionIdx >= 0 && (
                <div className="px-4 py-1.5 bg-blue-100 text-blue-600 rounded-full text-[10px] font-black uppercase italic">
                  ĐANG Ở CÂU {currentQuestionIdx + 1}
                </div>
              )}
           </div>
        </div>
        <div className="flex-1 overflow-y-auto no-scrollbar">
           <table className="w-full text-left">
              <thead className="sticky top-0 bg-white shadow-sm z-10">
                 <tr>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase italic">Học sinh</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase italic text-center">Tiến trình</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase italic text-right">Trạng thái & Điểm</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                 {studentsList.length > 0 ? studentsList.map((s, i) => (
                    <tr key={i} className={`hover:bg-slate-50/50 transition-colors ${!s.isOnline ? 'opacity-40' : ''}`}>
                       <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                             <div className={`w-3 h-3 rounded-full ${s.isOnline ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]' : 'bg-slate-300'}`}></div>
                             <div className="font-black text-slate-800 uppercase italic text-sm">{s.name}</div>
                          </div>
                       </td>
                       <td className="px-8 py-6 text-center">
                          <span className="bg-slate-100 px-4 py-1.5 rounded-full font-bold text-[10px] text-slate-500 border border-slate-200 uppercase italic">
                             {s.progress}
                          </span>
                       </td>
                       <td className="px-8 py-6 text-right">
                          <div className="flex flex-col items-end">
                             <span className="text-2xl font-black text-blue-600 leading-none">{s.score}đ</span>
                             <span className={`text-[9px] font-black uppercase mt-1 ${s.lastStatus.includes('ĐÚNG') ? 'text-emerald-500' : (s.lastStatus.includes('SAI') ? 'text-rose-500' : 'text-slate-400')}`}>
                                {s.lastStatus}
                             </span>
                          </div>
                       </td>
                    </tr>
                 )) : (
                    <tr>
                       <td colSpan={3} className="py-20 text-center">
                          <div className="text-5xl mb-4 grayscale opacity-20">📡</div>
                          <p className="font-black uppercase italic text-slate-300 text-sm tracking-widest">Chưa có học sinh nào kết nối...</p>
                       </td>
                    </tr>
                 )}
              </tbody>
           </table>
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;
