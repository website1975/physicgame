
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

  // Màn hình chờ mặc định khi đang tải dữ liệu phòng - Chuyển sang tông sáng
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center animate-in fade-in">
      <div className="bg-white p-16 rounded-[4rem] shadow-2xl flex flex-col items-center border-b-[15px] border-blue-600">
        <div className="relative mb-12">
           <div className="w-32 h-32 border-8 border-blue-50 border-t-blue-600 rounded-full animate-spin shadow-inner"></div>
           <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-5xl animate-pulse">🚀</span>
           </div>
        </div>
        <h2 className="text-4xl font-black italic uppercase tracking-tighter text-slate-800 leading-none">KHỞI ĐỘNG ARENA</h2>
        <p className="mt-4 text-blue-500 font-black uppercase text-[10px] tracking-[0.3em] italic">Đang tải dữ liệu trận đấu...</p>
        <div className="mt-12 w-64 h-3 bg-slate-100 rounded-full overflow-hidden border-2 border-white shadow-inner">
           <div className="h-full bg-blue-500 animate-loading"></div>
        </div>
        <button onClick={props.onExit} className="mt-16 px-12 py-5 bg-slate-100 hover:bg-red-500 text-slate-400 hover:text-white rounded-[2rem] font-black uppercase text-[10px] transition-all border-2 border-slate-50 shadow-md">Hủy kết nối</button>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes loading {
          0% { width: 0%; transform: translateX(-100%); }
          50% { width: 100%; transform: translateX(0); }
          100% { width: 0%; transform: translateX(100%); }
        }
        .animate-loading {
          animation: loading 2s infinite ease-in-out;
        }
      `}} />
    </div>
  );
};

export default GameEngine;
