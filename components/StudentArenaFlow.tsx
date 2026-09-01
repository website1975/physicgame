
import React, { useState } from 'react';
import { GameState, Teacher, MatchData } from '../types';
import SoloArenaManager from './arena/SoloArenaManager';
import MultiPlayerArenaManager from './arena/MultiPlayerArenaManager';
import TeacherArenaManager from './arena/TeacherArenaManager';

interface StudentArenaFlowProps {
  gameState: GameState;
  setGameState: (s: GameState) => void;
  playerName: string;
  studentGrade: string;
  currentTeacher: Teacher;
  onStartMatch: (data: MatchData) => void;
  joinedRoom: any;
  setJoinedRoom: (room: any) => void;
  availableSets: any[];
  setAvailableSets: (sets: any[]) => void;
}

const ARENA_ROOMS = [
  { id: '1', name: 'Phòng đơn', code: 'ARENA_A', emoji: '🛡️', color: 'bg-blue-600', capacity: 1, desc: 'Luyện tập cá nhân' },
  { id: '2', name: 'Phòng đôi', code: 'ARENA_B', emoji: '⚔️', color: 'bg-purple-600', capacity: 2, desc: 'Đấu 1 vs 1' },
  { id: '3', name: 'Phòng 3', code: 'ARENA_C', emoji: '🏹', color: 'bg-emerald-600', capacity: 3, desc: 'Hỗn chiến 3 người' },
  { id: '4', name: 'Phòng 4', code: 'ARENA_D', emoji: '🔱', color: 'bg-amber-500', capacity: 4, desc: 'Tứ hùng tranh tài' },
  { id: '5', name: 'Hệ thống Công thức', code: 'FORMULA_LIB', emoji: '📚', color: 'bg-slate-800', capacity: 0, desc: 'Thư viện tài liệu' },
];

const StudentArenaFlow: React.FC<StudentArenaFlowProps> = (props) => {
  const { gameState, setGameState, playerName, joinedRoom, setJoinedRoom, studentGrade } = props;
  const [uniqueId] = useState(() => Math.random().toString(36).substring(7));

  if (gameState === 'ROOM_SELECTION') {
    return (
      <div className="min-h-screen p-4 sm:p-6 md:p-8 flex flex-col items-center justify-center bg-slate-950">
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
          <button onClick={() => setGameState('LOBBY')} className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-4 py-2 rounded-xl border border-red-500/20 transition-all font-black uppercase italic text-xs">🚪 Thoát</button>
        </div>
        <div className="text-center mb-8">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white italic uppercase tracking-tighter">HỆ THỐNG ĐẤU TRƯỜNG</h2>
          <p className="text-blue-400 font-bold uppercase text-[9px] mt-1.5 tracking-[0.25em]">Chiến binh: {playerName} <span className="opacity-40">#{uniqueId.slice(-3).toUpperCase()}</span> • Khối {studentGrade}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 w-full max-w-6xl">
          {ARENA_ROOMS.map(room => (
            <button 
              key={room.code} 
              onClick={() => { 
                if (room.code === 'FORMULA_LIB') {
                  setGameState('FORMULA_LIBRARY');
                } else {
                  setJoinedRoom(room); 
                  setGameState('WAITING_FOR_PLAYERS');
                }
              }} 
              className="bg-white p-5 rounded-2xl flex flex-col items-center gap-3 hover:scale-102 hover:shadow-xl transition-all shadow-md group relative text-center border border-slate-100"
            >
              <div className={`text-3xl p-4 rounded-xl ${room.color} text-white shadow-xs`}>{room.emoji}</div>
              <div className="font-black text-slate-800 uppercase italic text-sm">{room.name}</div>
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{room.desc}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Xử lý logic theo loại phòng
  if (joinedRoom?.code === 'ARENA_A') {
    return <SoloArenaManager {...props} uniqueId={uniqueId} />;
  }

  if (['ARENA_B', 'ARENA_C', 'ARENA_D'].includes(joinedRoom?.code)) {
    return <MultiPlayerArenaManager {...props} uniqueId={uniqueId} />;
  }

  return null;
};

export default StudentArenaFlow;
