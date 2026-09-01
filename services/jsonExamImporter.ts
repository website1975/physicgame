import { PhysicsProblem, QuestionType, Difficulty, DisplayChallenge, InteractiveMechanic, Round } from '../types';
import { findChapterAndWeekForTopic, joinTopic } from './curriculumData';

export interface ParsedExamResult {
  title: string;
  grade: string;
  topic: string;
  rounds: Round[];
  totalQuestions: number;
  mcqCount: number;
  tfCount: number;
  shortCount: number;
}

/**
 * Normalizes text for matching options and answers
 */
function normalizeStr(s: any): string {
  if (s === null || s === undefined) return '';
  return String(s).trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Parses level string to Difficulty enum
 */
function parseDifficulty(level?: string): Difficulty {
  if (!level) return Difficulty.MEDIUM;
  const l = String(level).trim().toUpperCase();
  if (l === 'B' || l === 'NB' || l === 'DỄ' || l === 'DE' || l === 'EASY') return Difficulty.EASY;
  if (l === 'H' || l === 'TH' || l === 'TRUNG BÌNH' || l === 'MEDIUM') return Difficulty.MEDIUM;
  if (l === 'VD' || l === 'VDC' || l === 'KHÓ' || l === 'KHO' || l === 'HARD') return Difficulty.HARD;
  return Difficulty.MEDIUM;
}

/**
 * Parses a single question object from JSON to PhysicsProblem
 */
export function parseSingleQuestion(q: any, defaultTopic: string = 'Vật lí', defaultGrade: string = '10', index: number = 1): { problem: PhysicsProblem; category: 'mcq' | 'tf' | 'short' } {
  const id = q.id || `q_${Math.random().toString(36).substring(2, 9)}`;
  const content = q.content || q.text || q.question || q.cau_hoi || '';
  const title = q.title || q.name || `Câu ${index}`;
  const explanation = q.explanation || q.solution || q.huong_dan || q.loi_giai || '';
  const difficulty = parseDifficulty(q.level || q.difficulty || q.do_kho);
  const imageUrl = q.imageUrl || q.image || q.img || undefined;
  const grade = String(q.grade || defaultGrade || '10');
  const topic = q.subject || q.category || q.topic || defaultTopic || 'Vật lí';
  const timeLimit = q.durationSeconds || q.timeLimit || 40;

  const rawType = String(q.type || '').toLowerCase().trim();

  // 1. Group True/False (Đúng / Sai)
  if (
    rawType === 'group-tf' || 
    rawType === 'tf' || 
    rawType === 'true_false' || 
    rawType === 'ds' || 
    rawType === 'true-false' ||
    (Array.isArray(q.subQuestions) && q.subQuestions.length > 0) ||
    (Array.isArray(q.items) && q.items.length > 0)
  ) {
    const subItems: any[] = q.subQuestions || q.items || [];
    let options: string[] = ['', '', '', ''];
    let dsChars: string[] = ['S', 'S', 'S', 'S'];

    if (Array.isArray(subItems) && subItems.length > 0) {
      for (let i = 0; i < Math.min(4, subItems.length); i++) {
        const item = subItems[i];
        const itemText = typeof item === 'string' ? item : (item.text || item.content || item.title || '');
        options[i] = itemText;

        const ansRaw = typeof item === 'object' && item !== null ? item.correctAnswer : '';
        const normAns = normalizeStr(ansRaw);
        if (normAns === 'true' || normAns === 'đ' || normAns === 'đúng' || normAns === 'dung' || normAns === '1' || ansRaw === true) {
          dsChars[i] = 'Đ';
        } else {
          dsChars[i] = 'S';
        }
      }
    } else if (Array.isArray(q.options) && q.options.length > 0) {
      for (let i = 0; i < Math.min(4, q.options.length); i++) {
        options[i] = String(q.options[i]);
      }
      const rawAns = String(q.correctAnswer || 'SSSS').toUpperCase();
      for (let i = 0; i < 4; i++) {
        dsChars[i] = rawAns[i] === 'Đ' || rawAns[i] === 'T' ? 'Đ' : 'S';
      }
    }

    const problem: PhysicsProblem = {
      id,
      title,
      content,
      type: QuestionType.TRUE_FALSE,
      difficulty,
      challenge: DisplayChallenge.NORMAL,
      mechanic: InteractiveMechanic.CANNON,
      options,
      correctAnswer: dsChars.join(''),
      topic,
      explanation,
      timeLimit,
      grade,
      imageUrl
    };

    return { problem, category: 'tf' };
  }

  // 2. Short answer / Numeric (Trả lời ngắn)
  if (
    rawType === 'short' || 
    rawType === 'short_answer' || 
    rawType === 'tl' || 
    rawType === 'tra_loi_ngan' || 
    rawType === 'fill' || 
    rawType === 'numeric' ||
    (!q.options && !q.subQuestions && q.correctAnswer !== undefined)
  ) {
    let ans = '';
    if (q.correctAnswer !== undefined && q.correctAnswer !== null) {
      ans = String(q.correctAnswer).trim();
    }

    const problem: PhysicsProblem = {
      id,
      title,
      content,
      type: QuestionType.SHORT_ANSWER,
      difficulty,
      challenge: DisplayChallenge.NORMAL,
      mechanic: InteractiveMechanic.CANNON,
      options: [],
      correctAnswer: ans,
      topic,
      explanation,
      timeLimit,
      grade,
      imageUrl
    };

    return { problem, category: 'short' };
  }

  // 3. Multiple Choice (Trắc nghiệm 4 lựa chọn) - Default
  let options: string[] = ['', '', '', ''];
  if (Array.isArray(q.options)) {
    for (let i = 0; i < Math.min(4, q.options.length); i++) {
      options[i] = String(q.options[i]);
    }
  }

  let correctAnswer = 'A';
  const rawAns = q.correctAnswer !== undefined && q.correctAnswer !== null ? String(q.correctAnswer).trim() : '';

  // Check if answer is directly A, B, C, D
  const upperAns = rawAns.toUpperCase();
  if (['A', 'B', 'C', 'D'].includes(upperAns)) {
    correctAnswer = upperAns;
  } else if (['0', '1', '2', '3'].includes(rawAns)) {
    correctAnswer = ['A', 'B', 'C', 'D'][parseInt(rawAns, 10)];
  } else if (rawAns) {
    // Try to find matching option text
    const normAns = normalizeStr(rawAns);
    const matchedIdx = options.findIndex(opt => {
      const normOpt = normalizeStr(opt);
      if (normOpt === normAns) return true;
      // Match without LaTeX $ signs
      const cleanOpt = normOpt.replace(/\$/g, '').trim();
      const cleanAns = normAns.replace(/\$/g, '').trim();
      return cleanOpt === cleanAns;
    });

    if (matchedIdx >= 0 && matchedIdx < 4) {
      correctAnswer = ['A', 'B', 'C', 'D'][matchedIdx];
    } else {
      // Check if starts with A., B., C., D.
      const match = rawAns.match(/^([A-D])[\.\:\s]/i);
      if (match) {
        correctAnswer = match[1].toUpperCase();
      }
    }
  }

  const problem: PhysicsProblem = {
    id,
    title,
    content,
    type: QuestionType.MULTIPLE_CHOICE,
    difficulty,
    challenge: DisplayChallenge.NORMAL,
    mechanic: InteractiveMechanic.CANNON,
    options,
    correctAnswer,
    topic,
    explanation,
    timeLimit,
    grade,
    imageUrl
  };

  return { problem, category: 'mcq' };
}

/**
 * Parses a complete exam JSON data (object or array) and organizes it into 3 Rounds
 */
export function parseExamJSON(jsonData: any): ParsedExamResult {
  let root = jsonData;
  
  // If string, parse to JSON object
  if (typeof jsonData === 'string') {
    const clean = jsonData.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    root = JSON.parse(clean);
  }

  let title = 'Đề thi nhập từ JSON';
  let grade = '10';
  let topic = '';
  let rawQuestions: any[] = [];

  if (Array.isArray(root)) {
    rawQuestions = root;
  } else if (typeof root === 'object' && root !== null) {
    title = root.title || root.name || root.ten_de || 'Đề thi nhập từ JSON';
    grade = String(root.grade || root.khoi || '10');
    
    // Check if JSON explicitly has chapter/week or if category/topic has chapter/week
    const rawChapter = root.chapter || root.chuong || '';
    const rawWeek = root.week || root.tuan || '';
    const rawTopicOrCat = root.topic || root.category || root.chude || '';

    if (rawChapter || rawWeek) {
      topic = joinTopic(rawChapter, rawWeek);
    } else if (rawTopicOrCat) {
      const lower = String(rawTopicOrCat).toLowerCase();
      if (lower.includes('chương') || lower.includes('chuong') || lower.includes('tuần') || lower.includes('tuan')) {
        const found = findChapterAndWeekForTopic(rawTopicOrCat, grade);
        topic = joinTopic(found.chapter, found.week);
      } else {
        // Generic subject/category like "Vật lí" or "KTTX - KTGK 1" -> leave empty so teacher selects
        topic = '';
      }
    } else {
      topic = '';
    }

    if (Array.isArray(root.questions)) {
      rawQuestions = root.questions;
    } else if (Array.isArray(root.data)) {
      rawQuestions = root.data;
    } else if (Array.isArray(root.items)) {
      rawQuestions = root.items;
    } else if (Array.isArray(root.rounds)) {
      // If already formatted as rounds array
      const flat: any[] = [];
      root.rounds.forEach((r: any) => {
        if (Array.isArray(r.problems)) flat.push(...r.problems);
      });
      if (flat.length > 0) rawQuestions = flat;
    }
  }

  if (!rawQuestions || rawQuestions.length === 0) {
    throw new Error('Không tìm thấy danh sách câu hỏi trong file JSON. Vui lòng kiểm tra định dạng file!');
  }

  const mcqProblems: PhysicsProblem[] = [];
  const tfProblems: PhysicsProblem[] = [];
  const shortProblems: PhysicsProblem[] = [];

  rawQuestions.forEach((q, idx) => {
    const { problem, category } = parseSingleQuestion(q, topic, grade, idx + 1);
    if (category === 'mcq') {
      mcqProblems.push(problem);
    } else if (category === 'tf') {
      tfProblems.push(problem);
    } else if (category === 'short') {
      shortProblems.push(problem);
    }
  });

  // Rename question titles cleanly in each round
  mcqProblems.forEach((p, i) => { p.title = `Câu ${i + 1} (TN)`; });
  tfProblems.forEach((p, i) => { p.title = `Câu ${i + 1} (Đ/S)`; });
  shortProblems.forEach((p, i) => { p.title = `Câu ${i + 1} (Trả lời ngắn)`; });

  const rounds: Round[] = [
    {
      number: 1,
      description: 'Vòng 1: Trắc nghiệm khách quan 4 lựa chọn (Chọn 1 phương án đúng)',
      problems: mcqProblems
    },
    {
      number: 2,
      description: 'Vòng 2: Trắc nghiệm Đúng / Sai (Đánh giá 4 ý a, b, c, d)',
      problems: tfProblems
    },
    {
      number: 3,
      description: 'Vòng 3: Trả lời ngắn / Nhập số (Tính toán và điền đáp số)',
      problems: shortProblems
    }
  ];

  return {
    title,
    grade,
    topic,
    rounds,
    totalQuestions: rawQuestions.length,
    mcqCount: mcqProblems.length,
    tfCount: tfProblems.length,
    shortCount: shortProblems.length
  };
}
