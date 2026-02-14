
import React, { useState, useEffect, useRef } from 'react';
import { Round, Teacher } from '../../types';
import { supabase } from '../../services/supabaseService';

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
  isOnline: boolean;
  uniqueId: string;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ 
  teacherId, teacherMaGV, loadedSetId, loadedSetTitle, rounds, liveSessionKey 
}) => {
  const [studentRegistry, setStudentRegistry] = useState<Record<string, StudentSessionInfo>>({});
  const [isStarting, setIsStarting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [matchRunning, setMatchRunning] = useState(false);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!teacherId) return;
    
    // Sử dụng tên kênh thống nhất: arena_live_ID
    const channelName = `arena_live_${teacherId.trim()}`;
    const channel = supabase.channel(channelName, {
      config: { presence: { key: 'teacher' } }
    });
    
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const onlineKeys = Object.keys(state);
        
        setStudentRegistry(prev => {
          const next = { ...prev };
          // Reset trạng thái online trước khi cập nhật
          Object.keys(next).forEach(k => { next[k].isOnline = false; });
          
          onlineKeys.forEach(key => {
            if (key === 'teacher') return; // Không hiển thị giáo viên vào danh sách học sinh
            
            const [name, uid] = key.split('::');
            if (!next[key]) {
              next[key] = { 
                name: name || 'Ẩn danh', 
                uniqueId: uid || 'temp', 
                score: 0, 
                progress: 'Đang đợi...', 
                isOnline: true 
              };
            } else { 
              next[key].isOnline = true; 
            }
          });
          return { ...next };
        });
      })
      .on('broadcast', { event: 'student_score_update' }, ({ payload }) => {
        const key = `${payload.name}::${payload.uniqueId}`;
        setStudentRegistry(prev => ({
          ...prev,
          [key]: { 
            ...prev[key], 
            score: payload.score, 
            progress: payload.progress || 'Đang thi đấu', 
            isOnline: true 
          }
        }));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Giáo viên cũng track để kênh luôn hoạt động
          await channel.track({ role: 'teacher' });
        }
      });

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [teacherId]);

  const handleStartMatch = async () => {
    if (!rounds || rounds.length === 0 || (rounds.length === 1 && rounds[0].problems.length === 0)) {
      alert("Workshop đang trống. Vui lòng nạp đề trước khi Start Live!");
      return;
    }
    
    setIsStarting(true);
    setIsPaused(false);
    setMatchRunning(true);
    try {
      channelRef.current.send({
        type: 'broadcast',
        event: 'teacher_command',
        payload: { 
          type: 'START', 
          code: teacherMaGV,
          setId: loadedSetId || 'workshop',
          title: loadedSetTitle || 'Bộ đề trực tiếp',
          rounds: rounds,
          startTime: Date.now() + 500
        }
      });
    } catch (e) {
      alert("Lỗi khi phát lệnh khởi động!");
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopMatch = () => {
    if (!channelRef.current) return;
    setIsPaused(true);
    channelRef.current.send({
      type: 'broadcast',
      event: 'teacher_command',
      payload: { 
        type: 'STOP', 
        code: teacherMaGV,
        message: "Các em ngừng, nghe thầy giảng"
      }
    });
  };

  const handleResumeMatch = () => {
    if (!channelRef.current) return;
    setIsPaused(false);
    channelRef.current.send({
      type: 'broadcast',
      event: 'teacher_command',
      payload: { type: 'RESUME', code: teacherMaGV }
    });
  };

  const handleNextStep = () => {
    if (!channelRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'teacher_command',
      payload: { type: 'SYNC_NEXT', code: teacherMaGV }
    });
  };

  const studentsList = (Object.values(studentRegistry) as StudentSessionInfo[])
    .sort((a, b) => b.score - a.score);

  return (
    <div className="flex flex-col gap-6 h-full text-left">
      <header className="bg-white p-8 rounded-[3rem] shadow-xl border-4 border-slate-50 flex flex-col lg:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-8">
           <div className="bg-slate-900 text-white p-6 rounded-[2rem] text-center min-w-[180px] shadow-lg border-b-8 border-blue-800">
              <span className="text-[9px] font-black uppercase text-blue-400 block mb-1">MÃ PHÒNG LIVE</span>
              <div className="text-4xl font-black italic tracking-widest text-yellow-400">{teacherMaGV}</div>
           </div>
           <div>
              <h3 className="text-2xl font-black text-slate-800 uppercase italic leading-none mb-2">Điều phối Arena</h3>
              <p className="text-[11px] font-bold italic uppercase text-blue-600">
                 {isPaused ? '🛑 ĐANG DỪNG GIẢNG BÀI' : (matchRunning ? '🎮 ĐANG TRONG TRẬN ĐẤU' : '⌛ ĐANG ĐỢI HỌC SINH...')}
              </p>
           </div>
        </div>
        
        <div className="flex flex-wrap gap-3 justify-center">
          {matchRunning && (
            <button onClick={handleNextStep} className="px-8 py-5 bg-indigo-600 text-white rounded-2xl font-black italic shadow-xl border-b-8 border-indigo-800 active:translate-y-1 active:border-b-0 transition-all uppercase text-sm">⏭️ TIẾP THEO</button>
          )}
          {isPaused ? (
            <button onClick={handleResumeMatch} className="px-8 py-5 bg-emerald-600 text-white rounded-2xl font-black italic shadow-xl border-b-8 border-emerald-800 active:translate-y-1 active:border-b-0 transition-all uppercase text-sm">▶️ TIẾP TỤC</button>
          ) : (
            <button onClick={handleStopMatch} className="px-8 py-5 bg-amber-500 text-white rounded-2xl font-black italic shadow-xl border-b-8 border-amber-700 active:translate-y-1 active:border-b-0 transition-all uppercase text-sm">🛑 DỪNG GIẢNG</button>
          )}
          <button onClick={handleStartMatch} disabled={isStarting} className="px-8 py-5 bg-rose-600 text-white rounded-2xl font-black italic shadow-xl border-b-8 border-rose-800 active:translate-y-1 active:border-b-0 transition-all uppercase text-sm">🚀 BẮT ĐẦU LIVE</button>
        </div>
      </header>

      <div className="flex-1 bg-white rounded-[3rem] border-4 border-slate-50 shadow-2xl flex flex-col overflow-hidden">
         <div className="p-6 bg-slate-900 text-white flex justify-between items-center border-b-4 border-blue-600">
            <span className="text-[10px] font-black uppercase italic tracking-widest">Danh sách học sinh ({studentsList.filter(s=>s.isOnline).length})</span>
            <div className="flex gap-4 items-center">
              <div className="flex gap-2 items-center">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></div>
                <span className="text-[9px] font-black text-emerald-500 uppercase italic">Live Sync</span>
              </div>
            </div>
         </div>
         <div className="flex-1 overflow-y-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
               <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                     <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase italic tracking-widest w-20">Hạng</th>
                     <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase italic tracking-widest">Học sinh</th>
                     <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase italic tracking-widest">Tiến độ</th>
                     <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase italic tracking-widest text-center">Điểm</th>
                     <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase italic tracking-widest text-right">Sẵn sàng</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                  {studentsList.length > 0 ? studentsList.map((s, i) => (
                    <tr key={i} className={`hover:bg-blue-50/30 transition-colors ${!s.isOnline ? 'opacity-30' : ''}`}>
                       <td className="px-8 py-5"><div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs ${i < 3 ? 'bg-yellow-400 text-slate-900' : 'bg-slate-100 text-slate-400'}`}>{i+1}</div></td>
                       <td className="px-8 py-5"><div className="font-black text-slate-800 uppercase italic text-sm">{s.name}</div></td>
                       <td className="px-8 py-5"><div className="text-[10px] font-black text-blue-600 uppercase italic">{s.progress}</div></td>
                       <td className="px-8 py-5 text-center"><div className="text-2xl font-black text-slate-900 italic leading-none">{s.score}</div></td>
                       <td className="px-8 py-5 text-right"><span className={`w-3 h-3 rounded-full inline-block ${s.isOnline ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-slate-200'}`}></span></td>
                    </tr>
                  )) : <tr><td colSpan={5} className="py-24 text-center opacity-20 italic font-black uppercase">Đang đợi học sinh kết nối vào kênh arena_live...</td></tr>}
               </tbody>
            </table>
         </div>
      </div>
    </div>
  );
};

export default ControlPanel;
