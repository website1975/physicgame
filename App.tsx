
import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { GameState, Round, Teacher, GameSettings, AdminTab } from './types';
import { loginTeacher, fetchTeacherByMaGV, supabase, fetchAllExamSets, fetchSetData, saveExamSet, updateExamSet, deleteExamSet, assignSetToRoom, getVisitorCount, incrementVisitorCount } from './services/supabaseService';
import TeacherPortal from './components/TeacherPortal';
import StudentArenaFlow from './components/StudentArenaFlow';
import GameEngine from './components/GameEngine';

// Polyfill and Key extraction to ensure API_KEY is available in process.env for the SDK
(function() {
  const getSafeEnv = (key: string): string | undefined => {
    try {
      const p = (typeof process !== 'undefined' ? process.env : undefined) as any;
      const m = (typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined) as any;
      return (p?.[key] || p?.[`VITE_${key}`] || m?.[key] || m?.[`VITE_${key}`]);
    } catch (e) { return undefined; }
  };

  if (typeof (window as any).process === 'undefined') {
    (window as any).process = { env: {} };
  }
  if (!process.env.API_KEY) {
    process.env.API_KEY = getSafeEnv('API_KEY');
  }
})();

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>('LOBBY');
  const [playerName, setPlayerName] = useState('');
  const [studentGrade, setStudentGrade] = useState<'10' | '11' | '12' | null>(null);
  const [teacherIdInput, setTeacherIdInput] = useState('');
  const [teacherPass, setTeacherPass] = useState('');
  const [currentTeacher, setCurrentTeacher] = useState<Teacher | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [totalQuests, setTotalQuests] = useState<number>(0);
  const [visitorCount, setVisitorCount] = useState<number>(0);
  
  const [activeCategory, setActiveCategory] = useState('Tất cả');
  const [adminTab, setAdminTab] = useState<AdminTab>('EDITOR');
  const [examSets, setExamSets] = useState<any[]>([]);
  const [loadedSetTitle, setLoadedSetTitle] = useState<string | null>(null);
  const [loadedSetId, setLoadedSetId] = useState<string | null>(null);
  const [rounds, setRounds] = useState<Round[]>([{ number: 1, problems: [], description: '' }]);
  const [settings, setSettings] = useState<GameSettings>({ autoNext: true, autoNextDelay: 20, maxPlayers: 2 });
  const [joinedRoom, setJoinedRoom] = useState<any>(null);
  const [availableSets, setAvailableSets] = useState<any[]>([]);
  const [matchData, setMatchData] = useState<{ setId: string, title: string, rounds: Round[], opponentName?: string, joinedRoom?: any, startIndex?: number, myId?: string } | null>(null);

  const [liveSessionKey, setLiveSessionKey] = useState<number>(Date.now());

  const checkAI = async () => {
    setApiStatus('checking');
    try {
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        setApiStatus('offline');
        return;
      }
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({ 
        model: 'gemini-3-flash-preview', 
        contents: 'ping', 
        config: { maxOutputTokens: 1 } 
      });
      if (response.text) {
        setApiStatus('online');
      }
    } catch (e) { 
      console.error("AI Check failed:", e);
      setApiStatus('offline'); 
    }
  };

  const handleVisitorTracking = async () => {
    const isNewSession = !sessionStorage.getItem('visitor_tracked');
    if (isNewSession) {
      const newCount = await incrementVisitorCount();
      setVisitorCount(newCount);
      sessionStorage.setItem('visitor_tracked', 'true');
    } else {
      const count = await getVisitorCount();
      setVisitorCount(count);
    }
  };

  const fetchGlobalStats = async () => {
    try {
      const { count } = await supabase.from('exam_sets').select('*', { count: 'exact', head: true });
      if (count !== null) setTotalQuests(count);
    } catch (e) {
      console.error("Lỗi lấy thống kê:", e);
    }
  };

  useEffect(() => { 
    checkAI(); 
    fetchGlobalStats();
    handleVisitorTracking();
  }, []);

  const refreshSets = async (tId: string) => {
    setIsLoading(true);
    try {
      const sets = await fetchAllExamSets(tId);
      setExamSets(sets);
      fetchGlobalStats();
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  useEffect(() => {
    if (gameState === 'ADMIN' && currentTeacher) refreshSets(currentTeacher.id);
  }, [gameState, currentTeacher?.id]);

  const handleLiveNow = async (id: string, title: string) => {
    try {
      setIsLoading(true);
      const data = await fetchSetData(id);
      setRounds(data.rounds);
      setLoadedSetId(id);
      setLoadedSetTitle(title);
      setLiveSessionKey(Date.now());
      setAdminTab('CONTROL');
    } catch (e) {
      console.error("Lỗi nạp đề Live:", e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-900">
      {gameState === 'LOBBY' && (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-2xl w-full text-center border-b-[12px] border-blue-600 animate-in zoom-in duration-500 relative overflow-hidden">
            <div className="absolute top-8 right-10 flex flex-col items-end gap-2">
               <div className="flex items-center gap-3">
                  {/* Visitor Counter */}
                  <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100 shadow-sm">
                     <span className="text-sm">👤 :</span>
                     <span className="text-[10px] font-black text-slate-600 uppercase italic tracking-wider whitespace-nowrap">
                       {visitorCount}
                     </span>
                  </div>

                  {/* AI Status */}
                  {apiStatus === 'online' ? (
                    <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100 shadow-sm">
                       <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_#10b981]"></div>
                       <span className="text-[9px] font-black text-emerald-600 uppercase italic tracking-wider">AI READY ✨</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-red-50 px-3 py-1.5 rounded-full border border-red-100 shadow-sm">
                       <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                       <span className="text-[9px] font-black text-red-600 uppercase italic tracking-wider">AI OFFLINE</span>
                    </div>
                  )}
               </div>
               
               {/* Quest Counter */}
               <div className="flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-full border border-blue-100 shadow-sm">
                  <span className="text-sm">📚</span>
                  <span className="text-[9px] font-black text-blue-600 uppercase italic tracking-wider">
                    Hệ thống : {totalQuests} Đề
                  </span>
               </div>
            </div>

            {/* Smaller title and shifted left to avoid overlap */}
            <div className="text-left ml-2 md:ml-4">
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-black text-slate-800 mb-1 uppercase italic tracking-tighter">PhysiQuest</h1>
              <p className="text-slate-400 font-bold uppercase text-[6px] md:text-[8px] mb-8 tracking-[0.2em] ml-0.5">Hệ Thống Đấu Trường Vật Lý</p>
            </div>
            
            <input type="text" placeholder="Tên thi đấu..." className="w-full p-6 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-center text-2xl mb-8 outline-none focus:border-blue-500 transition-all" value={playerName} onChange={e => setPlayerName(e.target.value)} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button disabled={!playerName} onClick={() => setGameState('STUDENT_SETUP')} className="py-6 bg-blue-600 text-white font-black rounded-3xl uppercase italic shadow-xl text-xl hover:scale-105 active:scale-95 transition-all">Học sinh 🎒</button>
              <button disabled={!playerName} onClick={() => setGameState('TEACHER_LOGIN')} className="py-6 bg-purple-600 text-white font-black rounded-3xl uppercase italic shadow-xl text-xl hover:scale-105 active:scale-95 transition-all">Giáo viên 👨‍🏫</button>
            </div>
          </div>
        </div>
      )}

      {(gameState === 'TEACHER_LOGIN' || gameState === 'STUDENT_SETUP') && (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-md w-full text-center animate-in slide-in-from-bottom-4">
            <h2 className="text-3xl font-black text-slate-800 uppercase italic mb-4">{gameState === 'TEACHER_LOGIN' ? 'ĐĂNG NHẬP' : 'KẾT NỐI'}</h2>
            {errorMsg && <div className="mb-6 p-4 bg-red-50 text-red-500 rounded-2xl font-bold text-xs border-2 border-red-100">{errorMsg}</div>}
            <div className="space-y-4 mb-8">
               <input type="text" placeholder="Mã Giáo Viên" className="w-full p-5 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-center text-xl uppercase outline-none focus:border-blue-500" value={teacherIdInput} onChange={e => setTeacherIdInput(e.target.value)} />
               {gameState === 'TEACHER_LOGIN' ? (
                 <input type="password" placeholder="Mật khẩu" className="w-full p-5 bg-slate-50 border-4 border-slate-100 rounded-3xl font-black text-center text-xl outline-none focus:border-blue-500" value={teacherPass} onChange={e => setTeacherPass(e.target.value)} />
               ) : (
                 <div className="pt-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase mb-3 italic">Chọn khối lớp của bạn:</p>
                    <div className="flex gap-2">
                      {['10', '11', '12'].map(g => (
                        <button 
                          key={g} 
                          onClick={() => setStudentGrade(g as any)} 
                          className={`flex-1 py-4 rounded-2xl font-black italic transition-all border-4 
                            ${studentGrade === g 
                              ? 'bg-blue-600 text-white border-blue-400 shadow-[0_0_15px_rgba(37,99,235,0.6)] scale-105' 
                              : 'bg-slate-50 text-slate-300 border-slate-100'}`}
                        >K{g}</button>
                      ))}
                    </div>
                 </div>
               )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setGameState('LOBBY')} className="py-5 bg-slate-100 text-slate-400 rounded-3xl font-black uppercase italic">Hủy</button>
              <button onClick={gameState === 'TEACHER_LOGIN' ? async () => {
                const { teacher, error } = await loginTeacher(teacherIdInput, teacherPass);
                if (teacher) { setCurrentTeacher(teacher); setGameState('ADMIN'); }
                else setErrorMsg(error || 'Lỗi');
              } : async () => {
                if (!studentGrade) { setErrorMsg('Chọn khối lớp!'); return; }
                const teacher = await fetchTeacherByMaGV(teacherIdInput);
                if (teacher) { setCurrentTeacher(teacher); setGameState('ROOM_SELECTION'); }
                else setErrorMsg('Không tìm thấy GV');
              }} className="py-5 bg-blue-600 text-white font-black rounded-3xl uppercase italic shadow-lg">Vào Arena</button>
            </div>
          </div>
        </div>
      )}

      {gameState === 'ADMIN' && currentTeacher && (
        <TeacherPortal 
          adminTab={adminTab} setAdminTab={setAdminTab} playerName={currentTeacher.tengv} teacherId={currentTeacher.id} 
          teacherMaGV={currentTeacher.magv} teacherSubject={currentTeacher.monday} teacherRole={currentTeacher.role} onLogout={() => setGameState('LOBBY')}
          topicInput="" setTopicInput={() => {}} isGenerating={false} onGenerateSet={() => {}} 
          examSets={examSets} searchLibrary="" setSearchLibrary={() => {}} 
          activeCategory={activeCategory} setActiveCategory={setActiveCategory} categories={[]} 
          onLoadSet={async (id, title) => { const data = await fetchSetData(id); setRounds(data.rounds); setLoadedSetId(id); setLoadedSetTitle(title); return true; }}
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
          onLive={handleLiveNow}
          liveSessionKey={liveSessionKey}
        />
      )}

      {(['ROOM_SELECTION', 'ENTER_CODE', 'SET_SELECTION', 'WAITING_FOR_PLAYERS', 'KEYWORD_SELECTION'].includes(gameState)) && currentTeacher && (
        <StudentArenaFlow 
          gameState={gameState} setGameState={setGameState} playerName={playerName} studentGrade={studentGrade!} currentTeacher={currentTeacher}
          onStartMatch={(data) => { setMatchData(data); setGameState('ROUND_INTRO'); }} joinedRoom={joinedRoom} setJoinedRoom={setJoinedRoom} availableSets={availableSets} setAvailableSets={setAvailableSets}
        />
      )}

      {matchData && ['ROUND_INTRO', 'STARTING_ROUND', 'WAITING_FOR_BUZZER', 'ANSWERING', 'FEEDBACK', 'GAME_OVER'].includes(gameState) && (
        <GameEngine gameState={gameState} setGameState={setGameState} playerName={playerName} currentTeacher={currentTeacher!} matchData={matchData} onExit={() => { setMatchData(null); setGameState('ROOM_SELECTION'); }} />
      )}
    </div>
  );
};

export default App;
