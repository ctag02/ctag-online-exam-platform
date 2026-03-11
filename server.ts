import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import multer from 'multer';
import * as xlsx from 'xlsx';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.VERCEL ? '/tmp/ctag.db' : 'ctag.db';
const db = new Database(dbPath);
const JWT_SECRET = process.env.JWT_SECRET || 'ctag-secret-key-2026';

// Initialize Database Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT,
    role TEXT DEFAULT 'student'
  );

  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT,
    option_a TEXT,
    option_b TEXT,
    option_c TEXT,
    option_d TEXT,
    correct_answer TEXT,
    topic TEXT,
    difficulty TEXT
  );

  CREATE TABLE IF NOT EXISTS exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    duration INTEGER, -- in minutes
    scheduled_at DATETIME,
    is_active INTEGER DEFAULT 0,
    questions TEXT -- JSON array of question IDs
  );

  CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    exam_id INTEGER,
    question_id INTEGER,
    answer TEXT,
    UNIQUE(user_id, exam_id, question_id)
  );

  CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    exam_id INTEGER,
    score REAL,
    correct_count INTEGER,
    wrong_count INTEGER,
    skipped_count INTEGER,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, exam_id)
  );

  CREATE TABLE IF NOT EXISTS warning_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    exam_id INTEGER,
    type TEXT,
    message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed Admin User
const adminEmail = 'support@c-tag.online';
const adminPass = 'TE@M4ctag';
const existingAdmin = db.prepare('SELECT * FROM users WHERE email = ?').get(adminEmail);
if (!existingAdmin) {
  const hashedPass = bcrypt.hashSync(adminPass, 10);
  db.prepare('INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)').run(adminEmail, hashedPass, 'Admin', 'admin');
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// Middleware: Auth
const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: 'Forbidden' });
    req.user = user;
    next();
  });
};

const isAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
};

// --- AUTH ROUTES ---
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user: any = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET);
  res.json({ token, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
});

app.post('/api/register', (req, res) => {
  const { email, password, name } = req.body;
  try {
    const hashedPass = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (email, password, name) VALUES (?, ?, ?)').run(email, hashedPass, name);
    res.json({ message: 'User registered successfully' });
  } catch (e) {
    res.status(400).json({ error: 'Email already exists' });
  }
});

// --- QUESTION BANK ROUTES ---
app.get('/api/admin/questions', authenticateToken, isAdmin, (req, res) => {
  const questions = db.prepare('SELECT * FROM questions').all();
  res.json(questions);
});

app.post('/api/admin/questions', authenticateToken, isAdmin, (req, res) => {
  const { text, option_a, option_b, option_c, option_d, correct_answer, topic, difficulty } = req.body;
  db.prepare('INSERT INTO questions (text, option_a, option_b, option_c, option_d, correct_answer, topic, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(text, option_a, option_b, option_c, option_d, correct_answer, topic, difficulty);
  res.json({ message: 'Question added' });
});

app.post('/api/admin/questions/bulk', authenticateToken, isAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data: any[] = xlsx.utils.sheet_to_json(sheet);

  const insert = db.prepare('INSERT INTO questions (text, option_a, option_b, option_c, option_d, correct_answer, topic, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const transaction = db.transaction((rows) => {
    for (const row of rows) {
      insert.run(
        row.Question || row.text,
        row.A || row.option_a,
        row.B || row.option_b,
        row.C || row.option_c,
        row.D || row.option_d,
        row.Answer || row.correct_answer,
        row.Topic || row.topic || 'General',
        row.Difficulty || row.difficulty || 'Medium'
      );
    }
  });
  transaction(data);
  res.json({ message: `${data.length} questions uploaded` });
});

app.post('/api/admin/questions/bulk-json', authenticateToken, isAdmin, (req, res) => {
  const data = req.body;
  if (!Array.isArray(data)) return res.status(400).json({ error: 'Invalid data format' });

  const insert = db.prepare('INSERT INTO questions (text, option_a, option_b, option_c, option_d, correct_answer, topic, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const transaction = db.transaction((rows) => {
    for (const row of rows) {
      insert.run(
        row.text,
        row.option_a,
        row.option_b,
        row.option_c,
        row.option_d,
        row.correct_answer,
        row.topic || 'General',
        row.difficulty || 'Medium'
      );
    }
  });
  transaction(data);
  res.json({ message: `${data.length} questions added` });
});

// --- EXAM ROUTES ---
app.get('/api/admin/exams', authenticateToken, isAdmin, (req, res) => {
  const exams = db.prepare('SELECT * FROM exams').all();
  res.json(exams);
});

app.post('/api/admin/exams', authenticateToken, isAdmin, (req, res) => {
  const { title, duration, scheduled_at, questions } = req.body;
  const result = db.prepare('INSERT INTO exams (title, duration, scheduled_at, questions) VALUES (?, ?, ?, ?)').run(title, duration, scheduled_at, JSON.stringify(questions));
  res.json({ id: result.lastInsertRowid });
});

app.patch('/api/admin/exams/:id/status', authenticateToken, isAdmin, (req, res) => {
  const { is_active } = req.body;
  db.prepare('UPDATE exams SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, req.params.id);
  res.json({ message: 'Status updated' });
});

// --- STUDENT EXAM ROUTES ---
app.get('/api/student/exams', authenticateToken, (req, res) => {
  const exams = db.prepare(`
    SELECT e.* FROM exams e 
    WHERE e.is_active = 1 
    AND e.id NOT IN (SELECT exam_id FROM results WHERE user_id = ?)
  `).all(req.user.id);
  res.json(exams);
});

app.get('/api/student/exams/:id', authenticateToken, (req, res) => {
  const examId = req.params.id;
  const userId = req.user.id;

  // Check if already submitted
  const existingResult = db.prepare('SELECT * FROM results WHERE user_id = ? AND exam_id = ?').get(userId, examId);
  if (existingResult) {
    return res.status(403).json({ error: 'You have already submitted this exam.' });
  }

  const exam: any = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId);
  if (!exam) return res.status(404).json({ error: 'Exam not found' });

  let questionIds = [];
  try {
    questionIds = JSON.parse(exam.questions || '[]');
  } catch (e) {
    questionIds = [];
  }

  if (questionIds.length === 0) {
    return res.json({ ...exam, questions: [] });
  }

  const questions = db.prepare(`SELECT id, text, option_a, option_b, option_c, option_d, topic FROM questions WHERE id IN (${questionIds.map(() => '?').join(',')})`).all(...questionIds);

  // Maintain order
  const orderedQuestions = questionIds.map((id: number) => questions.find((q: any) => q.id === id)).filter(Boolean);

  res.json({ ...exam, questions: orderedQuestions });
});

app.post('/api/student/exams/:id/response', authenticateToken, (req, res) => {
  const { question_id, answer } = req.body;
  db.prepare('INSERT OR REPLACE INTO responses (user_id, exam_id, question_id, answer) VALUES (?, ?, ?, ?)').run(req.user.id, req.params.id, question_id, answer);
  res.json({ message: 'Saved' });
});

app.post('/api/student/exams/:id/submit', authenticateToken, (req, res) => {
  const examId = req.params.id;
  const userId = req.user.id;

  const exam: any = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId);
  const questionIds = JSON.parse(exam.questions);
  const questions = db.prepare(`SELECT id, correct_answer FROM questions WHERE id IN (${questionIds.join(',')})`).all();
  const responses = db.prepare('SELECT * FROM responses WHERE user_id = ? AND exam_id = ?').all(userId, examId);

  let correct = 0;
  let wrong = 0;
  let skipped = 0;

  questionIds.forEach((qId: number) => {
    const question = questions.find((q: any) => q.id === qId);
    const response = responses.find((r: any) => r.question_id === qId);

    if (!response || !response.answer) {
      skipped++;
    } else if (response.answer.toUpperCase() === question.correct_answer.toUpperCase()) {
      correct++;
    } else {
      wrong++;
    }
  });

  const score = (correct * 2) - (wrong * 0.5);

  try {
    db.prepare('INSERT INTO results (user_id, exam_id, score, correct_count, wrong_count, skipped_count) VALUES (?, ?, ?, ?, ?, ?)').run(userId, examId, score, correct, wrong, skipped);
    res.json({ score, correct, wrong, skipped });
  } catch (e) {
    res.status(400).json({ error: 'Already submitted' });
  }
});

app.get('/api/student/results', authenticateToken, (req, res) => {
  const results = db.prepare(`
    SELECT r.*, e.title as exam_title 
    FROM results r 
    JOIN exams e ON r.exam_id = e.id 
    WHERE r.user_id = ?
  `).all(req.user.id);
  res.json(results);
});

// --- PROCTORING ROUTES ---
app.post('/api/student/exams/:id/warning', authenticateToken, (req, res) => {
  const { type, message } = req.body;
  db.prepare('INSERT INTO warning_logs (user_id, exam_id, type, message) VALUES (?, ?, ?, ?)').run(req.user.id, req.params.id, type, message);
  res.json({ message: 'Logged' });
});

// --- ANALYTICS ROUTES ---
app.get('/api/admin/exams/:id/analytics', authenticateToken, isAdmin, (req, res) => {
  const examId = req.params.id;
  const results = db.prepare(`
    SELECT r.*, u.name as student_name, u.email as student_email 
    FROM results r 
    JOIN users u ON r.user_id = u.id 
    WHERE r.exam_id = ?
    ORDER BY r.score DESC
  `).all(examId);

  // Fetch all responses for this exam
  const responses = db.prepare(`
    SELECT res.user_id, res.question_id, res.answer, q.topic, q.correct_answer
    FROM responses res
    JOIN questions q ON res.question_id = q.id
    WHERE res.exam_id = ?
  `).all(examId);

  // Fetch exam questions to know what was available to be skipped
  const exam: any = db.prepare('SELECT questions FROM exams WHERE id = ?').get(examId);
  const questionIds = JSON.parse(exam.questions || '[]');
  const examQuestions = db.prepare(`SELECT id, topic, correct_answer FROM questions WHERE id IN (${questionIds.map(() => '?').join(',')})`).all(...questionIds);

  // Process results to include topic-wise info
  const resultsWithTopics = results.map((r: any) => {
    const studentResponses = responses.filter((res: any) => res.user_id === r.user_id);
    
    const topicStats: Record<string, { correct: number, wrong: number, skipped: number }> = {};
    
    // Initialize topicStats with all topics in the exam
    examQuestions.forEach((q: any) => {
      if (!topicStats[q.topic]) {
        topicStats[q.topic] = { correct: 0, wrong: 0, skipped: 0 };
      }
      
      const resp = studentResponses.find((res: any) => res.question_id === q.id);
      
      if (!resp || !resp.answer) {
        topicStats[q.topic].skipped++;
      } else if (resp.answer.toUpperCase() === q.correct_answer.toUpperCase()) {
        topicStats[q.topic].correct++;
      } else {
        topicStats[q.topic].wrong++;
      }
    });

    const skippedTopics = Object.keys(topicStats).filter(t => topicStats[t].skipped > 0);
    const wrongTopics = Object.keys(topicStats).filter(t => topicStats[t].wrong > 0);

    return {
      ...r,
      skipped_topics_count: skippedTopics.length,
      wrong_topics_count: wrongTopics.length,
      skipped_topics_list: skippedTopics.join(', '),
      wrong_topics_list: wrongTopics.join(', ')
    };
  });

  const warnings = db.prepare(`
    SELECT w.*, u.name as student_name 
    FROM warning_logs w 
    JOIN users u ON w.user_id = u.id 
    WHERE w.exam_id = ?
  `).all(examId);

  res.json({ results: resultsWithTopics, warnings });
});

app.get('/api/admin/stats', authenticateToken, isAdmin, (req, res) => {
  const totalStudents = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'student'").get().count;
  const totalExams = db.prepare("SELECT COUNT(*) as count FROM exams").get().count;
  const questionBankSize = db.prepare("SELECT COUNT(*) as count FROM questions").get().count;
  const recentResults = db.prepare("SELECT COUNT(*) as count FROM results").get().count;

  res.json({ totalStudents, totalExams, questionBankSize, recentResults });
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();

export default app;
