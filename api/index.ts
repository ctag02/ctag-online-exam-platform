import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import multer from 'multer';
import * as xlsx from 'xlsx';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db: any;

// Initialize Database
const isVercel = !!process.env.VERCEL;
const dbPath = isVercel 
  ? path.join('/tmp', 'database.sqlite')
  : path.join(process.cwd(), 'database.sqlite');

console.log('Using database at:', dbPath);
try {
  const { default: Database } = await import('better-sqlite3');
  db = new Database(dbPath);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE, password TEXT, name TEXT, role TEXT DEFAULT 'student');
    CREATE TABLE IF NOT EXISTS questions (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, option_a TEXT, option_b TEXT, option_c TEXT, option_d TEXT, correct_answer TEXT, topic TEXT, difficulty TEXT);
    CREATE TABLE IF NOT EXISTS exams (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, duration INTEGER, scheduled_at DATETIME, is_active INTEGER DEFAULT 0, questions TEXT);
    CREATE TABLE IF NOT EXISTS responses (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, exam_id INTEGER, question_id INTEGER, answer TEXT, UNIQUE(user_id, exam_id, question_id));
    CREATE TABLE IF NOT EXISTS results (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, exam_id INTEGER, score REAL, correct_count INTEGER, wrong_count INTEGER, skipped_count INTEGER, submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, exam_id));
    CREATE TABLE IF NOT EXISTS warning_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, exam_id INTEGER, type TEXT, message TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP);
  `);

  const adminEmail = 'support@c-tag.online';
  const existingAdmin = db.prepare('SELECT * FROM users WHERE email = ?').get(adminEmail);
  if (!existingAdmin) {
    const hashedPass = bcrypt.hashSync('TE@M4ctag', 10);
    db.prepare('INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)').run(adminEmail, hashedPass, 'Admin', 'admin');
  }
  console.log('Database initialized successfully');
} catch (err) {
  console.error('Database initialization failed. This is expected on some serverless environments if better-sqlite3 is not supported:', err);
}

const JWT_SECRET = process.env.JWT_SECRET || 'ctag-secret-key-2026';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: !!db });
});

const upload = multer({ storage: multer.memoryStorage() });

// Middleware: Auth
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: 'Forbidden' });
    req.user = user;
    next();
  });
};

const isAdmin = (req: any, res: any, next: any) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
};

// --- AUTH ROUTES ---
app.post('/api/login', (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not available' });
  const { email, password } = req.body;
  try {
    const user: any = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET);
    res.json({ token, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/register', (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not available' });
  const { email, password, name } = req.body;
  try {
    const hashedPass = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (email, password, name) VALUES (?, ?, ?)').run(email, hashedPass, name);
    res.json({ message: 'User registered successfully' });
  } catch (e: any) {
    res.status(400).json({ error: e.message.includes('UNIQUE') ? 'Email already exists' : e.message });
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
  const transaction = db.transaction((rows: any) => {
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
  const transaction = db.transaction((rows: any) => {
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
  if (!db) return res.status(500).json({ error: 'Database not available' });
  const { title, duration, scheduled_at, questions } = req.body;
  console.log('Creating exam:', { title, questions });
  try {
    const questionsStr = JSON.stringify(questions || []);
    const result = db.prepare('INSERT INTO exams (title, duration, scheduled_at, questions) VALUES (?, ?, ?, ?)').run(title, duration, scheduled_at, questionsStr);
    res.json({ id: result.lastInsertRowid });
  } catch (err: any) {
    console.error('Error creating exam:', err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/exams/:id/status', authenticateToken, isAdmin, (req, res) => {
  const { is_active } = req.body;
  db.prepare('UPDATE exams SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, req.params.id);
  res.json({ message: 'Status updated' });
});

// --- STUDENT EXAM ROUTES ---
app.get('/api/student/exams', authenticateToken, (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not available' });
  const exams = db.prepare(`
    SELECT e.* FROM exams e 
    WHERE e.is_active = 1 
    AND e.id NOT IN (SELECT exam_id FROM results WHERE user_id = ?)
  `).all((req as any).user.id);
  res.json(exams);
});

app.get('/api/student/exams/:id', authenticateToken, (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not available' });
  const examId = req.params.id;
  const userId = (req as any).user.id;

  console.log('Student fetching exam:', { examId, userId });

  const existingResult = db.prepare('SELECT * FROM results WHERE user_id = ? AND exam_id = ?').get(userId, examId);
  if (existingResult) {
    return res.status(403).json({ error: 'You have already submitted this exam.' });
  }

  const exam: any = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId);
  if (!exam) return res.status(404).json({ error: 'Exam not found. It may have been deleted.' });
  
  if (!exam.is_active) {
    return res.status(403).json({ error: 'This exam is not currently active. Please wait for the administrator to start the session.' });
  }

  let questionIds = [];
  try {
    questionIds = typeof exam.questions === 'string' ? JSON.parse(exam.questions || '[]') : (exam.questions || []);
  } catch (e) {
    console.error('Error parsing exam questions:', e);
    questionIds = [];
  }

  console.log('Exam question IDs:', questionIds);

  if (!Array.isArray(questionIds) || questionIds.length === 0) {
    return res.json({ ...exam, questions: [] });
  }

  const questions = db.prepare(`SELECT id, text, option_a, option_b, option_c, option_d, topic FROM questions WHERE id IN (${questionIds.map(() => '?').join(',')})`).all(...questionIds);
  console.log('Fetched questions count:', questions.length);
  
  const orderedQuestions = questionIds.map((id: number) => questions.find((q: any) => q.id === id)).filter(Boolean);
  res.json({ ...exam, questions: orderedQuestions });
});

app.post('/api/student/exams/:id/response', authenticateToken, (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not available' });
  const { question_id, answer } = req.body;
  db.prepare('INSERT OR REPLACE INTO responses (user_id, exam_id, question_id, answer) VALUES (?, ?, ?, ?)').run((req as any).user.id, req.params.id, question_id, answer);
  res.json({ message: 'Saved' });
});

app.post('/api/student/exams/:id/submit', authenticateToken, (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not available' });
  const examId = req.params.id;
  const userId = (req as any).user.id;

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
  if (!db) return res.status(500).json({ error: 'Database not available' });
  const results = db.prepare(`
    SELECT r.*, e.title as exam_title 
    FROM results r 
    JOIN exams e ON r.exam_id = e.id 
    WHERE r.user_id = ?
  `).all((req as any).user.id);
  res.json(results);
});

app.post('/api/student/exams/:id/warning', authenticateToken, (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not available' });
  const { type, message } = req.body;
  db.prepare('INSERT INTO warning_logs (user_id, exam_id, type, message) VALUES (?, ?, ?, ?)').run((req as any).user.id, req.params.id, type, message);
  res.json({ message: 'Logged' });
});

app.get('/api/admin/exams/:id/analytics', authenticateToken, isAdmin, (req, res) => {
  const examId = req.params.id;
  const results = db.prepare(`
    SELECT r.*, u.name as student_name, u.email as student_email 
    FROM results r 
    JOIN users u ON r.user_id = u.id 
    WHERE r.exam_id = ?
    ORDER BY r.score DESC
  `).all(examId);

  const responses = db.prepare(`
    SELECT res.user_id, res.question_id, res.answer, q.topic, q.correct_answer
    FROM responses res
    JOIN questions q ON res.question_id = q.id
    WHERE res.exam_id = ?
  `).all(examId);

  const exam: any = db.prepare('SELECT questions FROM exams WHERE id = ?').get(examId);
  const questionIds = JSON.parse(exam.questions || '[]');
  const examQuestions = db.prepare(`SELECT id, topic, correct_answer FROM questions WHERE id IN (${questionIds.map(() => '?').join(',')})`).all(...questionIds);

  const resultsWithTopics = results.map((r: any) => {
    const studentResponses = responses.filter((res: any) => res.user_id === r.user_id);
    const topicStats: Record<string, { correct: number, wrong: number, skipped: number }> = {};
    
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
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // On Vercel, the dist folder is included via vercel.json includeFiles
    // We use __dirname to get the absolute path relative to the function
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const distPath = path.join(__dirname, '..', 'dist');
    
    console.log('Serving static files from:', distPath);
    
    app.use(express.static(distPath, {
      maxAge: '1d',
      index: false // Don't serve index.html automatically to avoid MIME issues
    }));
    
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API Endpoint Not Found' });
      }
      
      const indexPath = path.join(distPath, 'index.html');
      
      // Prevent caching of index.html to ensure users always get the latest version
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
      
      res.sendFile(indexPath);
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'production') {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();

export default app;
