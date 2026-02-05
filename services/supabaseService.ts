
import { createClient } from '@supabase/supabase-js';
import { PhysicsProblem, QuestionType, Round, Teacher } from '../types';

const supabaseUrl = 'https://ktottoplusantmadclpg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0b3R0b3BsdXNhbnRtYWRjbHBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMDM1MzYsImV4cCI6MjA4Mzg3OTUzNn0.VAPgXcqd24N1Cguv99hq4bVkstxm3jTObQCHC13FgB8';

export const supabase = createClient(supabaseUrl, supabaseKey);

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
        monday: data.monday || data.MonDay, 
        pass: dbPass 
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
    pass: data.pass || data.PASS 
  } as Teacher;
};

export const fetchAllExamSets = async (teacherId: string, maGV?: string) => {
  const { data, error } = await supabase
    .from('exam_sets')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  
  return data.map((set: any) => {
    const rounds = set.data || [];
    let qCount = 0;
    rounds.forEach((r: any) => { qCount += (r.problems?.length || 0); });
    return { 
      ...set, 
      question_count: qCount, 
      round_count: rounds.length, 
      topic: set.topic || 'Chưa phân loại', 
      grade: set.grade || '10',
      is_legacy: false 
    };
  });
};

export const saveExamSet = async (teacherId: string, title: string, rounds: Round[], topic: string, grade: string, subject: string) => {
  const { data, error } = await supabase.from('exam_sets').insert([{ teacher_id: teacherId, title, topic, data: rounds, grade, subject, created_at: new Date().toISOString() }]).select().single();
  if (error) throw error;
  return data.id;
};

export const updateExamSet = async (setId: string, title: string, rounds: Round[], topic: string, grade: string, teacherId: string) => {
  const { error } = await supabase.from('exam_sets').update({ title, topic, data: rounds, grade, teacher_id: teacherId }).eq('id', setId);
  if (error) throw error;
  return setId;
};

export const deleteExamSet = async (setId: string) => {
  const { error } = await supabase.from('exam_sets').delete().eq('id', setId);
  if (error) throw error;
  return true;
};

export const fetchSetData = async (setId: string): Promise<{ rounds: Round[], topic: string, grade: string, created_at: string }> => {
  const { data, error } = await supabase.from('exam_sets').select('data, topic, grade, created_at').eq('id', setId).single();
  if (error) throw error;
  return { 
    rounds: data?.data || [], 
    topic: data?.topic || 'Khác', 
    grade: data?.grade || '10',
    created_at: data?.created_at || new Date().toISOString()
  };
};

export const assignSetToRoom = async (teacherId: string, roomCode: string, setId: string) => {
  const { error } = await supabase.from('room_assignments').insert({ 
    teacher_id: teacherId, 
    room_code: roomCode, 
    set_id: setId, 
    assigned_at: new Date().toISOString() 
  });
  if (error && error.code !== '23505') throw error; 
  return true;
};

// Trả về cả ID và thời gian gán
export const getRoomAssignments = async (teacherId: string, roomCode: string): Promise<{set_id: string, assigned_at: string}[]> => {
  const { data, error } = await supabase.from('room_assignments')
    .select('set_id, assigned_at')
    .eq('teacher_id', teacherId)
    .eq('room_code', roomCode)
    .order('assigned_at', { ascending: true }); // Sắp xếp theo thứ tự gán ngay từ câu query
  if (error || !data) return [];
  return data.map(row => ({ set_id: row.set_id, assigned_at: row.assigned_at }));
};

export const getSetAssignments = async (teacherId: string, setId: string): Promise<string[]> => {
  const { data, error } = await supabase.from('room_assignments').select('room_code').eq('teacher_id', teacherId).eq('set_id', setId);
  if (error || !data) return [];
  return data.map(row => row.room_code);
};

export const removeRoomAssignment = async (teacherId: string, roomCode: string, setId: string) => {
  const { error } = await supabase.from('room_assignments').delete()
    .eq('teacher_id', teacherId)
    .eq('room_code', roomCode)
    .eq('set_id', setId);
  if (error) throw error;
  return true;
};

export const updateExamSetTitle = async (setId: string, newTitle: string) => {
  const { error } = await supabase.from('exam_sets').update({ title: newTitle }).eq('id', setId);
  if (error) throw error;
  return true;
};

export const fetchQuestionsLibrary = async (teacherId: string, grade?: string, type?: QuestionType): Promise<PhysicsProblem[]> => {
  let query = supabase.from('exam_sets').select('data, topic').eq('teacher_id', teacherId);
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

export const standardizeLegacySets = async (teacherId: string, maGV: string) => {
  const { error } = await supabase
    .from('exam_sets')
    .update({ teacher_id: teacherId })
    .eq('teacher_id', maGV);
  if (error) throw error;
  return true;
};
