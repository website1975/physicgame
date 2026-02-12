
import React, { useState, useEffect, useRef } from 'react';
import { GameState, Teacher, Round, MatchData } from '../../types';
import ProblemCard from '../ProblemCard';
import AnswerInput from '../AnswerInput';
import LatexRenderer from '../LatexRenderer';
import { supabase } from '../../services/supabaseService';

interface TeacherEngineProps {
  gameState: GameState;
  setGameState: (s: GameState) => void;
  playerName: string;
  currentTeacher: Teacher;
  matchData: MatchData;
  onExit: () => void;
}

const TeacherEngine: React.FC<TeacherEngineProps> = ({ gameState, setGameState, playerName, currentTeacher, matchData, onExit }) => {
  const uniqueId = matchData.myId || 'temp';
  
  // Khởi tạo ở câu GV đang dạy (startIndex)
  const [currentRoundIdx, setCurrentRoundIdx] = useState(0);
  const [currentProblemIdx, setCurrentProblemIdx] = useState(matchData.startIndex || 0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(40);
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState<any>(null);
  
  const rounds = matchData.rounds || [];
  const currentRound = rounds[currentRoundIdx];
  const currentProblem = currentRound?.problems[currentProblemIdx];
  const channelRef = useRef<any>(null);

  // Lắng nghe lệnh từ GV
  useEffect(() => {
    const channelName = `room_TEACHER_LIVE_${currentTeacher.id}`;
    const channel = supabase.channel(channelName, { 
      config: { presence: { key: `${playerName}::${uniqueId}` } } 
    });

    channel
      .on('broadcast', { event: 'teacher_next_question' }, ({ payload }) => {
        // payload: { nextIndex }
        moveToQuestion(payload.nextIndex);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await channel.track({ online: true });
      });

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [currentTeacher.id, playerName, uniqueId]);

  useEffect(() => {
    if (gameState === 'ANSWERING' && timeLeft > 0) {
      const t = setInterval(() => setTimeLeft(p => p - 1), 1000);
      return () => clearInterval(t);
    }
  }, [gameState, timeLeft]);

  const submitAnswer = () => {
    if (gameState !== 'ANSWERING') return;
    const correct = (currentProblem?.correctAnswer || "").trim().toUpperCase();
    const isPerfect = userAnswer.trim().toUpperCase() === correct;
    const points = isPerfect ? 100 : 0;
    
    const newScore = score + points;
    setScore(newScore);
    setFeedback({ isCorrect: isPerfect, text: isPerfect ? 'CHÍNH XÁC! ✨' : `SAI RỒI! Đáp án là: ${correct}` });
    setGameState('FEEDBACK');

    // Báo cáo về máy GV ngay lập tức
    channelRef.current?.send({
      type: 'broadcast',
      event: 'student_report',
      payload: { 
        name: playerName,
        uniqueId: uniqueId,
        score: newScore, 
        isCorrect: isPerfect,
        progress: `Câu ${currentProblemIdx + 1}/${currentRound.problems.length}`
      }
    });
  };

  const moveToQuestion = (index: number) => {
    if (index < currentRound.problems.length) {
      setCurrentProblemIdx(index);
      setUserAnswer('');
      setFeedback(null);
      setTimeLeft(currentRound.problems[index].timeLimit || 40);
      setGameState('ANSWERING');
    } else {
      setGameState('GAME_OVER');
    }
  };

  if (gameState === 'GAME_OVER') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
        <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-md w-full border-b-[15px] border-emerald-600 animate-in zoom-in">
          <div className="text-8xl mb-6">🏆</div>
          <h2 className="text-3xl font-black uppercase italic mb-4">HOÀN THÀNH TIẾT DẠY</h2>
          <div className="text-6xl font-black text-emerald-600 mb-10">{score}đ</div>
          <button onClick={onExit} className="w-full py-6 bg-slate-900 text-white rounded-3xl font-black uppercase italic shadow-xl">Quay về sảnh</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col p-4 text-left">
      <header className="bg-white px-8 py-4 rounded-full shadow-lg mb-6 flex justify-between items-center border-b-4 border-slate-200">
        <div className="bg-blue-600 text-white px-6 py-2 rounded-2xl font-black italic shadow-lg">ĐIỂM: {score}đ</div>
        <div className="flex items-center gap-4">
           <div className="bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 font-black italic text-slate-400 text-xs">
              Câu {currentProblemIdx + 1} / {currentRound.problems.length}
           </div>
           <div className="text-slate-900 text-3xl font-black italic">{timeLeft}s</div>
           <button onClick={onExit} className="w-10 h-10 bg-red-50 text-red-500 rounded-xl font-black text-xs">✕</button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 min-h-0 overflow-hidden">
        <div className="lg:col-span-7 overflow-y-auto no-scrollbar">
           <ProblemCard problem={currentProblem} />
        </div>
        <div className="lg:col-span-5 bg-white rounded-[3.5rem] p-10 shadow-2xl flex flex-col border-4 border-slate-50 relative overflow-hidden">
           {gameState === 'ANSWERING' ? (
             <div className="flex flex-col h-full animate-in zoom-in">
                <h3 className="text-[10px] font-black text-slate-400 uppercase italic mb-6">Khu vực làm bài:</h3>
                <div className="flex-1 overflow-y-auto no-scrollbar">
                   <AnswerInput problem={currentProblem} value={userAnswer} onChange={setUserAnswer} onSubmit={submitAnswer} disabled={false} />
                </div>
                <button 
                  onClick={submitAnswer} 
                  disabled={!userAnswer} 
                  className={`w-full py-6 rounded-3xl font-black italic text-xl mt-8 shadow-xl border-b-[10px] transition-all ${userAnswer ? 'bg-blue-600 text-white border-blue-800' : 'bg-slate-100 text-slate-300 border-slate-200'}`}
                >
                  GỬI ĐÁP ÁN ✅
                </button>
             </div>
           ) : (
             <div className="flex flex-col h-full animate-in slide-in-from-right">
                <div className={`text-4xl font-black uppercase italic mb-6 ${feedback?.isCorrect ? 'text-emerald-500' : 'text-rose-500'}`}>
                   {feedback?.isCorrect ? '✨ XUẤT SẮC!' : '💥 CỐ GẮNG HƠN!'}
                </div>
                <div className="bg-slate-50 p-8 rounded-[2.5rem] border-2 border-slate-100 italic font-bold text-slate-700 mb-8">
                   <LatexRenderer content={feedback?.text || ""} />
                </div>
                <div className="flex-1 bg-emerald-50/50 p-8 rounded-[3rem] border-2 border-emerald-100 overflow-y-auto no-scrollbar">
                   <h4 className="text-emerald-600 font-black uppercase text-[10px] mb-4 italic">Hướng dẫn giải:</h4>
                   <div className="text-slate-600 italic leading-relaxed text-lg">
                      <LatexRenderer content={currentProblem?.explanation || ""} />
                   </div>
                </div>
                
                {/* THAY ĐỔI: Không cho HS bấm Next, hiện thông báo chờ GV */}
                <div className="mt-8 bg-blue-600 text-white p-6 rounded-3xl text-center font-black uppercase italic animate-pulse">
                   ⏳ Chờ giáo viên chuyển câu...
                </div>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default TeacherEngine;
