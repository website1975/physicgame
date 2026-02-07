
import React, { useState } from 'react';
import ExamLibrary from './ExamLibrary';
import AdminPanel from './AdminPanel';
import AnswerInput from './AnswerInput';
import ConfirmModal from './ConfirmModal';
import TeacherManagement from './TeacherManagement';
import { standardizeLegacySets } from '../services/supabaseService';
import { Round, GameSettings, GameState, Player, AdminTab, Teacher, InteractiveMechanic, QuestionType, Difficulty, DisplayChallenge } from '../types';

interface TeacherPortalProps {
  adminTab: AdminTab;
  setAdminTab: (tab: AdminTab) => void;
  playerName: string;
  teacherId: string;
  teacherMaGV?: string;
  teacherSubject?: string; 
  teacherRole?: 'ADMIN' | 'TEACHER';
  onLogout: () => void;
  topicInput: string;
  setTopicInput: (s: string) => void;
  isGenerating: boolean;
  onGenerateSet: () => void;
  examSets: any[];
  searchLibrary: string;
  setSearchLibrary: (s: string) => void;
  activeCategory: string;
  setActiveCategory: (s: string) => void;
  categories: string[];
  onLoadSet: (setId: string, title: string) => Promise<boolean>;
  onDeleteSet: (setId: string, title: string) => Promise<boolean>;
  onDistribute: (setId: string, title: string, roomCode: string) => Promise<void>;
  onStartGame: (roomCode?: string) => void;
  rounds: Round[];
  setRounds: (r: Round[]) => void;
  settings: GameSettings;
  setSettings: (s: GameSettings) => void;
  currentGameState: GameState;
  onNextQuestion: () => void;
  players: Player[];
  myPlayerId: string;
  onSaveSet: (title: string, asNew: boolean, topic: string, grade: string) => Promise<void>;
  loadedSetTitle: string | null;
  loadedSetTopic?: string | null;
  loadedSetId: string | null;
  onResetToNew: () => void;
  onRefreshSets: () => void;
  isLoadingSets?: boolean;
  onLive: (setId: string, title: string) => void; // Prop mới nhận từ App
  liveSessionKey?: number;
}

const TeacherPortal: React.FC<TeacherPortalProps> = (props) => {
  const { adminTab, setAdminTab, playerName, teacherId, teacherMaGV, teacherSubject, teacherRole, onLogout, topicInput, setTopicInput, isGenerating, onGenerateSet, examSets, searchLibrary, setSearchLibrary, activeCategory, setActiveCategory, categories, onLoadSet, onDeleteSet, onDistribute, onStartGame, rounds, setRounds, settings, setSettings, currentGameState, onNextQuestion, players, myPlayerId, onSaveSet, loadedSetTitle, loadedSetTopic, loadedSetId, onResetToNew, onRefreshSets, isLoadingSets, onLive, liveSessionKey } = props;

  const [testMechanic, setTestMechanic] = useState<InteractiveMechanic | null>(null);
  const [testValue, setTestValue] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const labGames = [
    { id: InteractiveMechanic.CANNON, name: 'Pháo xạ kích', icon: '🛸', color: 'bg-slate-900', desc: 'Sử dụng pháo để bắn vào đáp án trôi nổi.' },
    { id: InteractiveMechanic.RISING_WATER, name: 'Nước dâng cao', icon: '🚢', color: 'bg-blue-600', desc: 'Thử thách tốc độ khi nước dâng dần lên.' },
    { id: InteractiveMechanic.SPACE_DASH, name: 'Vũ trụ phiêu lưu', icon: '🌌', color: 'bg-indigo-900', desc: 'Di chuyển phi thuyền trong không gian.' },
    { id: InteractiveMechanic.MARIO, name: 'Nấm lùn phiêu lưu', icon: '🍄', color: 'bg-orange-500', desc: 'Di chuyển để chạm vào các khối số đáp án.' },
    { id: InteractiveMechanic.HIDDEN_TILES, name: 'Lật ô bí mật', icon: '🃏', color: 'bg-emerald-600', desc: 'Ghi nhớ vị trí các con số dưới ô vuông.' },
  ];

  const dummyProblem = (mechanic: InteractiveMechanic) => ({
    id: 'test',
    title: 'Chế độ chạy thử',
    content: 'Hãy thử di chuyển và nhập đáp án bằng cơ chế này.',
    type: QuestionType.SHORT_ANSWER,
    difficulty: Difficulty.EASY,
    challenge: DisplayChallenge.NORMAL,
    topic: 'Test',
    correctAnswer: '123',
    explanation: 'Đây là chế độ demo.',
    mechanic: mechanic,
    timeLimit: 60
  });

  return (
    <div className="min-h-screen bg-slate-50 flex relative">
      <div className="fixed inset-0 pointer-events-none z-[9999]">
        {statusMsg && (
          <div className={`pointer-events-auto absolute top-10 left-1/2 -translate-x-1/2 px-10 py-5 rounded-[2rem] font-black text-xs uppercase italic shadow-2xl animate-in slide-in-from-top-10 duration-500 border-4 ${statusMsg.type === 'success' ? 'bg-emerald-600 border-emerald-500' : 'bg-red-600 border-red-500'} text-white`}>
            {statusMsg.type === 'success' ? '⚡ ' : '⚠️ '} {statusMsg.text}
          </div>
        )}
      </div>

      <aside className="w-80 bg-slate-900 text-white p-8 flex flex-col shrink-0">
        <div className="mb-12 text-center">
          <div className="w-20 h-20 bg-gradient-to-tr from-purple-600 to-blue-500 rounded-[2rem] flex items-center justify-center mx-auto mb-4 shadow-xl">
             <span className="text-4xl">👑</span>
          </div>
          <h2 className="text-2xl font-black italic tracking-tighter text-white uppercase leading-none">PhysiQuest</h2>
          <div className="text-[10px] text-purple-400 font-bold uppercase mt-2 tracking-widest">Hệ thống nhà trường</div>
        </div>
        
        <nav className="flex-1 space-y-4">
           <div className="bg-white/5 p-6 rounded-[2.5rem] border border-white/10 mb-6">
             <span className="text-[8px] font-black uppercase text-slate-500 block mb-3 tracking-widest">Tài khoản giáo viên</span>
             <div className="flex flex-col mb-4">
                <span className="text-base font-black italic text-white uppercase truncate">{playerName}</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase italic mt-0.5">{teacherSubject || 'Giáo viên'}</span>
             </div>
             
             <div className="bg-blue-600/20 border-2 border-blue-500/30 rounded-2xl p-4 text-center">
                <span className="text-[8px] font-black uppercase text-blue-400 block mb-1">Mã kết nối Arena</span>
                <div className="text-2xl font-black text-white tracking-widest uppercase italic">{teacherMaGV}</div>
             </div>
           </div>

           <div className="space-y-1">
              <button onClick={() => { onResetToNew(); setAdminTab('EDITOR'); }} className={`w-full text-left p-4 rounded-2xl font-black text-[10px] uppercase flex items-center gap-3 ${adminTab === 'EDITOR' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:bg-white/5'}`}><span>📝</span> Soạn thảo đề</button>
              <button onClick={() => { setAdminTab('CLOUD'); }} className={`w-full text-left p-4 rounded-2xl font-black text-[10px] uppercase flex items-center gap-3 ${adminTab === 'CLOUD' ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-400 hover:bg-white/5'}`}><span>🌍</span> Kho đề của tôi</button>
              <button onClick={() => { setAdminTab('LAB'); }} className={`w-full text-left p-4 rounded-2xl font-black text-[10px] uppercase flex items-center gap-3 ${adminTab === 'LAB' ? 'bg-[#FF6D60] text-white shadow-lg' : 'text-slate-400 hover:bg-white/5'}`}><span>🎮</span> Kho game Arena</button>
              <button onClick={() => { setAdminTab('CONTROL'); }} className={`w-full text-left p-4 rounded-2xl font-black text-[10px] uppercase flex items-center gap-3 ${adminTab === 'CONTROL' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:bg-white/5'}`}><span>🕹️</span> Quản lý Arena</button>
              
              {teacherRole === 'ADMIN' && (
                <button onClick={() => { setAdminTab('MANAGEMENT'); }} className={`w-full text-left p-4 rounded-2xl font-black text-[10px] uppercase flex items-center gap-3 ${adminTab === 'MANAGEMENT' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-400 hover:bg-white/5'}`}><span>👨‍👩‍👧‍👦</span> Danh sách GV</button>
              )}
           </div>
        </nav>

        <button onClick={onLogout} className="mt-auto p-5 text-slate-500 font-black text-[10px] uppercase flex items-center gap-3 hover:text-white transition-colors"><span>🚪</span> Đăng xuất</button>
      </aside>

      <main className="flex-1 p-12 overflow-y-auto no-scrollbar bg-[#f8fafc]">
         <header className="flex flex-col xl:flex-row justify-between items-center gap-8 mb-16">
            <div className="flex-1 w-full text-center xl:text-left">
              <h3 className="text-7xl font-black italic uppercase text-slate-900 tracking-tighter leading-none animate-in slide-in-from-left">
                {adminTab === 'EDITOR' ? 'Workshop' : adminTab === 'CLOUD' ? 'KHO ĐỀ' : adminTab === 'LAB' ? 'ARENA LAB' : adminTab === 'MANAGEMENT' ? 'QUẢN LÝ GV' : 'CONTROL'}
              </h3>
              <p className="text-slate-400 font-bold italic text-base mt-4">Hệ thống quản lý chuyên môn nhà trường</p>
            </div>
         </header>

         {adminTab === 'CLOUD' ? (
           <ExamLibrary 
             examSets={examSets} searchLibrary={searchLibrary} setSearchLibrary={setSearchLibrary} 
             activeCategory={activeCategory} setActiveCategory={setActiveCategory} categories={categories}
             onLoadSet={onLoadSet} onDeleteSet={id => onDeleteSet(id, "")} onDistribute={() => {}} 
             onEdit={(id, title) => { onLoadSet(id, title); setAdminTab('EDITOR'); }} onLive={onLive} 
             onRefresh={onRefreshSets} teacherId={teacherId} teacherSubject={teacherSubject} isLoadingSets={isLoadingSets}
           />
         ) : adminTab === 'MANAGEMENT' ? (
           <TeacherManagement />
         ) : adminTab === 'LAB' ? (
           <div className="max-w-6xl mx-auto space-y-12 animate-in fade-in">
              {testMechanic ? (
                <div className="bg-white rounded-[3.5rem] p-10 border-8 border-slate-100 shadow-2xl flex flex-col items-center">
                   <div className="w-full flex justify-between items-center mb-10">
                      <button onClick={() => setTestMechanic(null)} className="px-6 py-3 bg-slate-100 text-slate-500 font-black rounded-xl uppercase italic text-[10px]">← Quay lại kho game</button>
                      <h4 className="text-3xl font-black uppercase italic text-slate-800">Chạy thử: {labGames.find(g => g.id === testMechanic)?.name}</h4>
                   </div>
                   <div className="w-full max-w-4xl h-[550px]"><AnswerInput problem={dummyProblem(testMechanic as InteractiveMechanic) as any} value={testValue} onChange={setTestValue} onSubmit={() => alert(`Bạn đã nhập: ${testValue}`)} disabled={false} /></div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
                  {labGames.map((game) => (
                    <div key={game.id} className="bg-white p-8 rounded-[3rem] border-4 border-slate-100 shadow-xl flex flex-col items-center text-center group hover:-translate-y-2 transition-all">
                       <div className={`w-24 h-24 ${game.color} rounded-[2rem] flex items-center justify-center text-5xl mb-6 shadow-xl group-hover:scale-110 transition-transform`}>{game.icon}</div>
                       <h5 className="text-xl font-black uppercase italic text-slate-800 mb-2">{game.name}</h5>
                       <button onClick={() => { setTestMechanic(game.id as InteractiveMechanic); setTestValue(''); }} className="w-full py-4 bg-slate-900 text-white font-black rounded-2xl uppercase italic text-[10px] shadow-lg hover:bg-blue-600 transition-colors">Chạy thử ngay 🚀</button>
                    </div>
                  ))}
                </div>
              )}
           </div>
         ) : (
           <div className="h-full">
              <AdminPanel 
                rounds={rounds} setRounds={setRounds} settings={settings} setSettings={setSettings} onStartGame={onStartGame} currentGameState={currentGameState} onNextQuestion={onNextQuestion} currentProblemIdx={0} totalProblems={rounds[0]?.problems?.length || 0} players={players} myPlayerId={myPlayerId} teacherId={teacherId} examSets={examSets} onSaveSet={onSaveSet} adminTab={adminTab as any} setAdminTab={setAdminTab as any} loadedSetTitle={loadedSetTitle} loadedSetTopic={loadedSetTopic} loadedSetId={loadedSetId} categories={categories} fullView={true} onResetToNew={onResetToNew} onLoadSet={onLoadSet} liveSessionKey={liveSessionKey}
              />
           </div>
         )}
      </main>
    </div>
  );
};

export default TeacherPortal;
