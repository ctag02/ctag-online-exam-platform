export interface User {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'student';
}

export interface Question {
  id: number;
  text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer?: string;
  topic: string;
  difficulty: string;
}

export interface Exam {
  id: number;
  title: string;
  duration: number;
  scheduled_at: string;
  is_active: boolean;
  questions: string; // JSON string of IDs
}

export interface Result {
  id: number;
  user_id: number;
  exam_id: number;
  score: number;
  correct_count: number;
  wrong_count: number;
  skipped_count: number;
  submitted_at: string;
  exam_title?: string;
  student_name?: string;
  student_email?: string;
  skipped_topics_count?: number;
  wrong_topics_count?: number;
  skipped_topics_list?: string;
  wrong_topics_list?: string;
}

export interface WarningLog {
  id: number;
  user_id: number;
  exam_id: number;
  type: string;
  message: string;
  timestamp: string;
  student_name?: string;
}
