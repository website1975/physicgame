
import React, { useState, useEffect, useRef } from 'react';
import { GameState, Teacher } from '../../types';
import { supabase } from '../../services/supabaseService';
import KeywordSelector from '../KeywordSelector';

interface TeacherArenaManagerProps {
  playerName: string;
  uniqueId: string;
  currentTeacher: Teacher;
  liveCode?: string | null;
  onStartMatch: (data: any) => void;
  joinedRoom: any;
  setJoinedRoom: (room: any) => void;
  setGameState: (s: GameState) => void;
}

const TeacherArenaManager: React.FC<TeacherArenaManagerProps> = ({
  playerName, uniqueId, currentTeacher, liveCode, onStartMatch, joinedRoom, setJoinedRoom, setGameState
}) => {
  const [presentStudents, setPresentStudents] = useState<string[]>([]);
  const [selectedQuantities, setSelectedQuantities] = useState<string[]>([]);
  const [selectedFormulas, setSelectedFormulas] = useState<string[]>([]);
  const [stopMessage, setStopMessage] = useState<string | null>(null);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!currentTeacher?.id) return;
    
    // Đảm bảo tên channel KHỚP tuyệt đối với ControlPanel bên Thầy
    const channelName = `teacher_control_${currentTeacher.id.trim()}`;
    const channel = supabase.channel(channelName, { 
      config: { presence: { key: `${playerName}::${uniqueId}` } } 
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setPresentStudents(Object.keys(state).map(k => k.split('::')[0]));
      })
      .on('broadcast', { event: 'teacher_command' }, (msg) => {
        const payload = msg.payload;
        if (payload.type === 'START' && payload.code === liveCode) {
          setStopMessage(null);
          onStartMatch({ 
            setId: payload.setId, 
            title: payload.title, 
            rounds: payload.rounds, // Nhận trực tiếp rounds từ broadcast
            joinedRoom, 
            myId: uniqueId,
            opponents: []
          });
        } else if (payload.type === 'STOP') {
          setStopMessage(payload.message || "Các em ngừng, nghe thầy giảng");
        } else if (payload.type === 'RESUME') {
          setStopMessage(null);
        }
      })
      .subscribe(async (status) => { 
        if (status === 'SUBSCRIBED') await channel.track({ online: true });
      });

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [currentTeacher.id, liveCode, playerName, uniqueId]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-900 relative">
      {stopMessage && (
        <div className="fixed inset-0 z-[2000] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in zoom-in">
           <div className="bg-white rounded-[4rem] p-16 shadow-2xl max-w-2xl w-full text-center border-b-[20px] border-amber-500 overflow-hidden">
              <div className="text-9xl mb-8 animate-bounce">📢</div>
              <h2 className="text-5xl font-black text-slate-800 uppercase italic mb-8 tracking-tighter">THÔNG BÁO TỪ THẦY</h2>
              <div className="bg-amber-50 p-10 rounded-[3rem] border-4 border-amber-100 italic font-black text-3xl text-amber-700">"{stopMessage}"</div>
           </div>
        </div>
      )}

      <div className="bg-white rounded-[4rem] p-10 shadow-2xl max-w-7xl w-full border-b-[15px] border-blue-600 flex flex-col gap-10">
           <header className="flex justify-between items-center border-b-2 border-slate-50 pb-8">
              <div className="text-left">
                <div className="flex items-center gap-4 mb-2">
                  <h2 className="text-4xl font-black text-slate-800 uppercase italic tracking-tighter">ARENA CHỜ LIVE</h2>
                  <span className="bg-yellow-400 text-slate-900 px-4 py-1.5 rounded-xl font-black text-xl italic shadow-lg">{liveCode}</span>
                </div>
                <div className="flex gap-4">
                   <span className="bg-blue-600 text-white px-5 py-2 rounded-2xl font-black text-[10px] uppercase italic">BẠN: {playerName}</span>
                   <span className="bg-rose-50 text-rose-600 px-5 py-2 rounded-2xl font-black text-[10px] uppercase italic">THẦY: {currentTeacher?.tengv}</span>
                </div>
              </div>
              <button onClick={() => { setJoinedRoom(null); setGameState('ROOM_SELECTION'); }} className="bg-red-50 text-red-500 px-10 py-5 rounded-3xl font-black text-xs uppercase italic hover:bg-red-500 hover:text-white transition-all">THOÁT</button>
           </header>
           
           <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              <div className="lg:col-span-8 bg-slate-50 rounded-[3rem] p-10 shadow-inner overflow-y-auto max-h-[500px] no-scrollbar">
                  <h3 className="text-xs font-black text-slate-400 uppercase italic mb-8 tracking-widest flex items-center gap-3">
                    <span className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center text-white">1</span>
                    CHỌN TỪ KHÓA ÔN TẬP:
                  </h3>
                  <KeywordSelector selectedQuantities={selectedQuantities} selectedFormulas={selectedFormulas} onToggleQuantity={q => setSelectedQuantities(p=>p.includes(q)?p.filter(x=>x!==q):[...p,q])} onToggleFormula={f=>setSelectedFormulas(p=>p.includes(f)?p.filter(x=>x!==f):[...p,f])} />
              </div>
              <div className="lg:col-span-4 flex flex-col gap-6">
                 <div className="bg-slate-900 rounded-[3rem] p-8 flex flex-col shadow-2xl h-64">
                    <h3 className="text-[9px] font-black text-blue-400 uppercase italic mb-4 text-center tracking-widest">ĐANG ONLINE ({presentStudents.length})</h3>
                    <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar">
                       {presentStudents.map((s, i) => (
                         <div key={i} className="bg-white/5 p-3 rounded-xl border border-white/10 text-white font-black text-[10px] uppercase italic">{s}</div>
                       ))}
                    </div>
                 </div>
                 <div className="bg-blue-600 rounded-[3rem] p-10 text-center shadow-xl flex flex-col items-center justify-center gap-6 flex-1">
                    <div className="w-20 h-20 border-8 border-white/20 border-t-white rounded-full animate-spin"></div>
                    <div className="space-y-2">
                       <p className="text-base font-black text-white uppercase italic tracking-widest">ĐANG ĐỢI LỆNH THẦY...</p>
                       <p className="text-[10px] text-blue-100 font-bold uppercase italic leading-tight">Khi Thầy bấm BẮT ĐẦU LIVE tại bảng điều khiển,<br/>trận đấu sẽ tự động khởi chạy!</p>
                    </div>
                 </div>
              </div>
           </div>
      </div>
    </div>
  );
};

export default TeacherArenaManager;
