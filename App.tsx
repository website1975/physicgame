
import React, { useState, useEffect } from 'react';
import { GameState, Round, Teacher, GameSettings, AdminTab } from './types';
import { loginTeacher, fetchTeacherByMaGV, supabase, fetchAllExamSets, fetchSetData, saveExamSet, updateExamSet, deleteExamSet, assignSetToRoom } from './services/supabaseService';
import TeacherPortal from './components/TeacherPortal';
import StudentArenaFlow from './components/StudentArenaFlow';
import GameEngine from './components/GameEngine';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>('LOBBY');
  const [playerName, setPlayerName] = useState('');
  const [studentGrade, setStudentGrade] = useState<'10' | '11' | '12' | null>(null);
  const [teacherIdInput, setTeacherIdInput] = useState('');
  const [teacherPass, setTeacherPass] = useState('');
  const [currentTeacher, setCurrentTeacher] = useState<Teacher | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Trạng thái cho Teacher Portal
  const [adminTab, setAdminTab] = useState<AdminTab>('EDITOR');
  const [examSets, setExamSets] = useState<any[]>([]);
  const [loadedSetTitle, setLoadedSetTitle] = useState<string | null>(null);
  const [loadedSetId, setLoadedSetId] = useState<string | null>(null);
  const [rounds, setRounds] = useState<Round[]>([{ number: 1, problems: [], description: '' }]);
  const [settings, setSettings] = useState<GameSettings>({ autoNext: true, autoNextDelay: 20, maxPlayers: 2 });

  // Trạng thái dùng chung cho quy trình Học sinh (Nâng cấp lên đây để tránh mất dữ liệu)
  const [joinedRoom, setJoinedRoom] = useState<any>(null);
  const [availableSets, setAvailableSets] = useState<any[]>([]);

  // Trạng thái trận đấu
  const [matchData, setMatchData] = useState<{ setId: string, title: string, rounds: Round[], opponentName?: string, joinedRoom?: any } | null>(null);

  const refreshSets = async (tId: string) => {
    setIsLoading(true);
    try {
      const sets = await fetchAllExamSets(tId);
      setExamSets(sets);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  useEffect(() => {
    if (gameState === 'ADMIN' && currentTeacher) {
      refreshSets(currentTeacher.id);
    }
  }, [gameState, currentTeacher?.id]);

  const handleStartMatch = (data: { setId: string, title: string, rounds: Round[], opponentName?: string, joinedRoom?: any }) => {
    setMatchData(data);
    setGameState('ROUND_INTRO');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-900">
      {/* 1. LOBBY CHÍNH */}
      {gameState === 'LOBBY' && (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-2xl w-full text-center border-b-[12px] border-blue-600 animate-in zoom-in duration-500">
            <h1 className="text-7xl font-black text-slate-800 mb-2 uppercase italic tracking-tighter">PhysiQuest</h1>
            <p className="text-slate-400 font-bold uppercase text-[10px] mb-8 tracking-[0.3em]">HỆ THỐNG ĐẤU TRƯỜNG VẬT LÝ</p>
            <input 
              type="text" 
              placeholder="Nhập tên thi đấu..." 
              className="w-full p-6 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-center text-2xl mb-8 outline-none focus:border-blue-500 transition-all" 
              value={playerName} 
              onChange={e => setPlayerName(e.target.value)} 
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button disabled={!playerName} onClick={() => setGameState('STUDENT_SETUP')} className="py-6 bg-blue-600 text-white font-black rounded-3xl uppercase italic shadow-xl text-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50">Học sinh 🎒</button>
              <button disabled={!playerName} onClick={() => setGameState('TEACHER_LOGIN')} className="py-6 bg-purple-600 text-white font-black rounded-3xl uppercase italic shadow-xl text-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50">Giáo viên 👨‍🏫</button>
            </div>
          </div>
        </div>
      )}

      {/* 2. ĐĂNG NHẬP / SETUP */}
      {(gameState === 'TEACHER_LOGIN' || gameState === 'STUDENT_SETUP') && (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-md w-full text-center animate-in fade-in slide-in-from-bottom-4">
            <h2 className="text-3xl font-black text-slate-800 uppercase italic mb-8 tracking-tighter">
              {gameState === 'TEACHER_LOGIN' ? 'GIÁO VIÊN ĐĂNG NHẬP' : 'KẾT NỐI HỆ THỐNG'}
            </h2>
            {errorMsg && <div className="mb-6 p-4 bg-red-50 text-red-500 rounded-2xl font-bold text-xs border-2 border-red-100">{errorMsg}</div>}
            <div className="space-y-4 mb-8">
               <input type="text" placeholder="Mã Giáo Viên" className="w-full p-5 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-center text-xl uppercase outline-none focus:border-blue-500" value={teacherIdInput} onChange={e => setTeacherIdInput(e.target.value)} />
               {gameState === 'TEACHER_LOGIN' ? (
                 <input type="password" placeholder="Mật khẩu" className="w-full p-5 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-center text-xl outline-none focus:border-blue-500" value={teacherPass} onChange={e => setTeacherPass(e.target.value)} />
               ) : (
                 <div className="pt-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 italic">Chọn khối lớp của bạn:</p>
                    <div className="flex gap-2">
                      {['10', '11', '12'].map(g => (
                        <button key={g} onClick={() => setStudentGrade(g as any)} className={`flex-1 py-4 rounded-2xl font-black italic transition-all border-4 ${studentGrade === g ? 'bg-blue-600 text-white border-blue-500 shadow-lg' : 'bg-slate-50 text-slate-300 border-slate-100'}`}>K{g}</button>
                      ))}
                    </div>
                 </div>
               )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => { setGameState('LOBBY'); setErrorMsg(''); }} className="py-5 bg-slate-100 text-slate-400 rounded-3xl font-black uppercase italic">Hủy</button>
              <button onClick={gameState === 'TEACHER_LOGIN' ? async () => {
                const { teacher, error } = await loginTeacher(teacherIdInput, teacherPass);
                if (teacher) { setCurrentTeacher(teacher); setGameState('ADMIN'); }
                else setErrorMsg(error || 'Lỗi đăng nhập');
              } : async () => {
                if (!studentGrade) { setErrorMsg('Vui lòng chọn khối lớp!'); return; }
                const teacher = await fetchTeacherByMaGV(teacherIdInput);
                if (teacher) { setCurrentTeacher(teacher); setGameState('ROOM_SELECTION'); }
                else setErrorMsg('Không tìm thấy giáo viên với mã này');
              }} className="py-5 bg-blue-600 text-white font-black rounded-3xl uppercase italic shadow-lg">Xác nhận</button>
            </div>
          </div>
        </div>
      )}

      {/* 3. QUY TRÌNH HỌC SINH (Sử dụng dữ liệu phòng được lưu ở App.tsx) */}
      {(gameState === 'ROOM_SELECTION' || gameState === 'SET_SELECTION' || gameState === 'WAITING_FOR_PLAYERS' || gameState === 'KEYWORD_SELECTION') && currentTeacher && (
        <StudentArenaFlow 
          gameState={gameState}
          setGameState={setGameState}
          playerName={playerName}
          studentGrade={studentGrade!}
          currentTeacher={currentTeacher}
          onStartMatch={handleStartMatch}
          joinedRoom={joinedRoom}
          setJoinedRoom={setJoinedRoom}
          availableSets={availableSets}
          setAvailableSets={setAvailableSets}
        />
      )}

      {/* 4. TRÌNH QUẢN LÝ GIÁO VIÊN */}
      {gameState === 'ADMIN' && currentTeacher && (
        <TeacherPortal 
          adminTab={adminTab} setAdminTab={setAdminTab} playerName={currentTeacher.tengv} teacherId={currentTeacher.id} 
          teacherMaGV={currentTeacher.magv} teacherSubject={currentTeacher.monday} onLogout={() => setGameState('LOBBY')}
          topicInput="" setTopicInput={() => {}} isGenerating={false} onGenerateSet={() => {}} 
          examSets={examSets} searchLibrary="" setSearchLibrary={() => {}} activeCategory="Tất cả"
          setActiveCategory={() => {}} categories={[]} 
          onLoadSet={async (id, title) => {
            const data = await fetchSetData(id); setRounds(data.rounds); setLoadedSetId(id); setLoadedSetTitle(title); return true;
          }}
          onDeleteSet={async (id) => { await deleteExamSet(id); refreshSets(currentTeacher.id); return true; }}
          onDistribute={async (setId, title, roomCode) => { await assignSetToRoom(currentTeacher.id, roomCode, setId); }}
          onStartGame={() => setGameState('ROOM_SELECTION')} rounds={rounds} setRounds={setRounds} settings={settings} setSettings={setSettings}
          currentGameState={gameState} onNextQuestion={() => {}} players={[]} myPlayerId={playerName}
          onSaveSet={async (title, asNew, topic, grade) => {
            if (asNew) await saveExamSet(currentTeacher.id, title, rounds, topic, grade, currentTeacher.monday);
            else await updateExamSet(loadedSetId!, title, rounds, topic, grade, currentTeacher.id);
            refreshSets(currentTeacher.id);
          }}
          loadedSetTitle={loadedSetTitle} loadedSetTopic={null} loadedSetId={loadedSetId}
          onResetToNew={() => { setRounds([{ number: 1, problems: [], description: '' }]); setLoadedSetId(null); setLoadedSetTitle(null); }}
          onRefreshSets={() => refreshSets(currentTeacher.id)} isLoadingSets={isLoading}
        />
      )}

      {/* 5. ENGINE TRẬN ĐẤU */}
      {matchData && ['ROUND_INTRO', 'STARTING_ROUND', 'WAITING_FOR_BUZZER', 'ANSWERING', 'FEEDBACK', 'GAME_OVER'].includes(gameState) && (
        <GameEngine 
          gameState={gameState}
          setGameState={setGameState}
          playerName={playerName}
          currentTeacher={currentTeacher!}
          matchData={matchData}
          onExit={() => { 
            setMatchData(null); 
            // Nếu có dữ liệu phòng, quay về chọn đề, nếu không quay về chọn phòng
            setGameState(joinedRoom ? 'SET_SELECTION' : 'ROOM_SELECTION'); 
          }}
        />
      )}
    </div>
  );
};

export default App;
