import React, { useState, useEffect, useMemo } from 'react';
import { Round } from '../../types';
import ConfirmModal from '../ConfirmModal';
import LatexRenderer from '../LatexRenderer';
import { 
  fetchAllAssignmentsForTeacher, 
  removeRoomAssignment, 
  assignSetToRoom, 
  getLeaderboard,
  fetchSetData,
  updateExamSet,
  updateExamSetTitle
} from '../../services/supabaseService';
import { 
  WeekNode, 
  ChapterNode, 
  GradeCurriculum, 
  DEFAULT_PHYSICS_CURRICULUM,
  getCurriculumTree,
  saveCurriculumTree,
  matchExamToCurriculum
} from '../../services/curriculumData';

interface CurriculumPanelProps {
  examSets: any[];
  teacherId: string;
  teacherSubject?: string;
  onLoadSet: (setId: string, title: string) => Promise<boolean>;
  onDeleteSet: (setId: string, title: string) => Promise<boolean>;
  onRefresh: () => void;
  isLoadingSets?: boolean;
  onEdit: (id: string, title: string) => void;
  onAddNewSetForTopic?: (grade: string, chapter: string, week: string) => void;
}

const arenaRooms = [
  { id: '1', name: 'Phòng đơn', code: 'ARENA_A', emoji: '🛡️' },
  { id: '2', name: 'Phòng đôi', code: 'ARENA_B', emoji: '⚔️' },
  { id: '3', name: 'Phòng 3', code: 'ARENA_C', emoji: '🏹' },
  { id: '4', name: 'Phòng 4', code: 'ARENA_D', emoji: '🔱' },
];

const CurriculumPanel: React.FC<CurriculumPanelProps> = ({
  examSets,
  teacherId,
  teacherSubject = 'Vật lý',
  onLoadSet,
  onDeleteSet,
  onRefresh,
  isLoadingSets,
  onEdit,
  onAddNewSetForTopic
}) => {
  // Active filter grade
  const [selectedGrade, setSelectedGrade] = useState<'ALL' | '10' | '11' | '12'>('10');
  const [searchQuery, setSearchQuery] = useState('');
  const [arenaFilter, setArenaFilter] = useState<'ALL' | 'ASSIGNED' | 'UNASSIGNED'>('ALL');

  // Expanded nodes map
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    'grade_10': true,
    'grade_11': true,
    'grade_12': true,
    'c10_1': true,
    'c10_1_w1': true,
    'c10_1_w2': true,
    'c10_2': true,
    'c10_2_w3': true,
    'c10_2_w4': true,
    'c11_1': true,
    'c11_1_w1': true,
    'c12_1': true,
    'c12_1_w1': true,
  });

  // Custom curriculum storage
  const [curriculumTree, setCurriculumTree] = useState<GradeCurriculum[]>(() => {
    return getCurriculumTree(teacherId);
  });

  // Re-sync when teacherId changes
  useEffect(() => {
    setCurriculumTree(getCurriculumTree(teacherId));
  }, [teacherId]);

  // Set assignments
  const [setAssignments, setSetAssignments] = useState<Record<string, string[]>>({});
  const [isToggling, setIsToggling] = useState(false);

  // Modals state for Exam Sets
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [distributeTarget, setDistributeTarget] = useState<{ id: string; title: string; assignedRooms: string[] } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null);
  const [newName, setNewName] = useState('');
  const [leaderboardTarget, setLeaderboardTarget] = useState<{ id: string; title: string } | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);

  // Preview Modal
  const [previewSet, setPreviewSet] = useState<{
    id: string;
    title: string;
    topic: string;
    grade: string;
    rounds: Round[];
  } | null>(null);

  // Add Chapter / Week Modal
  const [showAddModal, setShowAddModal] = useState<{
    type: 'CHAPTER' | 'WEEK';
    grade: string;
    chapterId?: string;
  } | null>(null);
  const [newTitleInput, setNewTitleInput] = useState('');

  // EDIT Chapter / Week Modal
  const [editingNode, setEditingNode] = useState<{
    type: 'CHAPTER' | 'WEEK';
    grade: string;
    chapterId: string;
    weekId?: string;
    currentName: string;
  } | null>(null);
  const [editTitleInput, setEditTitleInput] = useState('');

  // DELETE Chapter / Week Modal
  const [deletingNode, setDeletingNode] = useState<{
    type: 'CHAPTER' | 'WEEK';
    grade: string;
    chapterId: string;
    weekId?: string;
    name: string;
  } | null>(null);

  // Reset to default confirmation
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Move / Reassign Set Modal
  const [moveTargetSet, setMoveTargetSet] = useState<any | null>(null);
  const [targetChapter, setTargetChapter] = useState('');
  const [targetWeek, setTargetWeek] = useState('');

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Fetch Room Assignments
  const fetchAllAssignments = async () => {
    try {
      const allAssignments = await fetchAllAssignmentsForTeacher(teacherId);
      const assignmentsMap: Record<string, string[]> = {};
      allAssignments.forEach((row: any) => {
        if (!assignmentsMap[row.set_id]) assignmentsMap[row.set_id] = [];
        assignmentsMap[row.set_id].push(row.room_code);
      });
      setSetAssignments(assignmentsMap);
    } catch (e) {
      console.error("Lỗi tải gán phòng:", e);
    }
  };

  useEffect(() => {
    if (examSets.length > 0) fetchAllAssignments();
  }, [examSets]);

  // Save curriculum custom state
  const saveCurriculum = (newTree: GradeCurriculum[]) => {
    setCurriculumTree(newTree);
    saveCurriculumTree(teacherId, newTree);
  };

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    curriculumTree.forEach(g => {
      next[`grade_${g.grade}`] = true;
      g.chapters.forEach(c => {
        next[c.id] = true;
        c.weeks.forEach(w => {
          next[w.id] = true;
        });
      });
    });
    setExpandedNodes(next);
  };

  const collapseAll = () => {
    setExpandedNodes({});
  };

  // Reset to default standard curriculum
  const handleResetToDefault = () => {
    saveCurriculum(DEFAULT_PHYSICS_CURRICULUM);
    setShowResetConfirm(false);
    expandAll();
    showToast("Đã khôi phục phân phối chương trình chuẩn GDPT thành công!");
  };

  const handleToggleRoom = async (roomCode: string) => {
    if (!distributeTarget || isToggling) return;
    const setId = distributeTarget.id;
    const isCurrentlyAssigned = distributeTarget.assignedRooms.includes(roomCode);
    const newAssignedRooms = isCurrentlyAssigned
      ? distributeTarget.assignedRooms.filter(c => c !== roomCode)
      : [...distributeTarget.assignedRooms, roomCode];

    setDistributeTarget(prev => prev ? { ...prev, assignedRooms: newAssignedRooms } : null);
    setSetAssignments(prev => ({ ...prev, [setId]: newAssignedRooms }));

    setIsToggling(true);
    try {
      if (isCurrentlyAssigned) {
        await removeRoomAssignment(teacherId, roomCode, setId);
      } else {
        await assignSetToRoom(teacherId, roomCode, setId);
      }
    } catch (e) {
      console.error("Lỗi cập nhật gán phòng:", e);
      alert("Lỗi khi cập nhật gán phòng. Vui lòng kiểm tra lại kết nối.");
      fetchAllAssignments();
    } finally {
      setIsToggling(false);
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !newName.trim()) return;
    try {
      await updateExamSetTitle(renameTarget.id, newName.trim());
      onRefresh();
      setRenameTarget(null);
      showToast("Đã đổi tên đề thi thành công!");
    } catch (e) {
      alert("Lỗi đổi tên bộ đề");
    }
  };

  const handleViewLeaderboard = async (setId: string, title: string) => {
    setLeaderboardTarget({ id: setId, title });
    setIsLoadingLeaderboard(true);
    try {
      const data = await getLeaderboard(setId);
      setLeaderboardData(data);
    } catch (e) {
      console.error("Lỗi tải bảng xếp hạng:", e);
    } finally {
      setIsLoadingLeaderboard(false);
    }
  };

  const handlePreviewSet = async (setId: string, title: string) => {
    try {
      const data = await fetchSetData(setId);
      setPreviewSet({
        id: setId,
        title: data.title || title,
        topic: data.topic,
        grade: data.grade,
        rounds: data.rounds || []
      });
    } catch (e) {
      alert("Không thể tải chi tiết đề thi.");
    }
  };

  // ADD CHAPTER / WEEK
  const handleConfirmAdd = () => {
    if (!showAddModal || !newTitleInput.trim()) return;
    const { type, grade, chapterId } = showAddModal;
    const updated = JSON.parse(JSON.stringify(curriculumTree)) as GradeCurriculum[];
    let gradeItem = updated.find(g => g.grade === grade);
    if (!gradeItem) {
      gradeItem = { grade, chapters: [] };
      updated.push(gradeItem);
    }

    if (type === 'CHAPTER') {
      const newChapId = `custom_c_${Date.now()}`;
      gradeItem.chapters.push({
        id: newChapId,
        name: newTitleInput.trim(),
        weeks: [
          { id: `${newChapId}_w1`, name: 'Đề ôn tuần 1', custom: true }
        ],
        custom: true
      });
      setExpandedNodes(prev => ({ ...prev, [`grade_${grade}`]: true, [newChapId]: true }));
      showToast(`Đã thêm "${newTitleInput.trim()}" vào Khối ${grade}`);
    } else if (type === 'WEEK' && chapterId) {
      const chap = gradeItem.chapters.find(c => c.id === chapterId);
      if (chap) {
        const newWeekId = `custom_w_${Date.now()}`;
        chap.weeks.push({
          id: newWeekId,
          name: newTitleInput.trim(),
          custom: true
        });
        setExpandedNodes(prev => ({ ...prev, [chapterId]: true, [newWeekId]: true }));
        showToast(`Đã thêm tuần mới vào "${chap.name}"`);
      }
    }

    saveCurriculum(updated);
    setShowAddModal(null);
    setNewTitleInput('');
  };

  // EDIT CHAPTER / WEEK
  const handleConfirmEdit = () => {
    if (!editingNode || !editTitleInput.trim()) return;
    const { type, grade, chapterId, weekId } = editingNode;
    const updated = JSON.parse(JSON.stringify(curriculumTree)) as GradeCurriculum[];
    const gradeItem = updated.find(g => g.grade === grade);
    if (!gradeItem) return;

    if (type === 'CHAPTER') {
      const chap = gradeItem.chapters.find(c => c.id === chapterId);
      if (chap) {
        chap.name = editTitleInput.trim();
        showToast(`Đã đổi tên chương thành "${chap.name}"`);
      }
    } else if (type === 'WEEK' && weekId) {
      const chap = gradeItem.chapters.find(c => c.id === chapterId);
      if (chap) {
        const week = chap.weeks.find(w => w.id === weekId);
        if (week) {
          week.name = editTitleInput.trim();
          showToast(`Đã đổi tên tuần thành "${week.name}"`);
        }
      }
    }

    saveCurriculum(updated);
    setEditingNode(null);
    setEditTitleInput('');
  };

  // DELETE CHAPTER / WEEK
  const handleConfirmDelete = () => {
    if (!deletingNode) return;
    const { type, grade, chapterId, weekId, name } = deletingNode;
    const updated = JSON.parse(JSON.stringify(curriculumTree)) as GradeCurriculum[];
    const gradeItem = updated.find(g => g.grade === grade);
    if (!gradeItem) return;

    if (type === 'CHAPTER') {
      gradeItem.chapters = gradeItem.chapters.filter(c => c.id !== chapterId);
      showToast(`Đã xóa "${name}". Các đề thi liên quan được chuyển vào mục Tự chọn.`);
    } else if (type === 'WEEK' && weekId) {
      const chap = gradeItem.chapters.find(c => c.id === chapterId);
      if (chap) {
        chap.weeks = chap.weeks.filter(w => w.id !== weekId);
        showToast(`Đã xóa tuần "${name}".`);
      }
    }

    saveCurriculum(updated);
    setDeletingNode(null);
  };

  // REORDER CHAPTER (MOVE UP / DOWN)
  const handleMoveChapter = (grade: string, chapterId: string, direction: 'UP' | 'DOWN') => {
    const updated = JSON.parse(JSON.stringify(curriculumTree)) as GradeCurriculum[];
    const gradeItem = updated.find(g => g.grade === grade);
    if (!gradeItem) return;

    const idx = gradeItem.chapters.findIndex(c => c.id === chapterId);
    if (idx === -1) return;

    if (direction === 'UP' && idx > 0) {
      const temp = gradeItem.chapters[idx];
      gradeItem.chapters[idx] = gradeItem.chapters[idx - 1];
      gradeItem.chapters[idx - 1] = temp;
    } else if (direction === 'DOWN' && idx < gradeItem.chapters.length - 1) {
      const temp = gradeItem.chapters[idx];
      gradeItem.chapters[idx] = gradeItem.chapters[idx + 1];
      gradeItem.chapters[idx + 1] = temp;
    }

    saveCurriculum(updated);
  };

  // REORDER WEEK (MOVE UP / DOWN)
  const handleMoveWeek = (grade: string, chapterId: string, weekId: string, direction: 'UP' | 'DOWN') => {
    const updated = JSON.parse(JSON.stringify(curriculumTree)) as GradeCurriculum[];
    const gradeItem = updated.find(g => g.grade === grade);
    if (!gradeItem) return;
    const chap = gradeItem.chapters.find(c => c.id === chapterId);
    if (!chap) return;

    const idx = chap.weeks.findIndex(w => w.id === weekId);
    if (idx === -1) return;

    if (direction === 'UP' && idx > 0) {
      const temp = chap.weeks[idx];
      chap.weeks[idx] = chap.weeks[idx - 1];
      chap.weeks[idx - 1] = temp;
    } else if (direction === 'DOWN' && idx < chap.weeks.length - 1) {
      const temp = chap.weeks[idx];
      chap.weeks[idx] = chap.weeks[idx + 1];
      chap.weeks[idx + 1] = temp;
    }

    saveCurriculum(updated);
  };

  // Move exam set to a new topic / week
  const handleConfirmMoveSet = async () => {
    if (!moveTargetSet || !targetChapter) return;
    const combinedTopic = targetWeek ? `${targetChapter} - ${targetWeek}` : targetChapter;
    try {
      await updateExamSet(
        moveTargetSet.id,
        moveTargetSet.title,
        moveTargetSet.data || [],
        combinedTopic,
        moveTargetSet.grade || '10',
        teacherId
      );
      onRefresh();
      setMoveTargetSet(null);
      showToast("Đã chuyển vị trí bộ đề thành công!");
    } catch (e: any) {
      alert("Lỗi khi chuyển chuyên đề: " + (e.message || ""));
    }
  };

  // SMART MATCHER: Map exam sets into the curriculum tree hierarchy
  const categorizedCurriculum = useMemo(() => {
    const activeGrades = selectedGrade === 'ALL' ? ['10', '11', '12'] : [selectedGrade];

    return activeGrades.map(gradeStr => {
      const gradeDef = curriculumTree.find(g => g.grade === gradeStr) || { grade: gradeStr, chapters: [] };
      const gradeSets = examSets.filter(s => String(s.grade || '10') === gradeStr);

      // Structure storage for each chapter & week
      const chapterSetsMap: Record<string, { weeks: Record<string, any[]>; general: any[] }> = {};
      gradeDef.chapters.forEach(c => {
        const weekMap: Record<string, any[]> = {};
        c.weeks.forEach(w => {
          weekMap[w.id] = [];
        });
        chapterSetsMap[c.id] = {
          weeks: weekMap,
          general: []
        };
      });

      const uncategorizedSets: any[] = [];

      // Categorize each exam set exactly once
      gradeSets.forEach(s => {
        // Filter by Arena assignment status
        const rawRooms = setAssignments[s.id] || [];
        if (arenaFilter === 'ASSIGNED' && rawRooms.length === 0) return;
        if (arenaFilter === 'UNASSIGNED' && rawRooms.length > 0) return;

        // Filter by Search Query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = (s.title || '').toLowerCase().includes(q);
          const matchTopic = (s.topic || '').toLowerCase().includes(q);
          if (!matchTitle && !matchTopic) return;
        }

        const match = matchExamToCurriculum(s, gradeDef.chapters);
        if (match && chapterSetsMap[match.chapterId]) {
          const chapBucket = chapterSetsMap[match.chapterId];
          if (match.weekId && chapBucket.weeks[match.weekId]) {
            chapBucket.weeks[match.weekId].push(s);
          } else {
            chapBucket.general.push(s);
          }
        } else {
          uncategorizedSets.push(s);
        }
      });

      // Build the final chapter buckets
      const chapterBuckets = gradeDef.chapters.map(chapter => {
        const chapData = chapterSetsMap[chapter.id] || { weeks: {}, general: [] };
        const weekBuckets = chapter.weeks.map(week => {
          return {
            ...week,
            sets: chapData.weeks[week.id] || []
          };
        });

        const chapterGeneralSets = chapData.general || [];
        const totalQuestionsInChap = weekBuckets.reduce((acc, w) => acc + w.sets.reduce((cAcc, s) => cAcc + (s.question_count || 0), 0), 0)
          + chapterGeneralSets.reduce((cAcc, s) => cAcc + (s.question_count || 0), 0);

        const totalSetsInChap = weekBuckets.reduce((acc, w) => acc + w.sets.length, 0) + chapterGeneralSets.length;

        return {
          ...chapter,
          weeks: weekBuckets,
          generalSets: chapterGeneralSets,
          totalSets: totalSetsInChap,
          totalQuestions: totalQuestionsInChap
        };
      });

      const totalGradeSets = chapterBuckets.reduce((acc, c) => acc + c.totalSets, 0) + uncategorizedSets.length;
      const totalGradeQuestions = chapterBuckets.reduce((acc, c) => acc + c.totalQuestions, 0) + uncategorizedSets.reduce((a, s) => a + (s.question_count || 0), 0);

      return {
        grade: gradeStr,
        chapters: chapterBuckets,
        uncategorizedSets,
        totalSets: totalGradeSets,
        totalQuestions: totalGradeQuestions
      };
    });
  }, [selectedGrade, curriculumTree, examSets, setAssignments, arenaFilter, searchQuery]);

  const getFriendlyRoomName = (code: string) => {
    const room = arenaRooms.find(r => r.code === code);
    return room ? room.name : code;
  };

  return (
    <div className="flex-1 flex flex-col h-full animate-in fade-in duration-300 text-left relative">
      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed top-8 right-8 z-[2000] bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl font-black text-xs uppercase italic border border-slate-700 animate-in slide-in-from-top-4 flex items-center gap-2">
          <span>✨</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* HEADER BAR: Teacher Subject & Quick Actions */}
      <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border-4 border-slate-100 mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-3xl flex items-center justify-center text-3xl text-white shadow-lg shrink-0">
            📂
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h4 className="text-2xl font-black italic uppercase text-slate-800 tracking-tight">
                Phân Phối Chương Trình
              </h4>
              <span className="px-4 py-1 bg-blue-100 text-blue-700 text-[10px] font-black uppercase rounded-full border border-blue-200">
                Môn: {teacherSubject || 'Vật lý'}
              </span>
            </div>
            <p className="text-slate-400 font-bold text-xs uppercase italic tracking-wider mt-1">
              Quản trị toàn diện Thêm • Sửa • Xóa • Sắp xếp Chương & Tuần học
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <button
            onClick={expandAll}
            className="px-4 py-3 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-2xl font-black uppercase italic text-[10px] transition-all"
            title="Mở rộng tất cả các cấp"
          >
            Mở rộng ➕
          </button>
          <button
            onClick={collapseAll}
            className="px-4 py-3 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-2xl font-black uppercase italic text-[10px] transition-all"
            title="Thu gọn cây"
          >
            Thu gọn ➖
          </button>
          <button
            onClick={() => setShowResetConfirm(true)}
            className="px-4 py-3 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-2xl font-black uppercase italic text-[10px] transition-all"
            title="Khôi phục cây chương trình chuẩn GDPT"
          >
            ↺ Chuẩn GDPT
          </button>
          <button
            onClick={onRefresh}
            className={`w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-md border-2 border-emerald-100 ${isLoadingSets ? 'animate-spin' : ''}`}
            title="Làm mới dữ liệu"
          >
            🔄
          </button>
        </div>
      </div>

      {/* FILTER CONTROLS: Grade Tabs & Search & Arena Status */}
      <div className="bg-white p-5 rounded-[2rem] shadow-md border-2 border-slate-100 mb-8 flex flex-wrap items-center justify-between gap-4">
        {/* Grade Filter */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase text-slate-400 mr-2">Khối:</span>
          {(['10', '11', '12', 'ALL'] as const).map(g => (
            <button
              key={g}
              onClick={() => setSelectedGrade(g)}
              className={`px-6 py-2.5 rounded-2xl font-black text-xs uppercase italic transition-all shadow-sm ${
                selectedGrade === g
                  ? 'bg-blue-600 text-white shadow-blue-200 scale-105'
                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {g === 'ALL' ? 'Tất cả khối' : `Khối ${g}`}
            </button>
          ))}
        </div>

        {/* Arena Filter & Search */}
        <div className="flex items-center gap-3 flex-1 max-w-xl">
          <select
            value={arenaFilter}
            onChange={e => setArenaFilter(e.target.value as any)}
            className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-2.5 font-black text-xs text-slate-600 outline-none cursor-pointer"
          >
            <option value="ALL">Tất cả Arena</option>
            <option value="ASSIGNED">Đã gán Arena</option>
            <option value="UNASSIGNED">Chưa gán</option>
          </select>

          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Tìm kiếm đề thi, chương, tuần..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-xs outline-none focus:border-blue-300"
            />
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
          </div>
        </div>
      </div>

      {/* CURRICULUM TREE CONTAINER */}
      <div className="flex-1 space-y-8 overflow-y-auto no-scrollbar pb-24">
        {categorizedCurriculum.map(gradeBlock => {
          const isGradeExpanded = expandedNodes[`grade_${gradeBlock.grade}`] ?? true;

          return (
            <div
              key={gradeBlock.grade}
              className="bg-white rounded-[3rem] p-8 border-4 border-slate-100 shadow-xl"
            >
              {/* GRADE LEVEL HEADER */}
              <div className="flex items-center justify-between pb-6 border-b-2 border-slate-100 flex-wrap gap-4">
                <div
                  onClick={() => toggleNode(`grade_${gradeBlock.grade}`)}
                  className="flex items-center gap-4 cursor-pointer group"
                >
                  <span className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-lg group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                    {isGradeExpanded ? '▼' : '▶'}
                  </span>
                  <div>
                    <h3 className="text-3xl font-black text-slate-800 uppercase italic tracking-tight flex items-center gap-3">
                      Khối {gradeBlock.grade} - {teacherSubject || 'Vật lý'}
                    </h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] font-black text-blue-600 uppercase bg-blue-50 px-3 py-0.5 rounded-full">
                        {gradeBlock.totalSets} Bộ đề
                      </span>
                      <span className="text-[10px] font-black text-slate-400 uppercase">
                        {gradeBlock.totalQuestions} Câu hỏi tổng cộng
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setShowAddModal({ type: 'CHAPTER', grade: gradeBlock.grade });
                      setNewTitleInput('');
                    }}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-xs uppercase italic transition-all shadow-md flex items-center gap-1.5"
                  >
                    <span>➕</span> Thêm Chương Mới
                  </button>
                </div>
              </div>

              {/* CHAPTERS ACCORDION */}
              {isGradeExpanded && (
                <div className="pt-6 space-y-6">
                  {gradeBlock.chapters.map((chapter, chapIdx) => {
                    const isChapterExpanded = expandedNodes[chapter.id] ?? false;

                    return (
                      <div
                        key={chapter.id}
                        className="bg-slate-50/80 rounded-[2.5rem] border-2 border-slate-200/80 p-6 transition-all hover:border-blue-200"
                      >
                        {/* CHAPTER HEADER */}
                        <div className="flex items-center justify-between pb-4 border-b border-slate-200 flex-wrap gap-3">
                          <div
                            onClick={() => toggleNode(chapter.id)}
                            className="flex items-center gap-3 cursor-pointer group flex-1 min-w-[240px]"
                          >
                            <span className="w-9 h-9 rounded-xl bg-white text-slate-600 flex items-center justify-center font-black text-xs group-hover:bg-slate-900 group-hover:text-white transition-all shadow-sm border border-slate-200 shrink-0">
                              {isChapterExpanded ? '▼' : '▶'}
                            </span>
                            <div>
                              <h4 className="text-xl font-black text-slate-800 uppercase italic tracking-tight group-hover:text-blue-600 transition-colors">
                                {chapter.name}
                              </h4>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[9px] font-black text-slate-500 uppercase bg-white px-2.5 py-0.5 rounded-md border border-slate-200">
                                  {chapter.totalSets} Đề
                                </span>
                                <span className="text-[9px] font-bold text-slate-400 uppercase">
                                  {chapter.weeks.length} Tuần học
                                </span>
                                {chapter.custom && (
                                  <span className="text-[8px] font-black uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                    Tự tạo
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* CHAPTER ACTIONS: UP, DOWN, EDIT, DELETE, ADD WEEK */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Reorder Chapter */}
                            <button
                              onClick={() => handleMoveChapter(gradeBlock.grade, chapter.id, 'UP')}
                              disabled={chapIdx === 0}
                              className="w-8 h-8 rounded-xl bg-white hover:bg-slate-200 text-slate-600 disabled:opacity-30 flex items-center justify-center font-black text-xs border border-slate-200"
                              title="Chuyển chương lên trên"
                            >
                              ▲
                            </button>
                            <button
                              onClick={() => handleMoveChapter(gradeBlock.grade, chapter.id, 'DOWN')}
                              disabled={chapIdx === gradeBlock.chapters.length - 1}
                              className="w-8 h-8 rounded-xl bg-white hover:bg-slate-200 text-slate-600 disabled:opacity-30 flex items-center justify-center font-black text-xs border border-slate-200"
                              title="Chuyển chương xuống dưới"
                            >
                              ▼
                            </button>

                            {/* Rename Chapter */}
                            <button
                              onClick={() => {
                                setEditingNode({
                                  type: 'CHAPTER',
                                  grade: gradeBlock.grade,
                                  chapterId: chapter.id,
                                  currentName: chapter.name
                                });
                                setEditTitleInput(chapter.name);
                              }}
                              className="px-3 py-1.5 bg-white hover:bg-blue-600 hover:text-white text-slate-600 rounded-xl font-black text-[10px] uppercase italic transition-all border border-slate-200 flex items-center gap-1"
                              title="Sửa tên chương"
                            >
                              ✏️ Sửa
                            </button>

                            {/* Delete Chapter */}
                            <button
                              onClick={() => {
                                setDeletingNode({
                                  type: 'CHAPTER',
                                  grade: gradeBlock.grade,
                                  chapterId: chapter.id,
                                  name: chapter.name
                                });
                              }}
                              className="px-3 py-1.5 bg-red-50 hover:bg-red-600 hover:text-white text-red-500 rounded-xl font-black text-[10px] uppercase italic transition-all border border-red-100 flex items-center gap-1"
                              title="Xóa chương này"
                            >
                              🗑️ Xóa
                            </button>

                            {/* Add Week */}
                            <button
                              onClick={() => {
                                setShowAddModal({
                                  type: 'WEEK',
                                  grade: gradeBlock.grade,
                                  chapterId: chapter.id
                                });
                                setNewTitleInput('');
                              }}
                              className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-600 rounded-xl font-black text-[10px] uppercase italic transition-all border border-indigo-200 flex items-center gap-1"
                            >
                              ➕ Thêm Tuần
                            </button>
                          </div>
                        </div>

                        {/* WEEKS & EXAM SETS */}
                        {isChapterExpanded && (
                          <div className="pt-6 pl-2 md:pl-6 space-y-6">
                            {chapter.weeks.map((week, weekIdx) => {
                              const isWeekExpanded = expandedNodes[week.id] ?? true;

                              return (
                                <div
                                  key={week.id}
                                  className="bg-white rounded-3xl p-5 border-2 border-slate-100 shadow-sm"
                                >
                                  {/* WEEK HEADER */}
                                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
                                    <div
                                      onClick={() => toggleNode(week.id)}
                                      className="flex items-center gap-3 cursor-pointer group flex-1 min-w-[200px]"
                                    >
                                      <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center font-black text-[10px] group-hover:bg-blue-600 group-hover:text-white transition-all shrink-0">
                                        {isWeekExpanded ? '▼' : '▶'}
                                      </span>
                                      <span className="font-black uppercase italic text-sm text-slate-700 group-hover:text-blue-600 transition-colors">
                                        📅 {week.name}
                                      </span>
                                      <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                                        {week.sets.length} Đề
                                      </span>
                                    </div>

                                    {/* WEEK ACTIONS: UP, DOWN, EDIT, DELETE, ADD EXAM SET */}
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {/* Move Week Up / Down */}
                                      <button
                                        onClick={() => handleMoveWeek(gradeBlock.grade, chapter.id, week.id, 'UP')}
                                        disabled={weekIdx === 0}
                                        className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 disabled:opacity-30 flex items-center justify-center font-black text-[9px]"
                                        title="Chuyển tuần lên trên"
                                      >
                                        ▲
                                      </button>
                                      <button
                                        onClick={() => handleMoveWeek(gradeBlock.grade, chapter.id, week.id, 'DOWN')}
                                        disabled={weekIdx === chapter.weeks.length - 1}
                                        className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 disabled:opacity-30 flex items-center justify-center font-black text-[9px]"
                                        title="Chuyển tuần xuống dưới"
                                      >
                                        ▼
                                      </button>

                                      {/* Rename Week */}
                                      <button
                                        onClick={() => {
                                          setEditingNode({
                                            type: 'WEEK',
                                            grade: gradeBlock.grade,
                                            chapterId: chapter.id,
                                            weekId: week.id,
                                            currentName: week.name
                                          });
                                          setEditTitleInput(week.name);
                                        }}
                                        className="px-2.5 py-1 bg-slate-50 hover:bg-blue-600 hover:text-white text-slate-600 rounded-lg font-black text-[9px] uppercase italic transition-all border border-slate-200"
                                        title="Sửa tên tuần"
                                      >
                                        ✏️ Sửa
                                      </button>

                                      {/* Delete Week */}
                                      <button
                                        onClick={() => {
                                          setDeletingNode({
                                            type: 'WEEK',
                                            grade: gradeBlock.grade,
                                            chapterId: chapter.id,
                                            weekId: week.id,
                                            name: week.name
                                          });
                                        }}
                                        className="px-2.5 py-1 bg-red-50 hover:bg-red-600 hover:text-white text-red-500 rounded-lg font-black text-[9px] uppercase italic transition-all border border-red-100"
                                        title="Xóa tuần này"
                                      >
                                        🗑️ Xóa
                                      </button>

                                      {/* Create exam set in this week */}
                                      <button
                                        onClick={() => {
                                          if (onAddNewSetForTopic) {
                                            onAddNewSetForTopic(gradeBlock.grade, chapter.name, week.name);
                                          } else {
                                            onEdit('', '');
                                          }
                                        }}
                                        className="px-3 py-1 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-600 rounded-xl font-black text-[9px] uppercase italic transition-all border border-emerald-200 flex items-center gap-1"
                                        title="Tạo bộ đề mới trong tuần này"
                                      >
                                        <span>➕</span> Tạo đề mới
                                      </button>
                                    </div>
                                  </div>

                                  {/* EXAM SETS UNDER WEEK */}
                                  {isWeekExpanded && (
                                    <div className="pt-3 space-y-2">
                                      {week.sets.length > 0 ? (
                                        week.sets.map((set, setIdx) => {
                                          const rawRooms = setAssignments[set.id] || [];
                                          const uniqueDisplayRooms = Array.from(
                                            new Set(rawRooms.map(code => getFriendlyRoomName(code)).filter(Boolean))
                                          ) as string[];

                                          return (
                                            <div
                                              key={set.id}
                                              className="p-4 bg-slate-50/80 hover:bg-blue-50/40 rounded-2xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all group"
                                            >
                                              <div className="flex items-center gap-4 flex-1">
                                                <span className="w-8 h-8 rounded-full bg-blue-600 text-white font-black italic text-xs flex items-center justify-center shrink-0 shadow-sm">
                                                  {setIdx + 1}
                                                </span>
                                                <div className="flex-1">
                                                  <div className="flex items-center gap-2">
                                                    <h5 className="font-black text-slate-800 uppercase italic text-sm group-hover:text-blue-600 transition-colors">
                                                      {set.title}
                                                    </h5>
                                                    <button
                                                      onClick={() => {
                                                        setRenameTarget({ id: set.id, title: set.title });
                                                        setNewName(set.title);
                                                      }}
                                                      className="text-slate-400 hover:text-blue-600 text-xs"
                                                      title="Đổi tên đề thi"
                                                    >
                                                      ✏️
                                                    </button>
                                                  </div>
                                                  <div className="flex flex-wrap items-center gap-2 mt-1">
                                                    <span className="text-[8px] font-black uppercase text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-200">
                                                      {set.round_count || 1} Vòng • {set.question_count || 0} Câu
                                                    </span>
                                                    {uniqueDisplayRooms.length > 0 ? (
                                                      uniqueDisplayRooms.map(rName => (
                                                        <span
                                                          key={rName}
                                                          className="text-[8px] font-black uppercase text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded"
                                                        >
                                                          ✓ {rName}
                                                        </span>
                                                      ))
                                                    ) : (
                                                      <span className="text-[8px] font-bold italic text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                                                        Chưa gán Arena
                                                      </span>
                                                    )}
                                                  </div>
                                                </div>
                                              </div>

                                              {/* ACTION BUTTONS */}
                                              <div className="flex items-center gap-2 shrink-0">
                                                <button
                                                  onClick={() => handlePreviewSet(set.id, set.title)}
                                                  className="px-3 py-1.5 bg-white hover:bg-slate-900 hover:text-white text-slate-600 rounded-xl font-black text-[9px] uppercase italic transition-all border border-slate-200 flex items-center gap-1"
                                                >
                                                  👁️ Xem
                                                </button>
                                                <button
                                                  onClick={() => onEdit(set.id, set.title)}
                                                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-600 rounded-xl font-black text-[9px] uppercase italic transition-all border border-blue-200 flex items-center gap-1"
                                                >
                                                  ✏️ Sửa
                                                </button>
                                                <button
                                                  onClick={() =>
                                                    setDistributeTarget({
                                                      id: set.id,
                                                      title: set.title,
                                                      assignedRooms: rawRooms
                                                    })
                                                  }
                                                  className="px-3 py-1.5 bg-amber-50 hover:bg-amber-600 hover:text-white text-amber-600 rounded-xl font-black text-[9px] uppercase italic transition-all border border-amber-200 flex items-center gap-1"
                                                >
                                                  🎯 Gán Arena
                                                </button>
                                                <button
                                                  onClick={() => handleViewLeaderboard(set.id, set.title)}
                                                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-600 rounded-xl font-black text-[9px] uppercase italic transition-all border border-emerald-200 flex items-center gap-1"
                                                >
                                                  📊 Hạng
                                                </button>
                                                <button
                                                  onClick={() => {
                                                    setMoveTargetSet(set);
                                                    setTargetChapter(chapter.name);
                                                    setTargetWeek(week.name);
                                                  }}
                                                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-300 text-slate-600 rounded-xl font-black text-[9px] uppercase italic"
                                                  title="Chuyển sang Chương / Tuần khác"
                                                >
                                                  🔄
                                                </button>
                                                <button
                                                  onClick={() =>
                                                    setDeleteTarget({ id: set.id, title: set.title })
                                                  }
                                                  className="px-2.5 py-1.5 bg-red-50 hover:bg-red-600 hover:text-white text-red-500 rounded-xl font-black text-[9px] uppercase italic border border-red-100"
                                                  title="Xóa đề này"
                                                >
                                                  ✕
                                                </button>
                                              </div>
                                            </div>
                                          );
                                        })
                                      ) : (
                                        <div className="py-4 text-center text-slate-300 font-bold uppercase italic text-xs">
                                          Chưa có đề thi nào trong tuần này. Bấm "+ Tạo đề mới" để bắt đầu.
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            {/* GENERAL SETS IN THIS CHAPTER */}
                            {chapter.generalSets && chapter.generalSets.length > 0 && (
                              <div className="bg-white rounded-3xl p-5 border-2 border-dashed border-slate-200 shadow-sm">
                                <div className="font-black uppercase italic text-xs text-slate-600 mb-3">
                                  📌 Các đề khác trong {chapter.name} ({chapter.generalSets.length} đề)
                                </div>
                                <div className="space-y-2">
                                  {chapter.generalSets.map(set => {
                                    return (
                                      <div
                                        key={set.id}
                                        className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3"
                                      >
                                        <div>
                                          <div className="font-black text-slate-800 text-xs">{set.title}</div>
                                          <div className="text-[8px] font-bold text-slate-400 uppercase">
                                            Chủ đề: {set.topic} • {set.question_count || 0} câu
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <button
                                            onClick={() => onEdit(set.id, set.title)}
                                            className="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-black uppercase"
                                          >
                                            Sửa
                                          </button>
                                          <button
                                            onClick={() => {
                                              setMoveTargetSet(set);
                                              setTargetChapter(chapter.name);
                                            }}
                                            className="px-2.5 py-1 bg-slate-200 text-slate-700 rounded-lg text-[9px] font-black uppercase"
                                          >
                                            Phân vào Tuần
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* UNCATEGORIZED / CUSTOM TOPIC SETS */}
                  {gradeBlock.uncategorizedSets.length > 0 && (
                    <div className="bg-amber-50/50 rounded-[2.5rem] border-2 border-amber-200 p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h4 className="text-lg font-black text-amber-900 uppercase italic">
                            📁 Đề thi tự chọn / Chưa phân phối ({gradeBlock.uncategorizedSets.length} đề)
                          </h4>
                          <p className="text-[10px] text-amber-700 font-bold uppercase italic mt-0.5">
                            Các đề chưa được gán vào chương cụ thể của Khối {gradeBlock.grade}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {gradeBlock.uncategorizedSets.map(set => (
                          <div
                            key={set.id}
                            className="bg-white p-4 rounded-2xl border border-amber-100 shadow-sm flex items-center justify-between gap-3"
                          >
                            <div className="flex-1">
                              <div className="font-black text-slate-800 text-xs truncate">{set.title}</div>
                              <div className="text-[8px] font-black text-amber-600 uppercase mt-0.5">
                                Chủ đề: {set.topic || 'Khác'}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => onEdit(set.id, set.title)}
                                className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-black uppercase"
                              >
                                Sửa
                              </button>
                              <button
                                onClick={() => {
                                  setMoveTargetSet(set);
                                  setTargetChapter(gradeBlock.chapters[0]?.name || '');
                                }}
                                className="px-3 py-1 bg-amber-600 text-white rounded-lg text-[9px] font-black uppercase shadow-sm"
                              >
                                Xếp vào Chương
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* MODAL: PREVIEW EXAM SET DETAILS */}
      {previewSet && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setPreviewSet(null)}></div>
          <div className="bg-white rounded-[3.5rem] p-8 shadow-2xl max-w-3xl w-full relative z-10 border-4 border-slate-100 max-h-[90vh] flex flex-col animate-in zoom-in">
            <header className="flex justify-between items-center pb-4 border-b-2 border-slate-100">
              <div>
                <span className="px-3 py-1 bg-blue-100 text-blue-700 font-black text-[9px] uppercase rounded-full">
                  Khối {previewSet.grade} • {previewSet.topic}
                </span>
                <h3 className="text-2xl font-black text-slate-800 uppercase italic mt-1">{previewSet.title}</h3>
              </div>
              <button onClick={() => setPreviewSet(null)} className="w-10 h-10 bg-slate-100 text-slate-500 rounded-full font-black text-sm hover:bg-slate-200">
                ✕
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar">
              {previewSet.rounds.map((r, rIdx) => (
                <div key={rIdx} className="bg-slate-50 p-6 rounded-3xl border-2 border-slate-100">
                  <div className="font-black text-slate-800 uppercase italic text-sm mb-4">
                    🏁 VÒNG {r.number || rIdx + 1} {r.description ? `(${r.description})` : ''}
                  </div>
                  <div className="space-y-4">
                    {(r.problems || []).map((prob, pIdx) => (
                      <div key={prob.id || pIdx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="px-2 py-0.5 bg-blue-600 text-white font-black text-[8px] uppercase rounded">
                            Câu {pIdx + 1} [{prob.type}]
                          </span>
                          <span className="font-black text-slate-700 text-xs">{prob.title}</span>
                        </div>
                        <div className="text-slate-600 font-medium text-sm mb-3">
                          <LatexRenderer content={prob.content || ''} />
                        </div>
                        {prob.imageUrl && (
                          <img src={prob.imageUrl} alt="Hình" className="w-48 h-28 object-cover rounded-xl mb-3 border" />
                        )}
                        {prob.options && prob.options.length > 0 && (
                          <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-700 bg-slate-50 p-3 rounded-xl">
                            {prob.options.map((opt, oIdx) => (
                              <div key={oIdx} className="flex items-center gap-2">
                                <span className="font-black text-blue-600">{String.fromCharCode(65 + oIdx)}.</span>
                                <span>{opt}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 text-[10px] font-black text-emerald-600">
                          Đáp án đúng: {prob.correctAnswer}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <footer className="pt-4 border-t-2 border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  const s = previewSet;
                  setPreviewSet(null);
                  onEdit(s.id, s.title);
                }}
                className="px-6 py-3 bg-blue-600 text-white font-black uppercase italic rounded-2xl text-xs shadow-lg"
              >
                Chuyển sang Soạn Thảo ✏️
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* MODAL: ADD CHAPTER OR WEEK */}
      {showAddModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowAddModal(null)}></div>
          <div className="bg-white rounded-[3rem] p-8 shadow-2xl max-w-md w-full relative z-10 border-4 border-slate-100 animate-in zoom-in">
            <h3 className="text-2xl font-black text-slate-800 uppercase italic mb-2 text-center">
              {showAddModal.type === 'CHAPTER' ? '➕ Thêm Chương Mới' : '➕ Thêm Tuần / Chuyên Đề'}
            </h3>
            <p className="text-slate-400 font-bold text-center mb-6 text-xs uppercase">
              Khối {showAddModal.grade} - {teacherSubject || 'Vật lý'}
            </p>

            <input
              type="text"
              placeholder={showAddModal.type === 'CHAPTER' ? 'Ví dụ: Chương 7: Cảm ứng điện từ' : 'Ví dụ: Đề ôn tuần 14: Hiện tượng tự cảm'}
              value={newTitleInput}
              onChange={e => setNewTitleInput(e.target.value)}
              className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold mb-6 outline-none focus:border-blue-300"
              autoFocus
            />

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowAddModal(null)}
                className="py-3.5 bg-slate-100 text-slate-500 font-black rounded-xl uppercase italic text-xs"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmAdd}
                disabled={!newTitleInput.trim()}
                className="py-3.5 bg-blue-600 text-white font-black rounded-xl uppercase italic text-xs shadow-lg disabled:opacity-50"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT CHAPTER OR WEEK */}
      {editingNode && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setEditingNode(null)}></div>
          <div className="bg-white rounded-[3rem] p-8 shadow-2xl max-w-md w-full relative z-10 border-4 border-slate-100 animate-in zoom-in">
            <h3 className="text-2xl font-black text-slate-800 uppercase italic mb-2 text-center">
              ✏️ Sửa Tên {editingNode.type === 'CHAPTER' ? 'Chương' : 'Tuần'}
            </h3>
            <p className="text-slate-400 font-bold text-center mb-6 text-xs uppercase">
              Khối {editingNode.grade}
            </p>

            <input
              type="text"
              value={editTitleInput}
              onChange={e => setEditTitleInput(e.target.value)}
              className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold mb-6 outline-none focus:border-blue-300"
              autoFocus
            />

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setEditingNode(null)}
                className="py-3.5 bg-slate-100 text-slate-500 font-black rounded-xl uppercase italic text-xs"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmEdit}
                disabled={!editTitleInput.trim()}
                className="py-3.5 bg-blue-600 text-white font-black rounded-xl uppercase italic text-xs shadow-lg disabled:opacity-50"
              >
                Lưu Thay Đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM DELETE CHAPTER OR WEEK */}
      {deletingNode && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setDeletingNode(null)}></div>
          <div className="bg-white rounded-[3rem] p-8 shadow-2xl max-w-md w-full relative z-10 border-4 border-slate-100 animate-in zoom-in text-center">
            <div className="text-5xl mb-3">🗑️</div>
            <h3 className="text-2xl font-black text-slate-800 uppercase italic mb-2">
              Xóa {deletingNode.type === 'CHAPTER' ? 'Chương' : 'Tuần'} này?
            </h3>
            <p className="font-bold text-slate-700 text-sm mb-3">
              "{deletingNode.name}"
            </p>
            <p className="text-xs text-slate-400 mb-6">
              {deletingNode.type === 'CHAPTER' 
                ? 'Lưu ý: Các đề thi thuộc chương này sẽ không bị xóa mà được chuyển sang nhóm "Đề tự chọn / Chưa phân phối".'
                : 'Lưu ý: Các đề thi thuộc tuần này sẽ được giữ lại trong chương.'}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setDeletingNode(null)}
                className="py-3.5 bg-slate-100 text-slate-600 font-black rounded-xl uppercase italic text-xs"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleConfirmDelete}
                className="py-3.5 bg-red-600 text-white font-black rounded-xl uppercase italic text-xs shadow-lg shadow-red-200"
              >
                Xác nhận Xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RESET TO DEFAULT CONFIRMATION */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowResetConfirm(false)}></div>
          <div className="bg-white rounded-[3rem] p-8 shadow-2xl max-w-md w-full relative z-10 border-4 border-slate-100 animate-in zoom-in text-center">
            <div className="text-5xl mb-3">↺</div>
            <h3 className="text-2xl font-black text-slate-800 uppercase italic mb-2">
              Khôi phục Phân Phối Chuẩn?
            </h3>
            <p className="text-xs text-slate-500 mb-6">
              Thao tác này sẽ đặt lại cây cấu trúc Khối 10, 11, 12 về chuẩn GDPT 2018. Tất cả đề thi của bạn vẫn được lưu giữ an toàn.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="py-3.5 bg-slate-100 text-slate-600 font-black rounded-xl uppercase italic text-xs"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleResetToDefault}
                className="py-3.5 bg-amber-600 text-white font-black rounded-xl uppercase italic text-xs shadow-lg shadow-amber-200"
              >
                Khôi phục ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MOVE SET TO CHAPTER/WEEK */}
      {moveTargetSet && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setMoveTargetSet(null)}></div>
          <div className="bg-white rounded-[3rem] p-8 shadow-2xl max-w-lg w-full relative z-10 border-4 border-slate-100 animate-in zoom-in">
            <h3 className="text-2xl font-black text-slate-800 uppercase italic mb-2 text-center">
              Xếp Vị Trí Đề Thi
            </h3>
            <p className="text-blue-600 font-black text-center mb-6 text-xs uppercase">
              {moveTargetSet.title}
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase italic block mb-1">Chương</label>
                <input
                  type="text"
                  value={targetChapter}
                  onChange={e => setTargetChapter(e.target.value)}
                  placeholder="Nhập tên chương..."
                  className="w-full p-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl font-bold text-xs outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase italic block mb-1">Tuần / Chuyên đề con</label>
                <input
                  type="text"
                  value={targetWeek}
                  onChange={e => setTargetWeek(e.target.value)}
                  placeholder="Ví dụ: Đề ôn tuần 1..."
                  className="w-full p-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl font-bold text-xs outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMoveTargetSet(null)}
                className="py-3.5 bg-slate-100 text-slate-500 font-black rounded-xl uppercase italic text-xs"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmMoveSet}
                className="py-3.5 bg-blue-600 text-white font-black rounded-xl uppercase italic text-xs shadow-lg"
              >
                Lưu Vị Trí
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE EXAM SET MODAL */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Xóa bộ đề?"
        message={`Bạn có chắc muốn xóa vĩnh viễn bộ đề "${deleteTarget?.title}"?`}
        onConfirm={() => {
          if (deleteTarget) onDeleteSet(deleteTarget.id, deleteTarget.title);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
        isDestructive={true}
      />

      {/* RENAME EXAM SET MODAL */}
      {renameTarget && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setRenameTarget(null)}></div>
          <div className="bg-white rounded-[3rem] p-8 shadow-2xl max-w-md w-full relative z-10 border-4 border-slate-100 animate-in zoom-in">
            <h3 className="text-2xl font-black text-slate-800 uppercase italic mb-6 text-center">Đổi tên bộ đề</h3>
            <input
              type="text"
              className="w-full p-5 bg-slate-50 border-4 border-slate-100 rounded-2xl font-bold mb-6 outline-none focus:border-blue-300"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              autoFocus
            />
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setRenameTarget(null)} className="py-3.5 bg-slate-100 text-slate-500 font-black rounded-xl uppercase italic text-xs">Hủy</button>
              <button onClick={handleRename} className="py-3.5 bg-blue-600 text-white font-black rounded-xl uppercase italic text-xs shadow-lg">Lưu</button>
            </div>
          </div>
        </div>
      )}

      {/* DISTRIBUTE TO ARENA ROOM MODAL */}
      {distributeTarget && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setDistributeTarget(null)}></div>
          <div className="bg-white rounded-[4rem] p-10 shadow-2xl max-w-2xl w-full relative z-10 border-4 border-slate-100 animate-in slide-in-from-bottom-8">
            <h3 className="text-3xl font-black text-slate-800 uppercase italic mb-2 text-center">Gán Đề Vào Arena</h3>
            <p className="text-slate-400 font-bold text-center mb-8 uppercase text-xs italic">
              Chọn các phòng thi để triển khai bộ đề "{distributeTarget.title}":
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 max-h-[50vh] overflow-y-auto no-scrollbar p-1">
              {arenaRooms.map(room => {
                const isAssigned = distributeTarget.assignedRooms.includes(room.code);
                return (
                  <button
                    key={room.id}
                    onClick={() => handleToggleRoom(room.code)}
                    disabled={isToggling}
                    className={`p-5 rounded-[2rem] border-4 transition-all text-left relative flex flex-col items-center justify-center ${
                      isAssigned
                        ? 'bg-blue-600 border-blue-400 text-white shadow-lg'
                        : 'bg-slate-50 border-slate-100 text-slate-800 hover:border-blue-200'
                    } ${isToggling ? 'opacity-70' : ''}`}
                  >
                    {isAssigned && (
                      <div className="absolute top-3 right-3 bg-white text-blue-600 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shadow-md">
                        ✓
                      </div>
                    )}
                    <div className="text-3xl mb-2">{room.emoji}</div>
                    <div className="font-black text-xs uppercase italic text-center">{room.name}</div>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => {
                setDistributeTarget(null);
                onRefresh();
              }}
              className="w-full py-4 bg-slate-900 text-white font-black rounded-2xl uppercase italic text-sm"
            >
              Hoàn tất
            </button>
          </div>
        </div>
      )}

      {/* LEADERBOARD MODAL */}
      {leaderboardTarget && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setLeaderboardTarget(null)}></div>
          <div className="bg-white rounded-[4rem] p-8 shadow-2xl max-w-2xl w-full relative z-10 border-4 border-slate-100 animate-in zoom-in overflow-y-auto no-scrollbar max-h-[90vh]">
            <div className="text-center mb-6">
              <div className="text-5xl mb-2">📊</div>
              <h3 className="text-2xl font-black text-slate-800 uppercase italic">Bảng xếp hạng Arena</h3>
              <p className="text-blue-600 font-black uppercase text-xs italic mt-1">{leaderboardTarget.title}</p>
            </div>

            <div className="bg-slate-50 rounded-3xl p-6 border-2 border-slate-100 min-h-[250px]">
              {isLoadingLeaderboard ? (
                <div className="py-16 flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-[10px] font-black text-slate-400 uppercase italic">Đang tải xếp hạng...</span>
                </div>
              ) : leaderboardData.length > 0 ? (
                <div className="space-y-3">
                  {leaderboardData.map((entry, idx) => (
                    <div key={entry.id} className="flex justify-between items-center p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center font-black italic text-xs ${
                          idx === 0 ? 'bg-amber-400 text-white' : idx === 1 ? 'bg-slate-300 text-white' : idx === 2 ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-400'
                        }`}>
                          {idx + 1}
                        </span>
                        <div>
                          <div className="font-black uppercase italic text-xs text-slate-800">{entry.player_name}</div>
                          <div className="text-[8px] font-bold text-slate-400">{new Date(entry.created_at).toLocaleDateString('vi-VN')}</div>
                        </div>
                      </div>
                      <div className="text-xl font-black text-blue-600 italic">{entry.score}đ</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-16 text-center text-slate-300 font-black uppercase italic text-xs">
                  Chưa có dữ liệu thi đấu cho đề này.
                </div>
              )}
            </div>

            <button onClick={() => setLeaderboardTarget(null)} className="w-full py-4 bg-slate-900 text-white font-black rounded-2xl uppercase italic text-xs mt-6">
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CurriculumPanel;
