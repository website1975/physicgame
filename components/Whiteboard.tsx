
import React, { useState, useEffect, useRef } from 'react';
import { GameState, Teacher, Round, QuestionType } from '../types';
import ProblemCard from './ProblemCard';
import AnswerInput from './AnswerInput';
import Whiteboard from './Whiteboard';
import LatexRenderer from './LatexRenderer';
import ConfirmModal from './ConfirmModal';
import { supabase } from '../services/supabaseService';

const DEFAULT_TIME = 40;
const FEEDBACK_TIME = 15;
const ROUND_INTRO_TIME = 5;

interface GameEngineProps {
  gameState: GameState;
  setGameState: (s: GameState) => void;
  playerName: string;
  currentTeacher: Teacher;
  matchData: { setId: string, title: string, rounds: Round[], opponentName?: string, joinedRoom?: any };
  onExit: () => void;
}

const GameEngine: React.FC<GameEngineProps> = ({ 
  gameState, setGameState, playerName, currentTeacher, matchData, onExit 
}) => {
  const [currentRoundIdx, setCurrentRoundIdx] = useState(0);
  const [currentProblemIdx, setCurrentProblemIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(DEFAULT_TIME);
  const [feedbackTimer, setFeedbackTimer] = useState(FEEDBACK_TIME);
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState<any>(null);
  const [buzzerWinner, setBuzzerWinner] = useState<'YOU' | 'OPPONENT' | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  
  // Real-time Remote Control
  const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);
  const isTeacherRoom = matchData.joinedRoom?.code === 'TEACHER_ROOM';

  const channelRef = useRef<any>(null);
  const controlChannelRef = useRef<any>(null);
  const isArenaA = matchData.joinedRoom?.code === 'ARENA_A';
  const rounds = matchData.rounds;
  const currentProblem = rounds[currentRoundIdx]?.problems[currentProblemIdx];

  useEffect(() => {
    if (isTeacherRoom) {
      const channel = supabase.channel(`control_TEACHER_ROOM_${currentTeacher.id}`, {
        config: { presence: { key: `${playerName}_${Math.random().toString(36).substring(7)}` } }
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          // Sync presence if needed
        })
        .on('broadcast', { event: 'teacher_next_question' }, () => {
          handleNext();
        })
        .on('broadcast', { event: 'teacher_toggle_whiteboard' }, ({ payload }) => {
          setIsWhiteboardActive(payload.active);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ role: 'student', online_at: new Date().toISOString() });
          }
        });

      controlChannelRef.current = channel;
      return () => { supabase.removeChannel(channel); };
    }
  }, [isTeacherRoom, currentTeacher.id, playerName]);

  useEffect(() => {
    if (!isArenaA && matchData.joinedRoom && !isTeacherRoom) {
      const channel = supabase.channel(`match_${matchData.joinedRoom.code}_${currentTeacher.id}`);
      
      channel
        .on('broadcast', { event: 'buzzer' }, ({ payload }) => {
          if (payload.player !== playerName && !buzzerWinner) {
            setBuzzerWinner('OPPONENT');
            setGameState('ANSWERING');
          }
        })
        .on('broadcast', { event: 'result' }, ({ payload }) => {
          if (payload.player !== playerName) {
            setOpponentScore(s => s + (payload.points || 0));
            setFeedback({ ...payload.feedback, winner: 'OPPONENT' });
            setGameState('FEEDBACK');
            setFeedbackTimer(FEEDBACK_TIME);
          }
        })
        .subscribe();

      channelRef.current = channel;
      return () => { supabase.removeChannel(channel); };
    }
  }, [isArenaA, isTeacherRoom, matchData.joinedRoom, playerName]);

  const startProblem = () => {
    if (!currentProblem) return;
    setBuzzerWinner(isArenaA || isTeacherRoom ? 'YOU' : null);
    setUserAnswer('');
    setFeedback(null);
    setGameState('STARTING_ROUND');
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev && prev <= 1) {
          clearInterval(interval);
          setGameState(isArenaA || isTeacherRoom ? 'ANSWERING' : 'WAITING_FOR_BUZZER');
          setTimeLeft(currentProblem?.timeLimit || DEFAULT_TIME);
          return null;
        }
        return prev ? prev - 1 : null;
      });
    }, 1000);
  };

  const handleNext = () => {
    const nextProb = currentProblemIdx + 1;
    if (nextProb < (rounds[currentRoundIdx]?.problems.length || 0)) {
      setCurrentProblemIdx(nextProb);
      startProblem();
    } else if (currentRoundIdx + 1 < rounds.length) {
      setCurrentRoundIdx(prev => prev + 1);
      setCurrentProblemIdx(0);
      setGameState('ROUND_INTRO');
    } else {
      setGameState('GAME_OVER');
    }
  };

  useEffect(() => {
    if (gameState === 'ROUND_INTRO') {
      const timer = setTimeout(startProblem, ROUND_INTRO_TIME * 1000);
      return () => clearTimeout(timer);
    }
    if (gameState === 'FEEDBACK') {
      if (!isTeacherRoom) {
        const countdownInterval = setInterval(() => setFeedbackTimer(p => Math.max(0, p - 1)), 1000);
        const nextTimeout = setTimeout(handleNext, FEEDBACK_TIME * 1000);
        return () => { clearInterval(countdownInterval); clearTimeout(nextTimeout); };
      }
    }
  }, [gameState, isTeacherRoom]);

  useEffect(() => {
    if ((gameState === 'WAITING_FOR_BUZZER' || gameState === 'ANSWERING') && timeLeft > 0) {
      const t = setInterval(() => setTimeLeft(p => p - 1), 1000);
      return () => clearInterval(t);
    }
    if (timeLeft === 0 && gameState === 'ANSWERING' && buzzerWinner === 'YOU') {
      submitAnswer();
    }
  }, [gameState, timeLeft]);

  const submitAnswer = () => {
    const correct = (currentProblem?.correctAnswer || "").trim().toUpperCase();
    const user = userAnswer.trim().toUpperCase();
    const isPerfect = user === correct;
    const fb = { isCorrect: isPerfect, text: isPerfect ? "CHÍNH XÁC!" : `SAI RỒI! Đáp án đúng là: ${correct}`, winner: 'YOU' };
    
    if (isPerfect) setScore(s => s + 100);
    setFeedback(fb);
    setGameState('FEEDBACK');
    setFeedbackTimer(FEEDBACK_TIME);
    
    if (isTeacherRoom && controlChannelRef.current) {
        controlChannelRef.current.send({
            type: 'broadcast',
            event: 'student_answer',
            payload: { playerName, isCorrect: isPerfect }
        });
    }

    if (channelRef.current && !isTeacherRoom) {
      channelRef.current.send({ type: 'broadcast', event: 'result', payload: { player: playerName, points: isPerfect ? 100 : 0, feedback: fb } });
    }
  };

  if (gameState === 'ROUND_INTRO') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-center p-6">
        <div className="bg-white rounded-[4rem] p-16 shadow-2xl max-w-3xl w-full border-b-[12px] border-blue-600">
          <h2 className="text-5xl font-black text-slate-800 uppercase italic mb-6">VÒNG {currentRoundIdx + 1}</h2>
          <p className="text-slate-500 font-bold text-xl italic mb-10">{rounds[currentRoundIdx]?.description}</p>
          <div className="text-blue-600 font-black animate-pulse">ĐANG CHUẨN BỊ...</div>
        </div>
      </div>
    );
  }

  if (gameState === 'STARTING_ROUND') {
    return <div className="fixed inset-0 bg-slate-950 flex items-center justify-center z-[9999]"><div className="text-[15rem] font-black text-white animate-ping">{countdown}</div></div>;
  }

  if (gameState === 'GAME_OVER') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
         <div className="bg-white rounded-[4rem] p-16 shadow-2xl max-w-2xl w-full text-center border-b-[12px] border-emerald-500">
            <h2 className="text-6xl font-black text-slate-800 uppercase italic mb-10">HOÀN THÀNH!</h2>
            <div className="bg-slate-50 p-10 rounded-[3rem] mb-10"><div className="text-8xl font-black text-slate-900">{score}đ</div></div>
            <button onClick={onExit} className="w-full py-6 bg-slate-900 text-white font-black rounded-[2rem] uppercase italic text-2xl shadow-xl">THOÁT RA</button>
         </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col p-4 overflow-hidden relative">
      {/* WHITEBOARD HỌC SINH - Label đã được thu gọn vào đèn tín hiệu bên trong component Whiteboard */}
      {isWhiteboardActive && (
        <div className="fixed inset-0 z-[10000] p-4 md:p-8 bg-slate-950/98 backdrop-blur-3xl animate-in zoom-in flex flex-col items-center justify-center">
          <div className="w-full h-full max-w-[95vw] max-h-[90vh] relative shadow-[0_0_100px_rgba(0,0,0,0.5)]">
             <Whiteboard isTeacher={false} channel={controlChannelRef.current} roomCode="TEACHER_ROOM" />
          </div>
        </div>
      )}

      <header className="flex justify-between items-center bg-white p-6 rounded-[2.5rem] shadow-lg mb-4 shrink-0">
        <div className="flex items-center gap-10">
           <div className="text-center"><div className="text-[10px] font-black text-blue-500 uppercase">ĐIỂM SỐ</div><div className="text-3xl font-black text-slate-800 italic">{score}đ</div></div>
        </div>
        <div className="text-6xl font-black italic text-slate-900 w-24 text-center">{timeLeft}s</div>
        <div className="flex gap-4">
           {isTeacherRoom && <div className="bg-amber-100 text-amber-600 px-6 py-4 rounded-2xl font-black text-[10px] uppercase italic border border-amber-200">GV ĐIỀU KHIỂN</div>}
           <button onClick={() => setShowExitConfirm(true)} className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center font-black">✕</button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0 overflow-hidden">
        <div className="lg:col-span-7 h-full overflow-hidden">
           <ProblemCard problem={currentProblem} isPaused={isWhiteboardActive} />
        </div>
        <div className="lg:col-span-5 bg-white rounded-[3rem] p-8 shadow-xl flex flex-col relative h-full overflow-hidden">
          {gameState === 'FEEDBACK' ? (
            <div className="h-full flex flex-col animate-in fade-in zoom-in overflow-hidden">
              <div className="flex justify-between items-center mb-6 shrink-0">
                 <div className={`text-4xl font-black uppercase italic ${feedback?.isCorrect ? 'text-emerald-500' : 'text-blue-500'}`}>{feedback?.isCorrect ? 'CHÍNH XÁC!' : 'SAI RỒI!'}</div>
                 {isTeacherRoom && <div className="bg-slate-900 text-white px-5 py-2 rounded-2xl font-black italic text-[10px] uppercase">Đang chờ GV chuyển câu...</div>}
              </div>
              <div className="flex-1 overflow-y-auto no-scrollbar space-y-6">
                 <div className="bg-slate-50 p-6 rounded-3xl border-2 border-slate-100 italic text-lg font-bold"><LatexRenderer content={feedback?.text || ""} /></div>
                 <div className="bg-emerald-50/50 p-8 rounded-[2.5rem] border-2 border-emerald-100"><h4 className="text-emerald-600 font-black uppercase text-xs mb-4">Lời giải chi tiết</h4><div className="text-slate-600 font-medium leading-relaxed italic"><LatexRenderer content={currentProblem?.explanation || "Chưa có lời giải chi tiết."} /></div></div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0">
                 <AnswerInput problem={currentProblem} value={userAnswer} onChange={setUserAnswer} onSubmit={submitAnswer} disabled={false} />
              </div>
              <button onClick={submitAnswer} className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black italic text-xl mt-4 shrink-0 shadow-lg active:scale-95 transition-all">NỘP ĐÁP ÁN ✅</button>
            </div>
          )}
        </div>
      </div>
      <ConfirmModal isOpen={showExitConfirm} title="Dừng trận đấu?" message="Bạn muốn rời khỏi đấu trường?" onConfirm={onExit} onCancel={() => setShowExitConfirm(false)} isDestructive={true} />
    </div>
  );
};

export default GameEngine;
