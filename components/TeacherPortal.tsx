
import React, { useState } from 'react';
import ExamLibrary from './ExamLibrary';
import AdminPanel from './AdminPanel';
import AnswerInput from './AnswerInput';
import ConfirmModal from './ConfirmModal';
import TeacherManagement from './TeacherManagement'; // Mới
import { standardizeLegacySets } from '../services/supabaseService';
import { Round, GameSettings, GameState, Player, AdminTab, Teacher, InteractiveMechanic, QuestionType, Difficulty, DisplayChallenge } from '../types';

interface TeacherPortalProps {
  adminTab: AdminTab;
  setAdminTab: (tab: AdminTab) => void;
  playerName: string;
  teacherId: string;
  teacherMaGV?: string;
  teacherSubject?: string; 
  teacherRole?: 'ADMIN' | 'TEACHER'; // Mới
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
}

const TeacherPortal: React.FC<TeacherPortalProps> = (props) => {
  const { adminTab, setAdminTab, playerName, teacherId, teacherMaGV, teacherSubject, teacherRole, onLogout, topicInput, setTopicInput, isGenerating, onGenerateSet, examSets, searchLibrary, setSearchLibrary, activeCategory, setActiveCategory, categories, onLoadSet, onDeleteSet, onDistribute, onStartGame, rounds, setRounds, settings, setSettings, currentGameState, onNextQuestion, players, myPlayerId, onSaveSet, loadedSetTitle, loadedSetTopic, loadedSetId, onResetToNew, onRefreshSets, isLoadingSets } = props;

  const [testMechanic, setTestMechanic] = useState<InteractiveMechanic | null>(null);
  const [testValue, setTestValue] = useState('');
  const [isStandardizing, setIsStandardizing] = useState(false);
  const [showConfirmStandardize, setShowConfirmStandardize] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const labGames = [
    { id: InteractiveMechanic.CANNON, name: 'Pháo xạ kích', icon: '🛸', color: 'bg-slate-900', desc: 'Sử dụng pháo để bắn vào đáp án trôi nổi.' },
    { id: InteractiveMechanic.RISING_WATER, name: 'Nước dâng cao', icon: '🚢', color: 'bg-blue-600', desc: 'Thử thách tốc độ khi nước dâng dần lên.' },
    { id: InteractiveMechanic.SPACE_DASH, name: 'Vũ trụ phiêu lưu', icon: '🌌', color: 'bg-indigo-900', desc: 'Di chuyển phi thuyền trong không gian.' },
    { id: InteractiveMechanic.MARIO, name: 'Nấm lùn phiêu lưu', icon: '🍄', color: 'bg-orange-500', desc: 'Di chuyển để chạm vào các khối số đáp án.' },
    { id: InteractiveMechanic.HIDDEN_TILES, name: 'Lật ô bí mật', icon: '🃏', color: 'bg-emerald-600', desc: 'Ghi nhớ vị trí các con số dưới ô vuông.' },
  ];

  const showStatus = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleStandardize = async () => {
    if (!teacherMaGV) {
      showStatus("Lỗi: Không tìm thấy Mã GV để chuẩn hoá!", "error");
      return;
    }
    setIsStandardizing(true);
    setShowConfirmStandardize(false);
    try {
      await standardizeLegacySets(teacherId, teacherMaGV);
      showStatus("Đã chuẩn hoá thành công toàn bộ kho đề!");
      onRefreshSets();
    } catch (e) {
      showStatus("Lỗi chuẩn hoá dữ liệu!", "error");
    } finally {
      setIsStandardizing(false);
    }
  };

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

  const hasLegacy = examSets.some(s => s.is_legacy);

  return (
    <div className="min-h-screen bg-slate-50 flex relative">
      <div className="fixed inset-0 pointer-events-none z-[9999]">
        {statusMsg && (
          <div className={`pointer-events-auto absolute top-10 left-1/2 -translate-x-1/2 px-10 py-5 rounded-[2rem] font-black text-xs uppercase italic shadow-2xl animate-in slide-in-from-top-10 duration-500 border-4 ${statusMsg.type === 'success' ? 'bg-emerald-600 border-emerald-500' : 'bg-red-600 border-red-500'} text-white`}>
            {statusMsg.type === 'success' ? '⚡ ' : '⚠️ '} {statusMsg.text}
          </div>
        )}
        {showConfirmStandardize && (
          <div className="pointer-events-auto">
            <ConfirmModal 
              isOpen={showConfirmStandardize}
              title="Xác nhận chuẩn hoá?"
              message="Hệ thống sẽ chuyển tất cả đề từ Mã GV sang ID chuẩn của Thầy/Cô để dễ quản lý hơn. Quá trình này không thể hoàn tác."
              onConfirm={handleStandardize}
              onCancel={() => setShowConfirmStandardize(false)}
              confirmText="Bắt đầu dọn dẹp"
              cancelText="Để sau"
            />
          </div>
        )}
      </div>

      <aside className="w-80 bg-slate-900 text-white p-8 flex flex-col shrink-0">
        <div className="mb-12 text-center">
          <div className="w-20 h-20 bg-gradient-to-tr from-purple-600 to-blue-500 rounded-[2rem] flex items-center justify-center mx-auto mb-4 shadow-xl shadow-purple-500/20">
             <span className="text-4xl">👑</span>
          </div>
          <h2 className="text-2xl font-black italic tracking-tighter text-white uppercase leading-none">PhysiQuest</h2>
          <div className="text-[10px] text-purple-400 font-bold uppercase mt-2 tracking-widest tracking-[0.2em]">Hệ thống nhà trường</div>
        </div>
        
        <nav className="flex-1 space-y-4">
           <div className="bg-white/5 p-5 rounded-[2rem] border border-white/10 mb-6">
             <span className="text-[8px] font-black uppercase text-slate-500 block mb-2 tracking-widest">Tài khoản</span>
             <div className="flex flex-col">
                <span className="text-sm font-black italic text-white uppercase truncate">{playerName}</span>
                <div className="flex items-center gap-2 mt-1">
                   <span className="text-[9px] font-bold text-blue-400 uppercase italic">{teacherMaGV}</span>
                   {teacherRole === 'ADMIN' && <span className="text-[7px] bg-purple-600 text-white px-1.5 py-0.5 rounded font-black uppercase tracking-tighter">Hiệu Phó</span>}
                </div>
             </div>
           </div>

           <div className="space-y-1">
              <button 
                onClick={() => { onResetToNew(); setAdminTab('EDITOR'); setTestMechanic(null); }} 
                className={`w-full text-left p-4 rounded-2xl font-black text-[10px] uppercase transition-all flex items-center gap-3 ${adminTab === 'EDITOR' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'text-slate-400 hover:bg-white/5'}`}
              >
                 <span>📝</span> Soạn thảo đề
              </button>
              <button onClick={() => { setAdminTab('CLOUD'); setTestMechanic(null); }} className={`w-full text-left p-4 rounded-2xl font-black text-[10px] uppercase transition-all flex items-center gap-3 ${adminTab === 'CLOUD' ? 'bg-sky-600 text-white shadow-lg shadow-sky-500/20' : 'text-slate-400 hover:bg-white/5'}`}>
                 <span>🌍</span> Kho đề của tôi
              </button>
              <button onClick={() => { setAdminTab('LAB'); setTestMechanic(null); }} className={`w-full text-left p-4 rounded-2xl font-black text-[10px] uppercase transition-all flex items-center gap-3 ${adminTab === 'LAB' ? 'bg-[#FF6D60] text-white shadow-lg shadow-[#FF6D60]/20' : 'text-slate-400 hover:bg-white/5'}`}>
                 <span>🎮</span> Kho game Arena
              </button>
              <button onClick={() => { setAdminTab('CONTROL'); setTestMechanic(null); }} className={`w-full text-left p-4 rounded-2xl font-black text-[10px] uppercase transition-all flex items-center gap-3 ${adminTab === 'CONTROL' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-white/5'}`}>
                 <span>🕹️</span> Quản lý Arena
              </button>
              
              {/* MENU DÀNH RIÊNG CHO ADMIN */}
              {teacherRole === 'ADMIN' && (
                <button 
                  onClick={() => { setAdminTab('MANAGEMENT'); setTestMechanic(null); }} 
                  className={`w-full text-left p-4 rounded-2xl font-black text-[10px] uppercase transition-all flex items-center gap-3 mt-4 ${adminTab === 'MANAGEMENT' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-300 hover:bg-white/5 border border-dashed border-white/10'}`}
                >
                   <span>👥</span> Quản lý giáo viên
                </button>
              )}
           </div>
        </nav>

        <button onClick={onLogout} className="mt-auto p-5 text-slate-500 font-black text-[10px] uppercase flex items-center gap-3 hover:text-white transition-colors">
           <span>🚪</span> Đăng xuất
        </button>
      </aside>

      <main className="flex-1 p-12 overflow-y-auto no-scrollbar bg-[#f8fafc]">
         <header className="flex flex-col xl:flex-row justify-between items-center gap-8 mb-16">
            <div className="flex-1 w-full text-center xl:text-left">
              <div className="flex items-center gap-4 mb-4">
                <h3 className="text-7xl font-black italic uppercase text-slate-900 tracking-tighter leading-none animate-in slide-in-from-left duration-500">
                  {adminTab === 'EDITOR' ? 'Workshop' : 
                   adminTab === 'CLOUD' ? 'KHO ĐỀ' : 
                   adminTab === 'LAB' ? 'ARENA LAB' : 
                   adminTab === 'MANAGEMENT' ? 'Dân số GV' : 'CONTROL'}
                </h3>
                {adminTab === 'CLOUD' && hasLegacy && (
                  <button 
                    onClick={() => { setShowConfirmStandardize(true); }}
                    disabled={isStandardizing}
                    className="px-6 py-3 bg-amber-500 text-white font-black rounded-2xl uppercase italic text-[10px] shadow-lg animate-bounce hover:scale-110 active:scale-95 transition-all"
                  >
                    {isStandardizing ? 'Đang dọn dẹp...' : '⚡ Chuẩn hoá đề cũ'}
                  </button>
                )}
              </div>
              <p className="text-slate-400 font-bold italic text-base">Hệ thống quản lý chuyên môn nhà trường</p>
            </div>
            {adminTab === 'CLOUD' && (
              <div className="flex items-center gap-4 bg-white p-4 rounded-[4rem] shadow-[0_20px_50px_rgba(0,0,0,0.05)] border-4 border-slate-50 w-full max-w-2xl animate-in zoom-in duration-300">
                 <input 
                  type="text" 
                  placeholder="Chủ đề bài giảng..." 
                  className="flex-1 px-8 py-4 bg-slate-50/50 border-none rounded-3xl font-bold outline-none text-lg placeholder:text-slate-300" 
                  value={topicInput} 
                  onChange={e => setTopicInput(e.target.value)} 
                 />
                 <button 
                  disabled={isGenerating || !topicInput} 
                  onClick={onGenerateSet} 
                  className="bg-[#C499F3] text-white px-10 py-5 rounded-[2.5rem] font-black uppercase italic shadow-lg hover:scale-[1.03] transition-all disabled:opacity-50 flex items-center gap-3 text-lg"
                 >
                    {isGenerating ? '⌛...' : <><span className="text-2xl">⚡</span> TẠO ĐỀ AI</>}
                 </button>
              </div>
            )}
         </header>

         {adminTab === 'CLOUD' ? (
           <ExamLibrary 
             examSets={examSets} 
             searchLibrary={searchLibrary} 
             setSearchLibrary={setSearchLibrary} 
             activeCategory={activeCategory} 
             setActiveCategory={setActiveCategory} 
             categories={categories}
             onLoadSet={onLoadSet}
             onDeleteSet={id => onDeleteSet(id, "")}
             onDistribute={onDistribute}
             onEdit={(id, title) => { onLoadSet(id, title); setAdminTab('EDITOR'); }}
             onRefresh={onRefreshSets}
             teacherId={teacherId}
             teacherSubject={teacherSubject}
             isLoadingSets={isLoadingSets}
           />
         ) : adminTab === 'MANAGEMENT' ? (
           <TeacherManagement />
         ) : adminTab === 'LAB' ? (
           <div className="max-w-6xl mx-auto space-y-12 animate-in fade-in duration-500">
              {testMechanic ? (
                <div className="bg-white rounded-[3.5rem] p-10 border-8 border-slate-100 shadow-2xl flex flex-col items-center">
                   <div className="w-full flex justify-between items-center mb-10">
                      <button onClick={() => setTestMechanic(null)} className="px-6 py-3 bg-slate-100 text-slate-500 font-black rounded-xl uppercase italic text-[10px]">← Quay lại kho game</button>
                      <h4 className="text-3xl font-black uppercase italic text-slate-800">Chế độ chạy thử: {labGames.find(g => g.id === testMechanic)?.name}</h4>
                      <div className="w-24" />
                   </div>
                   <div className="w-full max-w-4xl h-[550px]">
                      <AnswerInput 
                        problem={dummyProblem(testMechanic as InteractiveMechanic) as any} 
                        value={testValue} 
                        onChange={setTestValue} 
                        onSubmit={() => alert(`Bạn đã nhập: ${testValue}`)} 
                        disabled={false} 
                      />
                   </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
                  {labGames.map((game) => (
                    <div key={game.id} className="bg-white p-8 rounded-[3rem] border-4 border-slate-100 shadow-xl flex flex-col items-center text-center group hover:-translate-y-2 transition-all">
                       <div className={`w-24 h-24 ${game.color} rounded-[2rem] flex items-center justify-center text-5xl mb-6 shadow-xl group-hover:scale-110 transition-transform`}>
                          {game.icon}
                       </div>
                       <h5 className="text-xl font-black uppercase italic text-slate-800 mb-2">{game.name}</h5>
                       <p className="text-slate-400 font-bold text-[11px] mb-8 leading-relaxed h-12">{game.desc}</p>
                       <button 
                        onClick={() => { setTestMechanic(game.id as InteractiveMechanic); setTestValue(''); }}
                        className="w-full py-4 bg-slate-900 text-white font-black rounded-2xl uppercase italic text-[10px] shadow-lg hover:bg-blue-600 transition-colors"
                       >
                         Chạy thử ngay 🚀
                       </button>
                    </div>
                  ))}
                </div>
              )}
           </div>
         ) : (
           <div className="h-full">
              <AdminPanel 
                rounds={rounds} 
                setRounds={setRounds} 
                settings={settings} 
                setSettings={setSettings} 
                onStartGame={onStartGame} 
                currentGameState={currentGameState} 
                onNextQuestion={onNextQuestion} 
                currentProblemIdx={0} 
                totalProblems={rounds[0]?.problems?.length || 0} 
                players={players}
                myPlayerId={myPlayerId}
                teacherId={teacherId}
                examSets={examSets}
                onSaveSet={onSaveSet}
                adminTab={adminTab as any}
                setAdminTab={setAdminTab as any}
                loadedSetTitle={loadedSetTitle}
                loadedSetTopic={loadedSetTopic}
                loadedSetId={loadedSetId}
                categories={categories}
                fullView={true}
                onResetToNew={onResetToNew}
              />
           </div>
         )}
      </main>
    </div>
  );
};

export default TeacherPortal;
