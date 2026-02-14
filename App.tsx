
import React, { useState, useEffect } from 'react';
import { GameState, Round, Teacher, AdminTab } from './types';
import { loginTeacher, fetchTeacherByMaGV, supabase, fetchAllExamSets, fetchSetData, saveExamSet, updateExamSet, deleteExamSet, getVisitorCount, incrementVisitorCount } from './services/supabaseService';
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
  const [totalQuests, setTotalQuests] = useState<number>(0);
  const [visitorCount, setVisitorCount] = useState<number>(0);
  
  const [adminTab, setAdminTab] = useState<AdminTab>('EDITOR');
  const [examSets, setExamSets] = useState<any[]>([]);
  const [loadedSetTitle, setLoadedSetTitle] = useState<string | null>(null);
  const [loadedSetId, setLoadedSetId] = useState<string | null>(null);
  const [loadedSetTopic, setLoadedSetTopic] = useState<string | null>(null);
  const [rounds, setRounds] = useState<Round[]>([{ number: 1, problems: [], description: '' }]);
  const [joinedRoom, setJoinedRoom] = useState<any>(null);
  const [matchData, setMatchData] = useState<any>(null);
  const [liveSessionKey, setLiveSessionKey] = useState<number>(Date.now());

  useEffect(() => { 
    const fetchStats = async () => {
      const vCount = await getVisitorCount();
      setVisitorCount(vCount);
      const { count } = await supabase.from('exam_sets').select('*', { count: 'exact', head: true });
      if (count !== null) setTotalQuests(count);
    };
    fetchStats();
    incrementVisitorCount();
  }, []);

  const refreshSets = async (tId: string) => {
    setIsLoading(true);
    try {
      const sets = await fetchAllExamSets(tId);
      setExamSets(sets);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  const handleLoadSet = async (id: string, title: string) => {
    try {
      setIsLoading(true);
      const data = await fetchSetData(id);
      setRounds(data.rounds);
      setLoadedSetId(id);
      setLoadedSetTitle(title);
      setLoadedSetTopic(data.topic);
      return true;
    } catch (e) { return false; } 
    finally { setIsLoading(false); }
  };

  const handleStartLive = (setId: string, title: string) => {
    handleLoadSet(setId, title).then(success => {
      if (success) {
        setLiveSessionKey(Date.now()); // Tạo session mới
        setAdminTab('CONTROL');
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-900 font-sans">
      {gameState === 'LOBBY' && (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-2xl w-full text-center border-b-[12px] border-blue-600 relative overflow-hidden">
            <div className="absolute top-8 right-10 flex flex-col items-end gap-2 opacity-60">
               <div className="text-[10px] font-black text-slate-400 uppercase italic">Online: {visitorCount}</div>
               <div className="text-[10px] font-black text-blue-600 uppercase italic">Hệ thống: {totalQuests} Đề</div>
            </div>
            <div className="text-left mb-10">
              <h1 className="text-4xl font-black text-slate-800 uppercase italic tracking-tighter leading-none">PhysiQuest</h1>
              <p className="text-slate-400 font-bold uppercase text-[8px] tracking-[0.2em] mt-2">Đấu Trường Vật Lý Trực Tuyến</p>
            </div>
            <input type="text" placeholder="Tên của bạn..." className="w-full p-6 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-center text-2xl mb-8 outline-none focus:border-blue-500 transition-all" value={playerName} onChange={e => setPlayerName(e.target.value)} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button disabled={!playerName} onClick={() => setGameState('STUDENT_SETUP')} className="py-6 bg-blue-600 text-white font-black rounded-3xl uppercase italic shadow-xl text-xl hover:scale-105 active:scale-95 transition-all">Học sinh 🎒</button>
              <button disabled={!playerName} onClick={() => setGameState('TEACHER_LOGIN')} className="py-6 bg-purple-600 text-white font-black rounded-3xl uppercase italic shadow-xl text-xl hover:scale-105 active:scale-95 transition-all">Giáo viên 👨‍🏫</button>
            </div>
          </div>
        </div>
      )}

      {(gameState === 'TEACHER_LOGIN' || gameState === 'STUDENT_SETUP') && (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-md w-full text-center animate-in zoom-in">
            <h2 className="text-3xl font-black text-slate-800 uppercase italic mb-8">{gameState === 'TEACHER_LOGIN' ? 'ĐĂNG NHẬP GV' : 'CHỌN KHỐI LỚP'}</h2>
            {errorMsg && <div className="mb-6 p-4 bg-red-50 text-red-500 rounded-2xl font-bold text-xs border-2 border-red-100">{errorMsg}</div>}
            <div className="space-y-4 mb-8">
               <input type="text" placeholder="Mã Giáo Viên" className="w-full p-5 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-center text-xl uppercase outline-none focus:border-blue-500" value={teacherIdInput} onChange={e => setTeacherIdInput(e.target.value)} />
               {gameState === 'TEACHER_LOGIN' ? (
                 <input type="password" placeholder="Mật khẩu" className="w-full p-5 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-center text-xl outline-none focus:border-blue-500" value={teacherPass} onChange={e => setTeacherPass(e.target.value)} />
               ) : (
                 <div className="flex gap-2">
                    {['10', '11', '12'].map(g => (
                      <button key={g} onClick={() => setStudentGrade(g as any)} className={`flex-1 py-5 rounded-2xl font-black italic transition-all border-4 ${studentGrade === g ? 'bg-blue-600 text-white border-blue-400 shadow-lg' : 'bg-slate-50 text-slate-300 border-slate-100'}`}>K{g}</button>
                    ))}
                 </div>
               )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setGameState('LOBBY')} className="py-5 bg-slate-100 text-slate-400 rounded-3xl font-black uppercase italic">Hủy</button>
              <button onClick={gameState === 'TEACHER_LOGIN' ? async () => {
                const { teacher, error } = await loginTeacher(teacherIdInput, teacherPass);
                if (teacher) { setCurrentTeacher(teacher); refreshSets(teacher.id); setGameState('ADMIN'); }
                else setErrorMsg(error || 'Sai thông tin');
              } : async () => {
                if (!studentGrade) { setErrorMsg('Hãy chọn khối lớp!'); return; }
                const teacher = await fetchTeacherByMaGV(teacherIdInput);
                if (teacher) { setCurrentTeacher(teacher); setGameState('ROOM_SELECTION'); }
                else setErrorMsg('Không tìm thấy GV');
              }} className="py-5 bg-blue-600 text-white font-black rounded-3xl uppercase italic shadow-lg">Tiếp tục</button>
            </div>
          </div>
        </div>
      )}

      {gameState === 'ADMIN' && currentTeacher && (
        <TeacherPortal 
          {...{adminTab, setAdminTab, playerName: currentTeacher.tengv, teacherId: currentTeacher.id, teacherMaGV: currentTeacher.magv, teacherSubject: currentTeacher.monday, teacherRole: currentTeacher.role, onLogout: () => setGameState('LOBBY'), examSets, searchLibrary: '', setSearchLibrary: () => {}, activeCategory: 'Tất cả', setActiveCategory: () => {}, onLoadSet: handleLoadSet, onDeleteSet: async (id) => { await deleteExamSet(id); refreshSets(currentTeacher.id); return true; }, onRefreshSets: () => refreshSets(currentTeacher.id), isLoadingSets: isLoading, onSaveSet: async (t, asNew, top, g) => {
            let fid = loadedSetId;
            if (asNew || !fid) fid = await saveExamSet(currentTeacher.id, t, rounds, top, g, currentTeacher.monday);
            else await updateExamSet(fid, t, rounds, top, g, currentTeacher.id);
            setLoadedSetId(fid); setLoadedSetTitle(t); setLoadedSetTopic(top); refreshSets(currentTeacher.id);
          }, rounds, setRounds, loadedSetTitle, loadedSetId, loadedSetTopic, onResetToNew: () => { setRounds([{ number: 1, problems: [], description: '' }]); setLoadedSetId(null); setLoadedSetTitle(null); setLoadedSetTopic(null); }, onLive: handleStartLive, liveSessionKey}}
        />
      )}

      {(['ROOM_SELECTION', 'WAITING_ROOM', 'WAITING_FOR_PLAYERS', 'SET_SELECTION', 'ENTER_CODE'].includes(gameState)) && (
        <StudentArenaFlow 
          gameState={gameState} setGameState={setGameState} playerName={playerName} studentGrade={studentGrade!} currentTeacher={currentTeacher!}
          onStartMatch={(data) => { setMatchData(data); setGameState('ROUND_INTRO'); }} joinedRoom={joinedRoom} setJoinedRoom={setJoinedRoom} availableSets={[]} setAvailableSets={() => {}}
        />
      )}

      {matchData && ['ROUND_INTRO', 'STARTING_ROUND', 'WAITING_FOR_BUZZER', 'ANSWERING', 'FEEDBACK', 'GAME_OVER'].includes(gameState) && (
        <GameEngine gameState={gameState} setGameState={setGameState} playerName={playerName} currentTeacher={currentTeacher!} matchData={matchData} onExit={() => { setMatchData(null); setGameState('ROOM_SELECTION'); }} />
      )}
    </div>
  );
};

export default App;
