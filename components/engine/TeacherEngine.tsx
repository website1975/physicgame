
import React, { useState, useEffect, useRef } from 'react';
import { GameState, Teacher, MatchData } from '../../types';
import ProblemCard from '../ProblemCard';
import AnswerInput from '../AnswerInput';
import LatexRenderer from '../LatexRenderer';
import Whiteboard from '../Whiteboard';
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
  const [currentRoundIdx, setCurrentRoundIdx] = useState(0);
  const [currentProblemIdx, setCurrentProblemIdx] = useState(matchData.startIndex || 0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(40);
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState<any>(null);
  const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);
  const [hasBuzzed, setHasBuzzed] = useState(false);
  const [isHelpUsed, setIsHelpUsed] = useState(false);
  
  const rounds = matchData.rounds || [];
  const currentRound = rounds[currentRoundIdx];
  const currentProblem = currentRound?.problems[currentProblemIdx];
  const channelRef = useRef<any>(null);

  // Sync Báo cáo trạng thái khi có thay đổi quan trọng
  const reportStatus = (statusStr?: string, isCorrect?: boolean) => {
    if (!channelRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'student_report',
      payload: { 
        name: playerName,
        uniqueId: uniqueId,
        score: score, 
        isCorrect: isCorrect,
        status: statusStr,
        progress: `Đang làm câu ${currentProblemIdx + 1}/${currentRound?.problems?.length || 0}`
      }
    });
  };

  useEffect(() => {
    if (gameState === 'ROUND_INTRO') {
      setGameState('ANSWERING');
    }
  }, [gameState]);

  useEffect(() => {
    const channelName = `room_TEACHER_LIVE_${currentTeacher.id}`;
    const channel = supabase.channel(channelName, { 
      config: { presence: { key: `${playerName}::${uniqueId}` } } 
    });

    channel
      .on('broadcast', { event: 'teacher_next_question' }, ({ payload }) => {
        moveToQuestion(payload.nextIndex);
      })
      .on('broadcast', { event: 'teacher_toggle_whiteboard' }, ({ payload }) => {
        setIsWhiteboardActive(payload.active);
      })
      .on('broadcast', { event: 'teacher_reset_question' }, ({ payload }) => {
        moveToQuestion(payload.index);
      })
      .on('broadcast', { event: 'teacher_reset_buzzers' }, () => {
        setHasBuzzed(false);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ online: true });
          // HS Báo cáo hiện diện ngay lập tức khi đăng nhập thành công
          reportStatus("Đã vào phòng 🟢");
        }
      });

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [currentTeacher.id, playerName, uniqueId]);

  useEffect(() => {
    if (gameState === 'ANSWERING' && timeLeft > 0 && !isWhiteboardActive) {
      const t = setInterval(() => setTimeLeft(p => p - 1), 1000);
      return () => clearInterval(t);
    }
  }, [gameState, timeLeft, isWhiteboardActive]);

  const submitAnswer = () => {
    if (gameState !== 'ANSWERING' || !hasBuzzed) return;
    const correct = (currentProblem?.correctAnswer || "").trim().toUpperCase();
    const isPerfect = userAnswer.trim().toUpperCase() === correct;
    const points = isPerfect ? (isHelpUsed ? 60 : 100) : 0;
    
    const newScore = score + points;
    setScore(newScore);
    setFeedback({ isCorrect: isPerfect, text: isPerfect ? 'CHÍNH XÁC! ✨' : `SAI RỒI! Đáp án là: ${correct}` });
    setGameState('FEEDBACK');

    // Gửi báo cáo kết quả tức thì
    channelRef.current?.send({
      type: 'broadcast',
      event: 'student_report',
      payload: { 
        name: playerName,
        uniqueId: uniqueId,
        score: newScore, 
        isCorrect: isPerfect,
        progress: `Đã xong câu ${currentProblemIdx + 1}`
      }
    });
  };

  const handleBuzz = () => {
    if (hasBuzzed || gameState !== 'ANSWERING') return;
    setHasBuzzed(true);
    channelRef.current?.send({
      type: 'broadcast',
      event: 'student_buzzer',
      payload: { name: playerName, uniqueId }
    });
    // Báo cho GV biết đã giành quyền nhanh nhất
    reportStatus("Đã giành quyền 🔔");
  };

  const moveToQuestion = (index: number) => {
    if (index < (currentRound?.problems?.length || 0)) {
      setCurrentProblemIdx(index);
      setUserAnswer('');
      setFeedback(null);
      setHasBuzzed(false);
      setIsHelpUsed(false);
      setTimeLeft(currentRound.problems[index].timeLimit || 40);
      // QUAN TRỌNG: Buộc HS chuyển từ màn hình FEEDBACK quay lại ANSWERING
      setGameState('ANSWERING');
      
      // Báo cáo GV là đã sẵn sàng cho câu mới
      setTimeout(() => reportStatus(`Đang làm câu ${index + 1}...`), 300);
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
        <div className="flex items-center gap-4">
           <div className="bg-blue-600 text-white px-6 py-2 rounded-2xl font-black italic shadow-lg">ĐIỂM: {score}đ</div>
           {isWhiteboardActive && <span className="text-[10px] font-black text-emerald-500 uppercase italic animate-pulse">👨‍🏫 Thầy đang giảng bài...</span>}
        </div>
        <div className="flex items-center gap-4">
           <div className="bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 font-black italic text-slate-400 text-xs">
              Câu {currentProblemIdx + 1} / {currentRound?.problems?.length || 0}
           </div>
           <div className={`text-3xl font-black italic ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-slate-900'}`}>{timeLeft}s</div>
           <button onClick={onExit} className="w-10 h-10 bg-red-50 text-red-500 rounded-xl font-black text-xs hover:bg-red-500 hover:text-white transition-all">✕</button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 min-h-0 overflow-hidden relative">
        {isWhiteboardActive && (
          <div className="absolute inset-0 z-50 bg-slate-950 rounded-[3.5rem] p-4 shadow-2xl animate-in zoom-in">
             <Whiteboard isTeacher={false} channel={channelRef.current} roomCode="TEACHER_ROOM" />
             <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-md px-6 py-2 rounded-full border border-white/20">
                <span className="text-white font-black uppercase italic text-[10px] tracking-widest">Đang theo dõi bảng giảng trực tiếp</span>
             </div>
          </div>
        )}

        <div className="lg:col-span-7 overflow-y-auto no-scrollbar h-full">
           <ProblemCard problem={currentProblem} isPaused={gameState !== 'ANSWERING' || isWhiteboardActive} isHelpUsed={isHelpUsed} />
        </div>
        <div className="lg:col-span-5 bg-white rounded-[3.5rem] p-10 shadow-2xl flex flex-col border-4 border-slate-50 relative overflow-hidden h-full">
           {gameState === 'ANSWERING' ? (
             <div className="flex flex-col h-full animate-in zoom-in">
                <div className="flex justify-between items-center mb-6">
                   <h3 className="text-[10px] font-black text-slate-400 uppercase italic">Khu vực làm bài:</h3>
                   <div className="flex gap-2">
                      <button 
                        onClick={() => setIsHelpUsed(true)}
                        disabled={isHelpUsed}
                        className="bg-amber-100 text-amber-600 px-4 py-2 rounded-xl font-black text-[9px] uppercase border-b-2 border-amber-200"
                      >
                        {isHelpUsed ? 'ĐÃ DÙNG TRỢ GIÚP' : 'DÙNG TRỢ GIÚP 💡'}
                      </button>
                      <button 
                        onClick={handleBuzz}
                        disabled={hasBuzzed}
                        className={`px-6 py-2 rounded-xl font-black uppercase italic text-[10px] shadow-lg transition-all ${hasBuzzed ? 'bg-amber-100 text-amber-600 border-2 border-amber-200 cursor-default' : 'bg-amber-500 text-white border-b-4 border-amber-700 hover:scale-105 active:translate-y-1 active:border-b-0'}`}
                      >
                        {hasBuzzed ? '🔔 ĐÃ GIÀNH QUYỀN' : '🛎️ GIÀNH QUYỀN'}
                      </button>
                   </div>
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar">
                   <AnswerInput problem={currentProblem} value={userAnswer} onChange={setUserAnswer} onSubmit={submitAnswer} disabled={false} />
                </div>
                {!hasBuzzed ? (
                   <div className="mt-8 bg-amber-50 p-6 rounded-3xl border-2 border-amber-200 text-center animate-pulse">
                      <p className="text-amber-700 font-black uppercase italic text-xs">Hãy nhấn chuông để giành quyền trả lời!</p>
                   </div>
                ) : (
                  <button 
                    onClick={submitAnswer} 
                    disabled={!userAnswer} 
                    className={`w-full py-6 rounded-3xl font-black italic text-xl mt-8 shadow-xl border-b-[10px] transition-all ${userAnswer ? 'bg-blue-600 text-white border-blue-800' : 'bg-slate-100 text-slate-300 border-slate-200'}`}
                  >
                    XÁC NHẬN ✅
                  </button>
                )}
             </div>
           ) : (
             <div className="flex flex-col h-full animate-in slide-in-from-right">
                <div className={`text-4xl font-black uppercase italic mb-6 ${feedback?.isCorrect ? 'text-emerald-500' : 'text-rose-500'}`}>
                   {feedback?.isCorrect ? '✨ XUẤT SẮC!' : '💥 CỐ GẮNG HƠN!'}
                </div>
                <div className="bg-slate-50 p-8 rounded-[2.5rem] border-2 border-slate-100 italic font-bold text-slate-700 mb-8 shadow-inner">
                   <LatexRenderer content={feedback?.text || ""} />
                </div>
                <div className="flex-1 bg-emerald-50/50 p-8 rounded-[3rem] border-2 border-emerald-100 overflow-y-auto no-scrollbar">
                   <h4 className="text-emerald-600 font-black uppercase text-[10px] mb-4 italic tracking-widest">Đáp án chi tiết:</h4>
                   <div className="text-slate-600 italic leading-relaxed text-lg">
                      <LatexRenderer content={currentProblem?.explanation || ""} />
                   </div>
                </div>
                
                <div className="mt-8 bg-blue-600 text-white p-6 rounded-3xl text-center font-black uppercase italic animate-pulse shadow-lg border-b-8 border-blue-800">
                   ⏳ Chờ thầy chuyển câu hỏi mới...
                </div>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default TeacherEngine;
