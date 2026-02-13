
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
  const studentGrade = (matchData as any).grade || '10';
  
  // SỬ DỤNG OBJECT STATE ĐỂ ĐẢM BẢO REACT LUÔN NHẬN DIỆN LÀ "DỮ LIỆU MỚI"
  const [syncState, setSyncState] = useState({
    index: matchData.startIndex || 0,
    version: Date.now() // Mã phiên bản để cưỡng bức render
  });
  
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(40);
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState<any>(null);
  const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);
  const [hasBuzzed, setHasBuzzed] = useState(false);
  const [isHelpUsed, setIsHelpUsed] = useState(false);
  
  const rounds = matchData.rounds || [];
  const channelRef = useRef<any>(null);
  
  // Dùng Ref để hàm lắng nghe sự kiện luôn đọc được giá trị mới nhất mà không bị "stale closure"
  const lastStateRef = useRef({
    index: syncState.index,
    gameState: gameState
  });

  useEffect(() => {
    lastStateRef.current = { index: syncState.index, gameState };
  }, [syncState.index, gameState]);

  const reportProgress = (statusStr?: string, isCorrect?: boolean, isFinished: boolean = false) => {
    if (!channelRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'student_score_update',
      payload: { 
        name: playerName, uniqueId, score, isCorrect, status: statusStr, isFinished,
        progress: `Câu ${lastStateRef.current.index + 1}/${rounds[0]?.problems?.length || 0}`
      }
    });
  };

  useEffect(() => {
    if (gameState === 'ROUND_INTRO') setGameState('ANSWERING');
  }, [gameState, setGameState]);

  // HÀM XỬ LÝ LỆNH TỪ GIÁO VIÊN - CỰC KỲ QUAN TRỌNG
  const handleTeacherCommand = (payload: any) => {
    const { type, index, active } = payload;
    
    if (type === 'WHITEBOARD') {
      setIsWhiteboardActive(!!active);
      return;
    }

    if (['MOVE', 'RESET', 'START', 'SYNC'].includes(type)) {
      // Nếu chỉ số câu hỏi khác hiện tại HOẶC HS đang bị kẹt ở màn hình Feedback (kết quả câu cũ)
      const isNewQuestion = index !== lastStateRef.current.index;
      const isForcedReset = type === 'RESET' || type === 'START';
      const needsJump = lastStateRef.current.gameState === 'FEEDBACK' && (type === 'MOVE' || type === 'SYNC');

      if (isNewQuestion || isForcedReset || needsJump) {
        console.log(`[RENDER-SYNC] Cưỡng bức nhảy sang câu: ${index}`);
        
        // Cập nhật State theo kiểu Object để tạo "phiên bản mới"
        setSyncState({ index: index, version: Date.now() });
        
        // Reset sạch sẽ các trạng thái nhập liệu
        setUserAnswer('');
        setFeedback(null);
        setHasBuzzed(false);
        setIsWhiteboardActive(false);
        setGameState('ANSWERING'); // Bắt buộc quay lại trạng thái trả lời
        
        const newProb = rounds[0]?.problems[index];
        if (newProb) {
          setTimeLeft(newProb.timeLimit || 40);
        }
        
        // Báo cáo lại cho GV sau khi đã render xong
        setTimeout(() => reportProgress("Đã nhảy sang câu mới ✨"), 300);
      }
    }
  };

  useEffect(() => {
    const channelName = `room_TEACHER_LIVE_${currentTeacher.id}_match_${uniqueId}`;
    const channel = supabase.channel(channelName);
    
    channel
      .on('broadcast', { event: 'teacher_command' }, ({ payload }) => handleTeacherCommand(payload))
      .on('broadcast', { event: 'teacher_ping' }, () => {
        channel.send({ 
          type: 'broadcast', 
          event: 'student_presence_report', 
          payload: { 
            name: playerName, uniqueId, grade: studentGrade, 
            progress: `Câu ${lastStateRef.current.index + 1}` 
          } 
        });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.send({ type: 'broadcast', event: 'request_sync' });
        }
      });

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [currentTeacher.id, uniqueId]);

  useEffect(() => {
    if (gameState === 'ANSWERING' && timeLeft > 0 && !isWhiteboardActive) {
      const t = setInterval(() => setTimeLeft(p => p - 1), 1000);
      return () => clearInterval(t);
    }
  }, [gameState, timeLeft, isWhiteboardActive]);

  const submitAnswer = () => {
    if (!hasBuzzed) return;
    const currentProblem = rounds[0]?.problems[syncState.index];
    const correct = (currentProblem?.correctAnswer || "").trim().toUpperCase();
    const isPerfect = userAnswer.trim().toUpperCase() === correct;
    const points = isPerfect ? (isHelpUsed ? 60 : 100) : 0;
    
    setScore(s => s + points);
    setFeedback({ 
      isCorrect: isPerfect, 
      text: isPerfect ? '✨ CHÍNH XÁC!' : `❌ SAI RỒI! Đáp án đúng: ${correct}` 
    });
    setGameState('FEEDBACK');
    reportProgress(undefined, isPerfect, true);
  };

  const currentProblem = rounds[0]?.problems[syncState.index];

  if (gameState === 'GAME_OVER') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-center p-6">
        <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-md w-full border-b-[15px] border-emerald-600 animate-in zoom-in">
          <div className="text-8xl mb-6">🏆</div>
          <h2 className="text-3xl font-black uppercase italic mb-4">HOÀN THÀNH TIẾT DẠY</h2>
          <div className="text-6xl font-black text-emerald-600 mb-10 leading-none">{score}đ</div>
          <button onClick={onExit} className="w-full py-6 bg-slate-900 text-white rounded-3xl font-black uppercase italic shadow-xl">Về sảnh</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col p-4 text-left">
      <header className="bg-white px-8 py-4 rounded-full shadow-lg mb-6 flex justify-between items-center border-b-4 border-slate-200">
        <div className="flex items-center gap-4">
           <div className="bg-blue-600 text-white px-6 py-2 rounded-2xl font-black italic shadow-lg">ĐIỂM: {score}đ</div>
           <div className="text-[10px] font-black text-slate-300 uppercase italic">Câu {syncState.index + 1} / {rounds[0]?.problems?.length || 0}</div>
        </div>
        <div className="flex items-center gap-8">
           <div className="text-4xl font-black italic tabular-nums text-slate-900">{timeLeft}s</div>
           <button onClick={onExit} className="w-10 h-10 bg-red-50 text-red-500 rounded-xl font-black flex items-center justify-center">✕</button>
        </div>
      </header>
      
      {/* 
          KEY VERSIONING: Đây là chìa khóa giải quyết vấn đề của bạn.
          Khi syncState.version thay đổi (mỗi khi GV bấm Next), React sẽ xóa bỏ toàn bộ
          DOM cũ và dựng lại cái mới hoàn toàn, đảm bảo không bao giờ bị "kẹt" render.
      */}
      <div key={`arena-content-${syncState.index}-${syncState.version}`} className="flex-1 grid grid-cols-12 gap-8 min-h-0 relative">
        {isWhiteboardActive && (
          <div className="absolute inset-0 z-50 bg-slate-950 rounded-[3.5rem] p-4 shadow-2xl animate-in zoom-in">
            <Whiteboard isTeacher={false} channel={channelRef.current} roomCode="TEACHER_ROOM" />
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-md px-6 py-2 rounded-full border border-white/20 text-white font-black italic text-[10px] uppercase">Thầy đang giảng bài...</div>
          </div>
        )}
        
        <div className="col-span-7 h-full">
           <ProblemCard problem={currentProblem} isHelpUsed={isHelpUsed} isPaused={gameState !== 'ANSWERING' || isWhiteboardActive} />
        </div>
        
        <div className="col-span-5 bg-white rounded-[3.5rem] p-10 shadow-2xl flex flex-col border-4 border-slate-50 h-full">
           {gameState === 'ANSWERING' ? (
             <div className="flex flex-col h-full">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase italic">Làm bài:</h3>
                  <button onClick={() => { setHasBuzzed(true); reportProgress("🛎️ GIÀNH QUYỀN!"); }} disabled={hasBuzzed} className={`px-6 py-2 rounded-xl font-black text-[10px] uppercase italic transition-all ${hasBuzzed ? 'bg-amber-100 text-amber-600 border border-amber-200' : 'bg-red-600 text-white shadow-lg border-b-4 border-red-800'}`}>{hasBuzzed ? '🔔 ĐÃ GIÀNH QUYỀN' : 'GIÀNH QUYỀN 🛎️'}</button>
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar">
                  <AnswerInput problem={currentProblem} value={userAnswer} onChange={setUserAnswer} onSubmit={submitAnswer} disabled={false} />
                </div>
                {hasBuzzed && <button onClick={submitAnswer} disabled={!userAnswer} className="w-full py-6 bg-blue-600 text-white rounded-3xl font-black italic text-xl mt-8 shadow-xl border-b-8 border-blue-800 active:translate-y-1 active:border-b-0">XÁC NHẬN ✅</button>}
             </div>
           ) : (
             <div className="flex flex-col h-full animate-in slide-in-from-right">
                <div className={`text-4xl font-black uppercase italic mb-6 ${feedback?.isCorrect ? 'text-emerald-500' : 'text-rose-500'}`}>{feedback?.isCorrect ? '✨ CHÍNH XÁC!' : '💥 RẤT TIẾC!'}</div>
                <div className="bg-slate-50 p-8 rounded-[2.5rem] border-2 border-slate-100 italic font-bold text-slate-700 mb-8"><LatexRenderer content={feedback?.text || ""} /></div>
                <div className="flex-1 bg-emerald-50/50 p-8 rounded-[3rem] border-2 border-emerald-100 overflow-y-auto no-scrollbar italic leading-relaxed text-slate-600"><LatexRenderer content={currentProblem?.explanation || ""} /></div>
                <div className="mt-8 bg-blue-600 text-white p-6 rounded-3xl text-center font-black uppercase italic animate-pulse shadow-lg">⏳ Chờ Thầy chuyển câu...</div>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default TeacherEngine;
