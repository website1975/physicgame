
import React from 'react';
import { Round, AdminTab } from '../types';
import EditorPanel from './admin/EditorPanel';
import LibraryPanel from './admin/LibraryPanel';
import GameLabPanel from './admin/GameLabPanel';
import ManagementPanel from './admin/ManagementPanel';

interface TeacherPortalProps {
  adminTab: AdminTab;
  setAdminTab: (tab: AdminTab) => void;
  playerName: string;
  teacherId: string;
  teacherMaGV?: string;
  teacherSubject?: string; 
  teacherRole?: 'ADMIN' | 'TEACHER';
  onLogout: () => void;
  examSets: any[];
  searchLibrary: string;
  setSearchLibrary: (s: string) => void;
  activeCategory: string;
  setActiveCategory: (s: string) => void;
  onLoadSet: (setId: string, title: string) => Promise<boolean>;
  onDeleteSet: (setId: string, title: string) => Promise<boolean>;
  onRefreshSets: () => void;
  isLoadingSets?: boolean;
  onSaveSet: (title: string, asNew: boolean, topic: string, grade: string) => Promise<void>;
  rounds: Round[];
  setRounds: (r: Round[]) => void;
  onLive: (setId: string, title: string) => void;
  loadedSetTitle: string | null;
  loadedSetId: string | null;
  loadedSetTopic?: string | null;
  onResetToNew: () => void;
  liveSessionKey?: number;
}

const TeacherPortal: React.FC<TeacherPortalProps> = (props) => {
  const { 
    adminTab, setAdminTab, playerName, teacherId, teacherMaGV, 
    teacherSubject, teacherRole, onLogout, examSets, searchLibrary, 
    setSearchLibrary, activeCategory, setActiveCategory, onLoadSet, 
    onDeleteSet, onRefreshSets, isLoadingSets, onSaveSet, rounds, 
    setRounds, loadedSetTitle, loadedSetId, loadedSetTopic, 
    onResetToNew 
  } = props;

  return (
    <div className="min-h-screen bg-slate-50 flex relative">
      <aside className="w-72 bg-slate-900 text-white p-8 flex flex-col shrink-0">
        <div className="mb-12 text-center">
          <div className="w-16 h-16 bg-gradient-to-tr from-purple-600 to-blue-500 rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 shadow-xl">
             <span className="text-3xl">👑</span>
          </div>
          <h2 className="text-xl font-black italic tracking-tighter uppercase leading-none">PhysiQuest</h2>
          <div className="text-[8px] text-purple-400 font-bold uppercase mt-2 tracking-widest">Teacher Cloud</div>
        </div>
        
        <nav className="flex-1 space-y-3">
           <div className="bg-white/5 p-5 rounded-[2rem] border border-white/10 mb-6">
             <div className="flex flex-col mb-3">
                <span className="text-sm font-black italic text-white uppercase truncate">{playerName}</span>
                <span className="text-[8px] font-bold text-slate-400 uppercase italic mt-0.5">{teacherSubject || 'Giáo viên'}</span>
             </div>
             <div className="bg-blue-600/20 border border-blue-500/30 rounded-xl p-3 text-center">
                <span className="text-[7px] font-black uppercase text-blue-400 block mb-0.5">Mã GV</span>
                <div className="text-lg font-black text-white tracking-widest uppercase italic">{teacherMaGV}</div>
             </div>
           </div>

           <div className="space-y-1">
              <button onClick={() => { onResetToNew(); setAdminTab('EDITOR'); }} className={`w-full text-left p-4 rounded-xl font-black text-[9px] uppercase flex items-center gap-3 ${adminTab === 'EDITOR' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:bg-white/5'}`}><span>📝</span> Soạn thảo đề</button>
              <button onClick={() => setAdminTab('CLOUD')} className={`w-full text-left p-4 rounded-xl font-black text-[9px] uppercase flex items-center gap-3 ${adminTab === 'CLOUD' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:bg-white/5'}`}><span>🌍</span> Kho đề của tôi</button>
              <button onClick={() => setAdminTab('LAB')} className={`w-full text-left p-4 rounded-xl font-black text-[9px] uppercase flex items-center gap-3 ${adminTab === 'LAB' ? 'bg-[#FF6D60] text-white' : 'text-slate-400 hover:bg-white/5'}`}><span>🎮</span> Kho game Arena</button>
              
              {teacherRole === 'ADMIN' && (
                <button onClick={() => setAdminTab('MANAGEMENT')} className={`w-full text-left p-4 rounded-xl font-black text-[9px] uppercase flex items-center gap-3 ${adminTab === 'MANAGEMENT' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:bg-white/5'}`}><span>👥</span> Danh sách GV</button>
              )}
           </div>
        </nav>

        <button onClick={onLogout} className="mt-auto p-4 text-slate-500 font-black text-[9px] uppercase flex items-center gap-2 hover:text-white"><span>🚪</span> Đăng xuất</button>
      </aside>

      <main className="flex-1 p-10 overflow-y-auto no-scrollbar bg-[#f8fafc]">
         <header className="flex justify-between items-center mb-10">
            <div>
              <h3 className="text-5xl font-black italic uppercase text-slate-900 tracking-tighter leading-none">
                {adminTab === 'EDITOR' ? 'Workshop' : adminTab === 'CLOUD' ? 'Library' : adminTab === 'LAB' ? 'Game Lab' : 'Directory'}
              </h3>
            </div>
         </header>

         {adminTab === 'EDITOR' && (
           <EditorPanel 
             rounds={rounds} setRounds={setRounds} teacherId={teacherId} 
             loadedSetId={loadedSetId} loadedSetTitle={loadedSetTitle || ''} 
             loadedSetTopic={loadedSetTopic} onSaveSet={onSaveSet} onResetToNew={onResetToNew}
           />
         )}

         {adminTab === 'CLOUD' && (
           <LibraryPanel 
             examSets={examSets} searchLibrary={searchLibrary} setSearchLibrary={setSearchLibrary}
             activeCategory={activeCategory} setActiveCategory={setActiveCategory}
             // Fixed handleLoadSet to onLoadSet as it is correctly destructured from props
             onLoadSet={onLoadSet} onDeleteSet={onDeleteSet} onRefresh={onRefreshSets}
             teacherId={teacherId} teacherSubject={teacherSubject} isLoadingSets={isLoadingSets}
             onEdit={(id, title) => { onLoadSet(id, title); setAdminTab('EDITOR'); }}
             onLive={() => {}}
           />
         )}

         {adminTab === 'LAB' && <GameLabPanel />}

         {adminTab === 'MANAGEMENT' && <ManagementPanel />}
      </main>
    </div>
  );
};

export default TeacherPortal;
