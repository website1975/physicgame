
import { Difficulty, PhysicsProblem, QuestionType, DisplayChallenge, InteractiveMechanic } from './types';

export const DEFAULT_PROBLEMS: PhysicsProblem[] = [
  {
    id: 'p1',
    title: 'Chuyển động thẳng đều',
    content: 'Một chiếc xe khởi hành từ A đi đến B dài 120km trong 2 giờ. Vận tốc của xe là bao nhiêu?',
    difficulty: Difficulty.EASY,
    type: QuestionType.MULTIPLE_CHOICE,
    challenge: DisplayChallenge.NORMAL,
    options: ['40 km/h', '60 km/h', '80 km/h', '100 km/h'],
    correctAnswer: '60 km/h',
    topic: 'Động học',
    explanation: 'Vận tốc v = s/t = 120/2 = 60 km/h.'
  },
  {
    id: 'p2',
    title: 'Định luật Newton',
    content: 'Lực ma sát luôn cùng chiều với chiều chuyển động của vật. Đúng hay Sai?',
    difficulty: Difficulty.MEDIUM,
    type: QuestionType.TRUE_FALSE,
    challenge: DisplayChallenge.MEMORY,
    options: ['Đúng', 'Sai'],
    correctAnswer: 'Sai',
    topic: 'Động lực học',
    explanation: 'Lực ma sát trượt luôn ngược chiều với chiều chuyển động tương đối của vật.'
  },
  {
    id: 'p3',
    title: 'Trọng trường',
    content: 'Tính trọng lượng của một vật có khối lượng 5kg tại nơi có g = 9.8 m/s² (Đơn vị: Newton)',
    difficulty: Difficulty.EASY,
    type: QuestionType.SHORT_ANSWER,
    challenge: DisplayChallenge.FOGGY,
    mechanic: InteractiveMechanic.RISING_WATER, // Thử thách nước dâng
    correctAnswer: '49',
    topic: 'Động lực học',
    explanation: 'P = m.g = 5 * 9.8 = 49 N.'
  }
];

export const ALL_QUANTITIES = [
  { symbol: 'v', name: 'Vận tốc' },
  { symbol: 'a', name: 'Gia tốc' },
  { symbol: 'F', name: 'Lực' },
  { symbol: 'm', name: 'Khối lượng' },
  { symbol: 'P', name: 'Công suất' },
  { symbol: 'W', name: 'Công' },
  { symbol: 't', name: 'Thời gian' },
  { symbol: 's', name: 'Quãng đường' },
];

export const ALL_FORMULAS = [
  { id: 'f1', name: 'Vận tốc', latex: 'v = s / t' },
  { id: 'f2', name: 'Gia tốc', latex: 'a = (v - v_0) / t' },
  { id: 'f3', name: 'Định luật II Newton', latex: 'F = m.a' },
  { id: 'f4', name: 'Trọng lực', latex: 'P = m.g' },
  { id: 'f5', name: 'Công cơ học', latex: 'A = F.s.cos(α)' },
];

/**
 * Categories for filtering exam sets in the teacher portal.
 */
export const EXAM_CATEGORIES = ['Tất cả', 'Vật lý', '10', '11', '12'];
