
import React, { useState, useEffect, useRef } from 'react';
import { Round, Teacher, QuestionType } from '../../types';
import { supabase, fetchSetData, getRoomAssignmentsWithMeta } from '../../services/supabaseService';
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
  buzzedAt?: number;
  hasAnswered?: boolean;
  grade?: string; 
  uniqueId: string;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ 
  teacherId, teacherMaGV, loadedSetId, loadedSetTitle, rounds, liveSessionKey 
}) => {
  const [studentRegistry, setStudentRegistry] = useState<Record<string, StudentSessionInfo>>({});
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(-1);
  const [isStarting, setIsStarting] = useState(false);
  const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);
  const [assignedSet, setAssignedSet] = useState<any>(null);
  const channelRef = useRef<any>(null);

  // Lấy thông tin bộ đề đã gán cho phòng LIVE của GV này
  useEffect(() => {
    const checkAssignment = async () => {
      const sets = await getRoomAssignmentsWithMeta(teacherId, 'TEACHER_LIVE');
      if (sets && sets.length > 0) {
        setAssignedSet(sets[0]);
      } else {
        setAssignedSet(null);
      }
    };
    checkAssignment();
  }, [teacherId, loadedSetId]);

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
            const presenceData = state[key][0] as any;
            const [name, uid] = key.split('::');
            if (!next[key]) {
              next[key] = { 
                name, uniqueId: uid, score: 0, progress: 'Đã kết nối', 
                lastStatus: 'Chờ lệnh...', isOnline: true, grade: presenceData.grade 
              };
            } else {
              next[key].isOnline = true;
            }
          });
          Object.keys(next).forEach(key => { if (!onlineKeys.includes(key)) next[key].isOnline = false; });
          return next;
        });
      })
      .on('broadcast', { event: 'student_checkin' }, ({ payload }) => {
        const key = `${payload.name}::${payload.uniqueId}`;
        setStudentRegistry(prev => ({
          ...prev,
          [key]: {
            ...(prev[key] || { score: 0, progress: 'Đang đợi...', lastStatus: 'Vừa vào' }),
            name: payload.name, uniqueId: payload.uniqueId, grade: payload.grade, isOnline: true
          }
        }));
      })
      .on('broadcast', { event: 'student_report' }, ({ payload }) => {
        const key = `${payload.name}::${payload.uniqueId}`;
        setStudentRegistry(prev => ({
          ...prev,
          [key]: {
            ...prev[key],
            score: payload.score ?? prev[key]?.score ?? 0,
            progress: payload.progress || prev[key]?.progress || '...',
            lastStatus: payload.status || (payload.isCorrect ? 'ĐÚNG ✅' : 'SAI ❌'),
            hasAnswered: payload.isFinished ? true : false,
            isOnline: true
          }
        }));
      })
      .on('broadcast', { event: 'student_buzzer' }, ({ payload }) => {
        const key = `${payload.name}::${payload.uniqueId}`;
        setStudentRegistry(prev => ({
          ...prev,
          [key]: { ...prev[key], buzzedAt: Date.now(), isOnline: true, lastStatus: 'ĐÃ GIÀNH QUYỀN! 🔔' }
        }));
      })
      .on('broadcast', { event: 'ask_session_state' }, () => {
        if (currentQuestionIdx >= 0 && assignedSet) {
          channel.send({
            type: 'broadcast',
            event: 'teacher_sync_action',
            payload: { 
              action: 'START',
              setId: assignedSet.id, 
              index: currentQuestionIdx,
              isWhiteboardActive 
            }
          });
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          channel.send({ type: 'broadcast', event: 'teacher_presence_ping' });
        }
      });

    channelRef.current = channel;
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [teacherId, liveSessionKey, currentQuestionIdx, assignedSet, isWhiteboardActive]);

  const handleStartGame = () => {
    if (!assignedSet) { alert("Bạn chưa gán đề cho phòng LIVE! Hãy vào 'Kho đề' -> 'Gán Arena' -> 'Phòng GV LIVE'"); return; }
    setCurrentQuestionIdx(0);
    channelRef.current?.send({
      type: 'broadcast',
      event: 'teacher_sync_action',
      payload: { action: 'START', setId: assignedSet.id, index: 0 }
    });
  };

  const handleNextQuestion = () => {
    const nextIdx = currentQuestionIdx + 1;
    setCurrentQuestionIdx(nextIdx);
    channelRef.current?.send({ 
      type: 'broadcast', 
      event: 'teacher_sync_action', 
      payload: { action: 'MOVE', index: nextIdx } 
    });
  };

  const handleResetCurrent = () => {
    channelRef.current?.send({ 
      type: 'broadcast', 
      event: 'teacher_sync_action', 
      payload: { action: 'RESET', index: currentQuestionIdx } 
    });
  };

  const toggleWhiteboard = () => {
    const newState = !isWhiteboardActive;
    setIsWhiteboardActive(newState);
    channelRef.current?.send({ type: 'broadcast', event: 'teacher_sync_action', payload: { action: 'WHITEBOARD', active: newState } });
  };

  const studentsList = Object.values(studentRegistry).sort((a, b) => {
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
    return b.score - a.score;
  });

  return (
    <div className="flex flex-col gap-6 h-full text-left animate-in fade-in">
      <header className="bg-white p-8 rounded-[3.5rem] shadow-2xl border-4 border-slate-50 flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-6">
           <div className="bg-slate-900 text-white p-5 rounded-[2rem] text-center min-w-[120px] shadow-xl border-b-8 border-slate-800">
              <span className="text-[9px] font-black uppercase text-blue-400 block mb-1">MÃ PHÒNG</span>
              <div className="text-3xl font-black italic tracking-widest">{teacherMaGV}</div>
           </div>
           <div>
              <h3 className="text-2xl font-black text-slate-800 uppercase italic leading-none">QUẢN LÝ TIẾT DẠY</h3>
              {assignedSet ? (
                <p className="text-xs font-bold text-blue-600 mt-2 uppercase italic">Đang gán: {assignedSet.title} (K{assignedSet.grade})</p>
              ) : (
                <p className="text-xs font-bold text-rose-500 mt-2 uppercase italic">⚠️ CHƯA GÁN ĐỀ CHO PHÒNG LIVE</p>
              )}
           </div>
        </div>

        <div className="flex items-center gap-3">
           {currentQuestionIdx >= 0 ? (
             <>
               <button onClick={handleNextQuestion} className="px-8 py-5 bg-blue-600 text-white rounded-2xl font-black uppercase italic shadow-xl border-b-8 border-blue-800 hover:scale-105 active:translate-y-2 active:border-b-0 transition-all">CÂU TIẾP THEO ⏩</button>
               <button onClick={handleResetCurrent} className="px-6 py-5 bg-amber-500 text-white rounded-2xl font-black uppercase italic shadow-xl border-b-8 border-amber-700 active:translate-y-2 active:border-b-0 transition-all">LÀM LẠI 🔔</button>
             </>
           ) : (
             <button onClick={handleStartGame} disabled={!assignedSet} className="px-10 py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase italic shadow-xl border-b-8 border-emerald-800 hover:scale-105 transition-all">BẮT ĐẦU TIẾT DẠY 🚀</button>
           )}
           <button onClick={toggleWhiteboard} className={`px-8 py-5 rounded-2xl font-black uppercase italic shadow-lg transition-all flex items-center gap-3 border-b-4 ${isWhiteboardActive ? 'bg-slate-900 text-white border-slate-950' : 'bg-slate-100 text-slate-400'}`}>
              🎨 {isWhiteboardActive ? 'ĐANG GIẢNG' : 'BẢNG TRẮNG'}
           </button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-12 gap-6 min-h-0 overflow-hidden">
         <div className="col-span-8 flex flex-col gap-6">
            <div className="flex-1 bg-white rounded-[3.5rem] border-4 border-slate-50 shadow-2xl overflow-hidden relative">
               {isWhiteboardActive ? (
                 <Whiteboard isTeacher={true} channel={channelRef.current} roomCode="TEACHER_ROOM" />
               ) : (
                 <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-slate-50/50">
                    <div className="text-[10rem] opacity-5 mb-6">📺</div>
                    <h4 className="text-3xl font-black text-slate-300 uppercase italic tracking-widest">
                      {currentQuestionIdx >= 0 ? `ĐANG CHIẾU CÂU ${currentQuestionIdx + 1}` : 'MÀN HÌNH CHỜ'}
                    </h4>
                 </div>
               )}
            </div>
         </div>

         <div className="col-span-4 bg-white rounded-[3.5rem] border-4 border-slate-50 shadow-2xl flex flex-col overflow-hidden">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
               <span className="text-[10px] font-black uppercase italic tracking-widest">LỚP HỌC LIVE ({studentsList.filter(s=>s.isOnline).length})</span>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar">
               {studentsList.map((s, i) => (
                 <div key={i} className={`flex items-center gap-4 p-5 border-b border-slate-50 ${!s.isOnline ? 'opacity-30' : ''}`}>
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-black">👤</div>
                    <div className="flex-1">
                       <div className="font-black text-slate-800 uppercase italic text-xs">{s.name}</div>
                       <div className="text-[9px] font-bold text-slate-400 uppercase italic">{s.progress}</div>
                    </div>
                    <div className="text-right">
                       <div className="text-lg font-black text-blue-600 italic leading-none">{s.score}đ</div>
                       <div className="text-[8px] font-black text-slate-300 mt-1 uppercase">{s.lastStatus}</div>
                    </div>
                 </div>
               ))}
            </div>
         </div>
      </div>
    </div>
  );
};

export default ControlPanel;
