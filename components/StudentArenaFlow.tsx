
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
  { id: '5', name: 'Phòng GV LIVE', code: 'TEACHER_LIVE', emoji: '👨‍🏫', color: 'bg-rose-600', capacity: 100, desc: 'Học trực tiếp cùng Thầy' },
];

const StudentArenaFlow: React.FC<StudentArenaFlowProps> = (props) => {
  const { gameState, setGameState, playerName, joinedRoom, setJoinedRoom } = props;
  const [uniqueId] = useState(() => Math.random().toString(36).substring(7));

  if (gameState === 'ROOM_SELECTION') {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center justify-center bg-slate-950">
        <div className="absolute top-8 right-8">
          <button onClick={() => setGameState('LOBBY')} className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-8 py-4 rounded-2xl border-2 border-red-500/20 transition-all font-black uppercase italic text-sm">🚪 Thoát</button>
        </div>
        <div className="text-center mb-12">
          <h2 className="text-6xl font-black text-white italic uppercase tracking-tighter">Hệ thống Đấu Trường</h2>
          <p className="text-blue-400 font-bold uppercase text-[10px] mt-2 tracking-[0.3em]">Chiến binh: {playerName} <span className="opacity-40">#{uniqueId.slice(-3).toUpperCase()}</span></p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 w-full max-w-7xl">
          {ARENA_ROOMS.map(room => (
            <button 
              key={room.code} 
              onClick={() => { 
                setJoinedRoom(room); 
                if (room.code === 'TEACHER_LIVE') {
                  setGameState('WAITING_ROOM'); // Chuyển đến màn hình nhập mã phòng
                } else {
                  setGameState('WAITING_FOR_PLAYERS');
                }
              }} 
              className="bg-white p-8 rounded-[4rem] flex flex-col items-center gap-6 hover:scale-105 transition-all shadow-2xl group relative"
            >
              <div className={`text-5xl p-6 rounded-[2rem] ${room.color} text-white shadow-lg`}>{room.emoji}</div>
              <div className="font-black text-slate-800 uppercase italic text-lg">{room.name}</div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">{room.desc}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (joinedRoom?.code === 'ARENA_A') {
    return <SoloArenaManager {...props} uniqueId={uniqueId} />;
  }

  if (['ARENA_B', 'ARENA_C', 'ARENA_D'].includes(joinedRoom?.code)) {
    return <MultiPlayerArenaManager {...props} uniqueId={uniqueId} />;
  }

  if (joinedRoom?.code === 'TEACHER_LIVE') {
    return <TeacherArenaManager {...props} uniqueId={uniqueId} />;
  }

  return null;
};

export default StudentArenaFlow;
