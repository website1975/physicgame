
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
  role: 'ADMIN' | 'TEACHER';
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

// Xóa tab CONTROL
export type AdminTab = 'EDITOR' | 'CLOUD' | 'LAB' | 'MANAGEMENT';

// Xóa ENTER_CODE vì không còn nhập mã phòng GV
export type GameState = 'LOBBY' | 'ROOM_SELECTION' | 'SET_SELECTION' | 'WAITING_ROOM' | 'ADMIN' | 'ROUND_INTRO' | 'STARTING_ROUND' | 'STARTING_QUESTION' | 'STARTING_ROUND_REVEAL' | 'WAITING_FOR_BUZZER' | 'ANSWERING' | 'FEEDBACK' | 'GAME_OVER' | 'STUDENT_SETUP' | 'TEACHER_LOGIN' | 'WAITING_FOR_PLAYERS' | 'KEYWORD_SELECTION';

export interface MatchData {
  setId: string;
  title: string;
  rounds: Round[];
  opponents?: { id: string, name: string }[];
  joinedRoom?: any;
  startIndex?: number;
  myId?: string;
}
