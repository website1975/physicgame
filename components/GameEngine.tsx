
import React from 'react';
import { GameState, Teacher, MatchData } from '../types';
import SoloEngine from './engine/SoloEngine';
import MultiPlayerEngine from './engine/MultiPlayerEngine';
import TeacherEngine from './engine/TeacherEngine';

interface GameEngineProps {
  gameState: GameState;
  setGameState: (s: GameState) => void;
  playerName: string;
  currentTeacher: Teacher;
  matchData: MatchData;
  onExit: () => void;
}

const GameEngine: React.FC<GameEngineProps> = (props) => {
  const roomCode = props.matchData.joinedRoom?.code || '';

  // Chế độ luyện tập cá nhân
  if (roomCode === 'ARENA_A') {
    return <SoloEngine {...props} />;
  }

  // Chế độ đấu trường nhiều người (Phòng đôi, 3, 4)
  if (['ARENA_B', 'ARENA_C', 'ARENA_D'].includes(roomCode)) {
    return <MultiPlayerEngine {...props} />;
  }

  // Chế độ học trực tiếp cùng Giáo viên
  if (roomCode === 'TEACHER_LIVE') {
    return <TeacherEngine {...props} />;
  }

  // Màn hình chờ mặc định khi đang tải dữ liệu phòng
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-white text-center">
      <div className="relative">
         <div className="w-24 h-24 border-8 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-8"></div>
         <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl animate-pulse">🚀</span>
         </div>
      </div>
      <h2 className="text-3xl font-black italic uppercase tracking-[0.2em] animate-pulse text-blue-400">ĐANG ĐỒNG BỘ TRẬN ĐẤU...</h2>
      <p className="mt-4 text-slate-500 font-bold uppercase text-[10px] tracking-widest italic">Vui lòng giữ kết nối ổn định</p>
      <button onClick={props.onExit} className="mt-12 px-10 py-4 bg-white/5 hover:bg-red-500 text-slate-500 hover:text-white rounded-2xl font-black uppercase text-[10px] transition-all border border-white/5">Hủy kết nối</button>
    </div>
  );
};

export default GameEngine;
