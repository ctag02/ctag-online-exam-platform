export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'student';
}

export interface Question {
  id: string;
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
  id: string;
  title: string;
  duration: number;
  scheduled_at: string;
  is_active: boolean;
  questions: string | string[]; // Can be JSON string or array of IDs
}

export interface Result {
  id: string;
  user_id: string;
  exam_id: string;
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
  id: string;
  user_id: string;
  exam_id: string;
  type: string;
  message: string;
  timestamp: string;
  student_name?: string;
}
