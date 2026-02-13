
import React, { useState, useEffect, useRef } from 'react';
import { Round, Teacher, QuestionType } from '../../types';
import { supabase, fetchSetData, assignSetToRoom } from '../../services/supabaseService';
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
}

const ControlPanel: React.FC<ControlPanelProps> = ({ 
  teacherId, teacherMaGV, loadedSetId, loadedSetTitle, rounds, liveSessionKey 
}) => {
  const [studentRegistry, setStudentRegistry] = useState<Record<string, StudentSessionInfo>>({});
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(-1);
  const [currentSetGrade, setCurrentSetGrade] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    setStudentRegistry({});
    setCurrentQuestionIdx(-1);
    setIsWhiteboardActive(false);
    
    if (loadedSetId) {
       fetchSetData(loadedSetId).then(data => setCurrentSetGrade(data.grade));
    }
  }, [liveSessionKey, teacherId, loadedSetId]);

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
            const name = key.split('::')[0];
            if (!next[key]) {
              next[key] = { name, score: 0, progress: 'Đang chờ...', lastStatus: '-', isOnline: true, grade: presenceData.grade };
            } else {
              next[key].isOnline = true;
            }
          });
          Object.keys(next).forEach(key => { if (!onlineKeys.includes(key)) next[key].isOnline = false; });
          return next;
        });
      })
      .on('broadcast', { event: 'student_report' }, ({ payload }) => {
        const registryKey = `${payload.name}::${payload.uniqueId}`;
        setStudentRegistry(prev => ({
          ...prev,
          [registryKey]: {
            ...prev[registryKey],
            name: payload.name,
            isOnline: true,
            score: payload.score,
            progress: payload.progress,
            lastStatus: payload.status || (payload.isCorrect ? 'ĐÚNG ✅' : 'SAI ❌'),
            hasAnswered: payload.status ? false : true
          }
        }));
      })
      .on('broadcast', { event: 'student_buzzer' }, ({ payload }) => {
        const registryKey = `${payload.name}::${payload.uniqueId}`;
        setStudentRegistry(prev => ({
          ...prev,
          [registryKey]: {
            ...prev[registryKey],
            buzzedAt: Date.now()
          }
        }));
      })
      .on('broadcast', { event: 'ask_session_state' }, () => {
        if (currentQuestionIdx >= 0 && loadedSetId) {
          channel.send({
            type: 'broadcast',
            event: 'teacher_start_game',
            payload: { 
              setId: loadedSetId, 
              title: loadedSetTitle || '', 
              grade: currentSetGrade,
              currentQuestionIndex: currentQuestionIdx,
              isWhiteboardActive 
            }
          });
        }
      })
      .subscribe();

    channelRef.current = channel;
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [teacherId, liveSessionKey, currentQuestionIdx, loadedSetId, loadedSetTitle, isWhiteboardActive, currentSetGrade]);

  const handleStartGame = async () => {
    if (!loadedSetId) { alert("Chọn bộ đề trước khi bắt đầu!"); return; }
    setIsStarting(true);
    try {
      await assignSetToRoom(teacherId, 'TEACHER_ROOM', loadedSetId);
      setCurrentQuestionIdx(0);
      channelRef.current?.send({
        type: 'broadcast',
        event: 'teacher_start_game',
        payload: { 
          setId: loadedSetId, 
          title: loadedSetTitle || '', 
          grade: currentSetGrade,
          currentQuestionIndex: 0 
        }
      });
    } catch (err) { alert("Lỗi kết nối"); } finally { setIsStarting(false); }
  };

  const handleNextQuestion = () => {
    const nextIdx = currentQuestionIdx + 1;
    setCurrentQuestionIdx(nextIdx);
    resetAllStatus();
    channelRef.current?.send({ type: 'broadcast', event: 'teacher_next_question', payload: { nextIndex: nextIdx } });
  };

  const handlePrevQuestion = () => {
    const prevIdx = Math.max(0, currentQuestionIdx - 1);
    setCurrentQuestionIdx(prevIdx);
    resetAllStatus();
    channelRef.current?.send({ type: 'broadcast', event: 'teacher_next_question', payload: { nextIndex: prevIdx } });
  };

  const toggleWhiteboard = () => {
    const newState = !isWhiteboardActive;
    setIsWhiteboardActive(newState);
    channelRef.current?.send({ type: 'broadcast', event: 'teacher_toggle_whiteboard', payload: { active: newState } });
  };

  const resetAllStatus = () => {
    setStudentRegistry(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        delete next[k].buzzedAt;
        delete next[k].hasAnswered;
        next[k].lastStatus = 'Đang làm bài...';
      });
      return next;
    });
  };

  const handleResetCurrent = () => {
    resetAllStatus();
    channelRef.current?.send({ type: 'broadcast', event: 'teacher_reset_question', payload: { index: currentQuestionIdx } });
  };

  const studentsList = Object.values(studentRegistry).sort((a, b) => {
    // Ưu tiên hiển thị người giành chuông lên đầu
    if (a.buzzedAt && !a.hasAnswered && (!b.buzzedAt || b.hasAnswered)) return -1;
    if (b.buzzedAt && !b.hasAnswered && (!a.buzzedAt || a.hasAnswered)) return 1;
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
              <p className="text-xs font-bold text-slate-400 mt-2 uppercase italic truncate max-w-xs">{loadedSetTitle || "Chưa gán đề"} (K{currentSetGrade})</p>
           </div>
        </div>

        <div className="flex items-center gap-3">
           {currentQuestionIdx >= 0 && (
              <div className="flex gap-2 mr-4">
                 <button onClick={handlePrevQuestion} className="w-12 h-12 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center hover:bg-slate-200 transition-all text-xs border-b-4 border-slate-200 active:border-b-0 active:translate-y-1">◀</button>
                 <button onClick={handleNextQuestion} className="w-12 h-12 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center hover:bg-slate-200 transition-all text-xs border-b-4 border-slate-200 active:border-b-0 active:translate-y-1">▶</button>
              </div>
           )}
           <button onClick={toggleWhiteboard} className={`px-8 py-5 rounded-2xl font-black uppercase italic shadow-lg transition-all flex items-center gap-3 border-b-4 ${isWhiteboardActive ? 'bg-emerald-600 text-white border-emerald-800' : 'bg-slate-800 text-white border-slate-950'}`}>
              <span className="text-xl">🎨</span> {isWhiteboardActive ? 'ĐANG GIẢNG BÀI' : 'MỞ BẢNG TRẮNG'}
           </button>
           {currentQuestionIdx === -1 ? (
             <button onClick={handleStartGame} disabled={isStarting || !loadedSetId} className="px-10 py-5 bg-blue-600 text-white rounded-2xl font-black uppercase italic shadow-xl border-b-8 border-blue-800 hover:scale-105 transition-all">PHÁT ĐỀ K{currentSetGrade} 🚀</button>
           ) : (
             <button onClick={handleResetCurrent} className="px-8 py-5 bg-amber-500 text-white rounded-2xl font-black uppercase italic shadow-xl border-b-8 border-amber-700 active:border-b-0 active:translate-y-2 transition-all">LÀM LẠI CÂU NÀY 🔔</button>
           )}
        </div>
      </header>

      <div className="flex-1 grid grid-cols-12 gap-6 min-h-0 overflow-hidden">
         <div className="col-span-12 lg:col-span-8 flex flex-col gap-6">
            <div className="flex-1 bg-white rounded-[3.5rem] border-4 border-slate-50 shadow-2xl overflow-hidden relative">
               {isWhiteboardActive ? (
                 <Whiteboard isTeacher={true} channel={channelRef.current} roomCode="TEACHER_ROOM" />
               ) : (
                 <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-slate-50/50">
                    <div className="text-[8rem] opacity-10 mb-6">📺</div>
                    <h4 className="text-2xl font-black text-slate-300 uppercase italic tracking-widest">Màn hình Câu {currentQuestionIdx + 1}</h4>
                    {currentQuestionIdx >= 0 && (
                       <div className="mt-8 px-10 py-6 bg-white rounded-3xl border-2 border-slate-100 shadow-sm max-w-lg">
                          <p className="font-bold text-slate-500 italic leading-relaxed">"Học sinh khối {currentSetGrade} đang nhận bài. Hãy quan sát bảng danh sách bên phải để theo dõi tiến độ của các em."</p>
                       </div>
                    )}
                 </div>
               )}
            </div>
         </div>

         <div className="col-span-12 lg:col-span-4 bg-white rounded-[3.5rem] border-4 border-slate-50 shadow-2xl flex flex-col overflow-hidden">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
               <span className="text-[10px] font-black uppercase italic tracking-widest">LỚP HỌC LIVE ({studentsList.length})</span>
               {currentQuestionIdx >= 0 && <span className="text-[10px] font-black uppercase bg-blue-600 px-3 py-1 rounded-full italic shadow-lg">CÂU {currentQuestionIdx + 1}</span>}
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar">
               {studentsList.length > 0 ? studentsList.map((s, i) => (
                 <div key={i} className={`flex items-center gap-4 p-5 border-b border-slate-50 transition-all ${s.buzzedAt && !s.hasAnswered ? 'bg-amber-50 animate-pulse' : ''}`}>
                    <div className="relative">
                       <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg shadow-sm border-2 ${s.isOnline ? 'bg-blue-50 border-blue-100 text-blue-600' : 'bg-slate-100 border-slate-200 text-slate-300'}`}>👤</div>
                       {s.buzzedAt && !s.hasAnswered && <div className="absolute -top-1 -right-1 bg-amber-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shadow-md border-2 border-white animate-bounce">🔔</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                       <div className="font-black text-slate-800 uppercase italic text-xs truncate">{s.name} <span className="text-[8px] opacity-40">K{s.grade}</span></div>
                       <div className={`text-[9px] font-bold uppercase italic mt-0.5 ${s.buzzedAt && !s.hasAnswered ? 'text-amber-600' : 'text-slate-400'}`}>
                          {s.buzzedAt && !s.hasAnswered ? 'ĐÃ GIÀNH QUYỀN!' : s.progress}
                       </div>
                    </div>
                    <div className="text-right">
                       <div className="text-xl font-black text-blue-600 italic leading-none">{s.score}đ</div>
                       <div className={`text-[8px] font-black uppercase mt-1 ${s.lastStatus.includes('ĐÚNG') ? 'text-emerald-500' : s.lastStatus.includes('SAI') ? 'text-rose-500' : 'text-slate-300'}`}>
                          {s.lastStatus}
                       </div>
                    </div>
                 </div>
               )) : (
                 <div className="h-full flex flex-col items-center justify-center p-10 text-center opacity-20">
                    <div className="text-6xl mb-4">📡</div>
                    <p className="font-black uppercase italic text-xs tracking-widest leading-relaxed">Đang đợi học sinh kết nối vào phòng...</p>
                 </div>
               )}
            </div>
         </div>
      </div>
    </div>
  );
};

export default ControlPanel;
