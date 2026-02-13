
import { createClient } from '@supabase/supabase-js';
import { PhysicsProblem, QuestionType, Round, Teacher, Difficulty, DisplayChallenge, InteractiveMechanic } from '../types';

const supabaseUrl = 'https://ktottoplusantmadclpg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0b3R0b3BsdXNhbnRtYWRjbHBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMDM1MzYsImV4cCI6MjA4Mzg3OTUzNn0.VAPgXcqd24N1Cguv99hq4bVkstxm3jTObQCHC13FgB8';

export const supabase = createClient(supabaseUrl, supabaseKey);

// --- VISITOR TRACKING ---
export const getVisitorCount = async (): Promise<number> => {
  try {
    const { data, error } = await supabase.from('app_stats').select('value').eq('key', 'visitor_count').maybeSingle();
    if (error) return 0;
    return data?.value || 0;
  } catch (e) { return 0; }
};

export const incrementVisitorCount = async (): Promise<number> => {
  try {
    const current = await getVisitorCount();
    const newValue = current + 1;
    const { error } = await supabase.from('app_stats').update({ value: newValue }).eq('key', 'visitor_count');
    if (error) {
      await supabase.from('app_stats').insert([{ key: 'visitor_count', value: 1 }]);
      return 1;
    }
    return newValue;
  } catch (e) { return 0; }
};

export const loginTeacher = async (maGV: string, pass: string): Promise<{ teacher: Teacher | null, error: string | null }> => {
  const cleanMaGV = maGV.trim();
  const cleanPass = pass.trim();
  try {
    const { data, error } = await supabase.from('giaovien').select('*').ilike('magv', cleanMaGV).maybeSingle();
    if (error) return { teacher: null, error: `Lỗi CSDL: ${error.message}` };
    if (!data) return { teacher: null, error: `Không tìm thấy giáo viên mã: ${cleanMaGV}` };
    
    const dbPass = data.pass || data.PASS || "";
    if (String(dbPass).trim() !== cleanPass) return { teacher: null, error: "Mật khẩu không chính xác!" };
    
    return { 
      teacher: { 
        id: data.id, 
        magv: data.magv || data.maGV || cleanMaGV, 
        tengv: data.tengv || data.TenGV, 
        monday: data.monday || data.MonDay || "Vật lý", 
        pass: dbPass,
        role: (data.role || 'TEACHER').toUpperCase() as 'ADMIN' | 'TEACHER'
      }, 
      error: null 
    };
  } catch (err: any) { return { teacher: null, error: "Lỗi hệ thống: " + err.message }; }
};

export const fetchTeacherByMaGV = async (maGV: string): Promise<Teacher | null> => {
  let { data } = await supabase.from('giaovien').select('*').ilike('magv', maGV.trim()).maybeSingle();
  if (!data) return null;
  return { 
    id: data.id, 
    magv: data.magv || data.maGV, 
    tengv: data.tengv || data.TenGV, 
    monday: data.monday || data.MonDay, 
    pass: data.pass || data.PASS,
    role: (data.role || 'TEACHER').toUpperCase() as 'ADMIN' | 'TEACHER'
  } as Teacher;
};

const inferMetadata = (set: any) => {
    if (!set) return null;
    let grade = set.grade || set.GRADE;
    let subject = set.subject || set.SUBJECT || set.monday || set.MonDay;
    let topic = set.topic || set.TOPIC;
    let title = set.title || set.TITLE;
    let rCount = set.round_count || set.roundCount;
    let qCount = set.question_count || set.questionCount;
    if (set.data && Array.isArray(set.data)) {
        if (!rCount) rCount = set.data.length;
        if (!qCount) {
            let count = 0;
            set.data.forEach((r: any) => { count += (r.problems?.length || 0); });
            qCount = count;
        }
    }
    return {
        ...set,
        title: title || `Bộ đề mới`,
        topic: topic || "Chưa phân loại",
        grade: String(grade || "10"),
        subject: subject || "Vật lý",
        round_count: rCount || 0,
        question_count: qCount || 0
    };
};

export const fetchAllExamSets = async (teacherId: string) => {
  const { data, error } = await supabase.from('exam_sets').select('*').eq('teacher_id', teacherId).order('id', { ascending: false });
  if (error) throw error;
  return (data || []).map(set => inferMetadata(set));
};

export const saveExamSet = async (teacherId: string, title: string, rounds: Round[], topic: string, grade: string, subject: string) => {
  const payload: any = { teacher_id: teacherId, title: title, topic: topic, data: rounds, grade: grade };
  if (subject) payload.subject = subject;
  const { data, error } = await supabase.from('exam_sets').insert([payload]).select();
  if (error) throw new Error(`LỖI ${error.code}: ${error.message}`);
  return data[0].id;
};

export const updateExamSet = async (setId: string, title: string, rounds: Round[], topic: string, grade: string, teacherId: string) => {
  const payload: any = { title, topic, data: rounds, grade };
  const { error } = await supabase.from('exam_sets').update(payload).eq('id', setId);
  if (error) throw error;
  return setId;
};

export const deleteExamSet = async (setId: string) => {
  const { error } = await supabase.from('exam_sets').delete().eq('id', setId);
  if (error) throw error;
  return true;
};

export const fetchSetData = async (setId: string): Promise<{ rounds: Round[], topic: string, grade: string, created_at: string, title: string, subject: string }> => {
  const { data, error } = await supabase.from('exam_sets').select('*').eq('id', setId).single();
  if (error) throw error;
  const processed = inferMetadata(data);
  return { 
    rounds: processed.data || [], 
    topic: processed.topic, 
    grade: processed.grade,
    title: processed.title,
    subject: processed.subject,
    created_at: processed.created_at || new Date().toISOString()
  };
};

export const assignSetToRoom = async (teacherId: string, roomCode: string, setId: string) => {
  const { error } = await supabase.from('room_assignments').upsert({ 
    teacher_id: teacherId, 
    room_code: roomCode, 
    set_id: setId, 
    assigned_at: new Date().toISOString() 
  }, { onConflict: 'teacher_id,room_code,set_id' });
  if (error) throw error;
  return true;
};

export const getSetAssignments = async (teacherId: string, setId: string): Promise<string[]> => {
  const { data, error } = await supabase.from('room_assignments').select('room_code').eq('teacher_id', teacherId).eq('set_id', setId);
  if (error || !data) return [];
  return data.map(row => row.room_code);
};

export const getRoomAssignmentsWithMeta = async (teacherId: string, roomCode: string): Promise<any[]> => {
  const { data: assignments, error: assignError } = await supabase.from('room_assignments').select('set_id, assigned_at').eq('teacher_id', teacherId).eq('room_code', roomCode);
  if (assignError || !assignments || assignments.length === 0) return [];
  const setIds = assignments.map(a => a.set_id);
  const { data: sets, error: setsError } = await supabase.from('exam_sets').select('*').eq('teacher_id', teacherId).in('id', setIds);
  if (setsError || !sets) return [];
  return assignments.map(assign => {
      const setRaw = sets.find(s => s.id === assign.set_id);
      if (!setRaw) return null;
      return { ...inferMetadata(setRaw), assigned_at: assign.assigned_at };
  }).filter(Boolean);
};

export const removeRoomAssignment = async (teacherId: string, roomCode: string, setId: string) => {
  // Logic dọn dẹp triệt để mã phòng GV
  if (roomCode.includes('TEACHER')) {
    await supabase.from('room_assignments').delete().match({ teacher_id: teacherId, room_code: 'TEACHER_LIVE', set_id: setId });
    await supabase.from('room_assignments').delete().match({ teacher_id: teacherId, room_code: 'TEACHER_ROOM', set_id: setId });
  } else {
    await supabase.from('room_assignments').delete().match({ teacher_id: teacherId, room_code: roomCode, set_id: setId });
  }
  return true;
};

export const updateExamSetTitle = async (setId: string, newTitle: string) => {
  const { error } = await supabase.from('exam_sets').update({ title: newTitle }).eq('id', setId);
  if (error) throw error;
  return true;
};

export const fetchQuestionsLibrary = async (teacherId: string, grade?: string, type?: QuestionType): Promise<PhysicsProblem[]> => {
  let query = supabase.from('exam_sets').select('data, topic').eq('teacher_id', teacherId).order('id', { ascending: false }).limit(10);
  if (grade) query = query.eq('grade', grade);
  const { data, error } = await query;
  if (error) throw error;
  const library: PhysicsProblem[] = [];
  const seenContent = new Set<string>();
  data.forEach(set => {
    const rounds = set.data || [];
    rounds.forEach((r: any) => {
      const probs = r.problems || [];
      probs.forEach((p: any) => {
        const key = `${p.type}_${p.content}`;
        if ((!type || p.type === type) && !seenContent.has(key)) {
          library.push({ ...p, topic: set.topic });
          seenContent.add(key);
        }
      });
    });
  });
  return library;
};

export const uploadQuestionImage = async (file: File): Promise<string> => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
  const filePath = `questions/${fileName}`;
  const { error: uploadError } = await supabase.storage.from('forum_attachments').upload(filePath, file);
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from('forum_attachments').getPublicUrl(filePath);
  return data.publicUrl;
};

export const getAllTeachers = async (): Promise<Teacher[]> => {
  const { data, error } = await supabase.from('giaovien').select('*').order('tengv', { ascending: true });
  if (error) throw error;
  return (data || []).map(d => ({
    id: d.id,
    magv: d.magv || d.maGV,
    tengv: d.tengv || d.TenGV,
    monday: d.monday || d.MonDay,
    pass: d.pass || d.PASS,
    role: (d.role || 'TEACHER').toUpperCase() as 'ADMIN' | 'TEACHER'
  }));
};

export const createTeacher = async (teacher: Omit<Teacher, 'id'>) => {
  const { data, error } = await supabase.from('giaovien').insert([{
    magv: teacher.magv, tengv: teacher.tengv, monday: teacher.monday, pass: teacher.pass, role: teacher.role
  }]).select().single();
  if (error) throw error;
  return data;
};

export const updateTeacher = async (id: string, updates: Partial<Teacher>) => {
  const { error } = await supabase.from('giaovien').update(updates).eq('id', id);
  if (error) throw error;
  return true;
};

export const deleteTeacher = async (id: string) => {
  const { error } = await supabase.from('giaovien').delete().eq('id', id);
  if (error) throw error;
  return true;
};

export const createSampleExamSet = async (teacherId: string) => {
  const sampleRounds: Round[] = [
    {
      number: 1,
      description: "Vòng khởi động!",
      problems: [
        {
          id: 's1', title: 'Năng lượng', content: 'Tính thế năng của vật khối lượng $m = 2kg$ ở độ cao $h = 5m$. Lấy $g = 10 m/s^2$.',
          difficulty: Difficulty.EASY, type: QuestionType.SHORT_ANSWER, challenge: DisplayChallenge.NORMAL,
          correctAnswer: '100', topic: 'Năng lượng', explanation: '$W_t = mgh = 2.10.5 = 100J$', grade: '10'
        }
      ]
    }
  ];
  return await saveExamSet(teacherId, "Bộ đề mẫu: Năng lượng", sampleRounds, "Cơ học", "10", "Vật lý");
};
