
export enum Difficulty {
  EASY = 'Dễ',
  MEDIUM = 'Trung bình',
  HARD = 'Khó'
}

export enum QuestionType {
  MULTIPLE_CHOICE = 'TN',
  TRUE_FALSE = 'DS',
  SHORT_ANSWER = 'TL'
}

export enum DisplayChallenge {
  NORMAL = 'Mặc định',
  MEMORY = 'Ghi nhớ nhanh',
  FOGGY = 'Màn sương mờ',
  SCRAMBLED = 'Sắp xếp từ',
  ANTS = 'Kiến bò lung tung',
  FLOODING = 'Nước dâng ngập chữ',
  DISTRACTORS = 'Vật thể nhiễu'
}

export enum InteractiveMechanic {
  CANNON = 'Pháo xạ kích',
  RISING_WATER = 'Nước dâng cao',
  SPACE_DASH = 'Vũ trụ phiêu lưu',
  MARIO = 'Nấm lùn phiêu lưu',
  HIDDEN_TILES = 'Lật ô bí mật'
}

export type UserRole = 'TEACHER' | 'STUDENT' | 'ADMIN';

export interface Teacher {
  id: string;
  magv: string;
  tengv: string;
  monday: string;
  pass: string;
  role: 'ADMIN' | 'TEACHER'; // Trường mới để phân quyền
  email?: string;
}

export interface PhysicsProblem {
  id: string;
  title: string;
  content: string;
  difficulty: Difficulty;
  type: QuestionType;
  challenge: DisplayChallenge;
  challengeNumber?: number; 
  mechanic?: InteractiveMechanic;
  options?: string[]; 
  correctAnswer: string; 
  topic: string;
  explanation: string;
  timeLimit?: number;
  grade?: string;
  subject?: string;
  imageUrl?: string; 
}

export interface Player {
  id: string;
  name: string;
  score: number;
  isActive: boolean;
  role: UserRole;
  lastAnswerCorrect?: boolean;
}

export interface Round {
  number: number;
  problems: PhysicsProblem[];
  description?: string;
}

export interface GameSettings {
  autoNext: boolean;
  autoNextDelay: number;
  maxPlayers: number;
}

export type AdminTab = 'EDITOR' | 'CONTROL' | 'CLOUD' | 'LAB' | 'MANAGEMENT'; 

export type GameState = 'LOBBY' | 'ROOM_SELECTION' | 'SET_SELECTION' | 'WAITING_ROOM' | 'ADMIN' | 'ROUND_INTRO' | 'STARTING_ROUND' | 'WAITING_FOR_BUZZER' | 'ANSWERING' | 'FEEDBACK' | 'LECTURING' | 'GAME_OVER' | 'ENTER_CODE' | 'STUDENT_SETUP' | 'TEACHER_LOGIN' | 'WAITING_FOR_PLAYERS' | 'KEYWORD_SELECTION';
