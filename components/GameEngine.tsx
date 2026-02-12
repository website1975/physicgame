
import React from 'react';
import { GameState, Teacher, MatchData } from '../types';
import SoloEngine from './engine/SoloEngine';
import MultiPlayerEngine from './engine/MultiPlayerEngine';

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

  if (roomCode === 'ARENA_A') {
    return <SoloEngine {...props} />;
  }

  if (['ARENA_B', 'ARENA_C', 'ARENA_D'].includes(roomCode)) {
    return <MultiPlayerEngine {...props} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-white text-center">
      <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-8"></div>
      <h2 className="text-2xl font-black italic uppercase tracking-widest animate-pulse">ĐANG KHỞI TẠO TRẬN ĐẤU...</h2>
      <button onClick={props.onExit} className="mt-12 px-8 py-3 bg-white/5 text-slate-500 rounded-xl font-black uppercase text-[10px]">Quay lại</button>
    </div>
  );
};

export default GameEngine;
