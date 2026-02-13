
import React, { useState, useEffect, useRef } from 'react';
import { Round, Teacher } from '../../types';
import { supabase, getRoomAssignmentsWithMeta } from '../../services/supabaseService';
import Whiteboard from '../Whiteboard';

interface ControlPanelProps {
  teacherId: string;
  teacherMaGV: string;
  loadedSetId: string | null;
  loadedSetTitle: string | null;
  rounds: Round[];
  liveSessionKey?: number;
}

interface StudentSessionInfo {
  name: string;
  score: number;
  progress: string;
  lastStatus: string;
  isOnline: boolean;
  grade?: string; 
  uniqueId: string;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ 
  teacherId, teacherMaGV, loadedSetId, loadedSetTitle, rounds, liveSessionKey 
}) => {
  const [studentRegistry, setStudentRegistry] = useState<Record<string, StudentSessionInfo>>({});
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(-1);
  const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);
  const [assignedSet, setAssignedSet] = useState<any>(null);
  const channelRef = useRef<any>(null);
  const heartbeatRef = useRef<any>(null);

  const refreshAssignedSet = async () => {
    try {
      const sets = await getRoomAssignmentsWithMeta(teacherId, 'TEACHER_LIVE');
      if (sets && sets.length > 0) {
        const sorted = [...sets].sort((a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime());
        setAssignedSet(sorted[0]);
      } else { 
        setAssignedSet(null); 
      }
    } catch (e) { 
      console.error("Lỗi refresh đề gán:", e); 
    }
  };

  useEffect(() => { 
    refreshAssignedSet(); 
  }, [teacherId, loadedSetId, liveSessionKey]);

  useEffect(() => {
    if (currentQuestionIdx >= 0 && assignedSet && channelRef.current) {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => {
        channelRef.current.send({
          type: 'broadcast',
          event: 'teacher_command',
          payload: { 
            type: 'SYNC', 
            setId: assignedSet.id, 
            index: currentQuestionIdx, 
            active: isWhiteboardActive 
          }
        });
      }, 3000);
    }
    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); };
  }, [currentQuestionIdx, assignedSet, isWhiteboardActive]);

  useEffect(() => {
    const channelName = `room_TEACHER_LIVE_${teacherId}`;
    const channel = supabase.channel(channelName);
    
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const onlineKeys = Object.keys(state);
        setStudentRegistry(prev => {
          const next = { ...prev };
          onlineKeys.forEach(key => {
            const parts = key.split('::');
            const name = parts[0];
            const uid = parts[1] || 'temp';
            if (!next[key]) {
              next[key] = { name, uniqueId: uid, score: 0, progress: 'Đã kết nối', lastStatus: 'Online', isOnline: true };
            } else { 
              next[key].isOnline = true; 
            }
          });
          Object.keys(next).forEach(key => { if (!onlineKeys.includes(key)) next[key].isOnline = false; });
          return next;
        });
      })
      .on('broadcast', { event: 'student_presence_report' }, ({ payload }) => {
        const key = `${payload.name}::${payload.uniqueId}`;
        setStudentRegistry(prev => ({
          ...prev,
          [key]: { ...(prev[key] || { score: 0, progress: '...', lastStatus: 'Online' }), ...payload, isOnline: true }
        }));
      })
      .on('broadcast', { event: 'student_score_update' }, ({ payload }) => {
        const key = `${payload.name}::${payload.uniqueId}`;
        setStudentRegistry(prev => ({ ...prev, [key]: { ...prev[key], ...payload, isOnline: true } }));
      })
      .on('broadcast', { event: 'request_sync' }, () => {
        if (currentQuestionIdx >= 0 && assignedSet) {
          channel.send({
            type: 'broadcast',
            event: 'teacher_command',
            payload: { type: 'SYNC', setId: assignedSet.id, index: currentQuestionIdx, active: isWhiteboardActive }
          });
        }
      })
      .subscribe();

    channelRef.current = channel;
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [teacherId, liveSessionKey, currentQuestionIdx, assignedSet, isWhiteboardActive]);

  const sendCommand = (type: string, payload: any = {}) => {
    if (!assignedSet) return;
    channelRef.current?.send({
      type: 'broadcast',
      event: 'teacher_command',
      payload: { type, setId: assignedSet.id, ...payload }
    });
  };

  const studentsList = Object.values(studentRegistry).sort((a, b) => {
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
    return b.score - a.score;
  });

  return (
    <div className="flex flex-col gap-6 h-full text-left">
      <header className="bg-white p-8 rounded-[3.5rem] shadow-2xl border-4 border-slate-50 flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-6">
           <div className="bg-slate-900 text-white p-5 rounded-[2rem] text-center min-w-[120px] shadow-xl border-b-8 border-slate-800">
              <span className="text-[9px] font-black uppercase text-blue-400 block mb-1">MÃ PHÒNG</span>
              <div className="text-3xl font-black italic tracking-widest leading-none">{teacherMaGV}</div>
           </div>
           <div>
              <h3 className="text-2xl font-black text-slate-800 uppercase italic leading-none">ĐIỀU PHỐI ARENA</h3>
              <p className="text-xs font-bold text-blue-600 italic uppercase leading-none mt-3">
                 {assignedSet ? `Đang dạy: ${assignedSet.title}` : '⚠️ VUI LÒNG GÁN ĐỀ VÀO PHÒNG LIVE'}
              </p>
           </div>
        </div>

        <div className="flex flex-wrap gap-3">
           {currentQuestionIdx >= 0 ? (
             <>
               <button 
                 onClick={() => { 
                   const next = currentQuestionIdx + 1; 
                   setCurrentQuestionIdx(next); 
                   sendCommand('MOVE', { index: next }); 
                 }} 
                 className="px-8 py-5 bg-blue-600 text-white rounded-2xl font-black italic shadow-xl border-b-8 border-blue-800 active:translate-y-2 active:border-b-0 transition-all"
               >
                 CÂU TIẾP THEO ⏩
               </button>
               <button 
                 onClick={() => sendCommand('RESET', { index: currentQuestionIdx })} 
                 className="px-6 py-5 bg-amber-500 text-white rounded-2xl font-black italic shadow-xl border-b-8 border-amber-700 active:translate-y-2 active:border-b-0 transition-all"
               >
                 PHÁT LẠI CÂU NÀY 🔄
               </button>
             </>
           ) : (
             <button 
                onClick={() => { 
                  setCurrentQuestionIdx(0); 
                  sendCommand('START', { index: 0 }); 
                }} 
                disabled={!assignedSet} 
                className="px-10 py-5 bg-emerald-600 text-white rounded-2xl font-black italic shadow-xl border-b-8 border-emerald-800 disabled:opacity-50 hover:scale-105 transition-all"
             >
                BẮT ĐẦU TIẾT DẠY 🚀
             </button>
           )}
           <button 
             onClick={() => { 
               const s = !isWhiteboardActive; 
               setIsWhiteboardActive(s); 
               sendCommand('WHITEBOARD', { active: s }); 
             }} 
             className={`px-8 py-5 rounded-2xl font-black italic shadow-lg border-b-4 transition-all ${isWhiteboardActive ? 'bg-slate-900 text-white border-slate-950' : 'bg-slate-100 text-slate-400 border-slate-200'}`}
           >
             {isWhiteboardActive ? '🎨 ẨN BẢNG GIẢNG' : '🎨 MỞ BẢNG TRẮNG'}
           </button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-12 gap-6 overflow-hidden min-h-0">
         <div className="col-span-8 bg-white rounded-[3.5rem] border-4 border-slate-50 shadow-2xl overflow-hidden relative">
            {isWhiteboardActive ? (
              <Whiteboard isTeacher={true} channel={channelRef.current} roomCode="TEACHER_ROOM" />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-slate-50/50">
                 <div className="text-[10rem] opacity-5 select-none absolute">📺</div>
                 <div className="relative z-10 px-10">
                   <h4 className="text-3xl font-black text-slate-300 uppercase italic tracking-widest leading-tight">
                     {currentQuestionIdx >= 0 ? `BÀI TẬP SỐ ${currentQuestionIdx + 1}` : 'HỆ THỐNG SẴN SÀNG'}
                   </h4>
                   {assignedSet && currentQuestionIdx === -1 && (
                     <p className="mt-6 font-bold text-blue-500 animate-pulse uppercase italic text-sm tracking-widest">
                       Nhấn nút Bắt đầu để học sinh vào bài!
                     </p>
                   )}
                   {!assignedSet && (
                     <div className="mt-8 bg-rose-50 p-6 rounded-3xl border-2 border-rose-100 max-w-sm mx-auto">
                        <p className="text-rose-500 font-black uppercase text-xs">⚠️ CHƯA CÓ ĐỀ</p>
                        <p className="text-slate-400 text-[10px] mt-2 font-bold italic">Vào "Kho đề của tôi" -> Chọn đề -> "Gán Arena" -> Chọn "Phòng GV LIVE"</p>
                     </div>
                   )}
                 </div>
              </div>
            )}
         </div>

         <div className="col-span-4 bg-white rounded-[3.5rem] border-4 border-slate-50 shadow-2xl flex flex-col overflow-hidden">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
               <span className="text-[10px] font-black uppercase italic tracking-widest">LỚP HỌC TRỰC TUYẾN ({studentsList.filter((s) => s.isOnline).length})</span>
               <button onClick={() => channelRef.current?.send({ type: 'broadcast', event: 'teacher_ping' })} className="text-[9px] font-bold text-blue-400 uppercase hover:underline">Làm mới 🔄</button>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar">
               {studentsList.length > 0 ? studentsList.map((s, i) => (
                 <div key={i} className={`flex items-center gap-4 p-5 border-b border-slate-50 transition-all ${!s.isOnline ? 'opacity-30 grayscale' : 'hover:bg-slate-50'}`}>
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-black shadow-inner">👤</div>
                    <div className="flex-1 min-w-0">
                       <div className="font-black text-slate-800 uppercase italic text-xs truncate">{s.name} <span className="text-[9px] text-blue-500 italic opacity-60">K{s.grade}</span></div>
                       <div className="text-[9px] font-bold text-slate-400 uppercase italic truncate mt-1">{s.progress}</div>
                    </div>
                    <div className="text-right">
                       <div className="text-lg font-black text-blue-600 italic leading-none">{s.score}đ</div>
                       <div className={`text-[8px] font-black mt-1.5 uppercase italic px-2 py-0.5 rounded ${s.lastStatus.includes('ĐÚNG') ? 'bg-emerald-500 text-white' : s.lastStatus.includes('SAI') ? 'bg-rose-500 text-white' : 'text-slate-300'}`}>{s.lastStatus}</div>
                    </div>
                 </div>
               )) : (
                 <div className="h-full flex flex-col items-center justify-center p-12 text-center opacity-20">
                    <div className="text-6xl mb-4">💤</div>
                    <p className="font-black uppercase italic text-xs tracking-widest">Đang chờ học sinh...</p>
                 </div>
               )}
            </div>
         </div>
      </div>
    </div>
  );
};

export default ControlPanel;
