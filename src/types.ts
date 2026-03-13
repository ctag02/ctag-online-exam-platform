export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'student';
}

export interface Question {
  id: string;
  text: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer?: string;
  topic: string;
  difficulty: string;
}

export interface Exam {
  id: string;
  title: string;
  duration: number;
  scheduledAt: string;
  isActive: boolean;
  questionIds: string[];
}

export interface Result {
  id: string;
  userId: string;
  examId: string;
  score: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  submittedAt: string;
  examTitle?: string;
  studentName?: string;
  studentEmail?: string;
  skippedTopicsCount?: number;
  wrongTopicsCount?: number;
  skippedTopicsList?: string;
  wrongTopicsList?: string;
}

export interface WarningLog {
  id: string;
  userId: string;
  examId: string;
  type: string;
  message: string;
  timestamp: string;
  studentName?: string;
}
