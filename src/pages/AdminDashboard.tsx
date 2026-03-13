import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { motion } from 'motion/react';
import { CheckSquare, Square as SquareIcon, FileText, Upload, Plus, BarChart2, Play, Square, LogOut, Users, Database, TrendingUp } from 'lucide-react';
import { Question, Exam } from '../types';
import { GoogleGenAI, Type } from "@google/genai";
import { db, auth } from '../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc, 
  query, 
  orderBy, 
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import * as xlsx from 'xlsx';
import { useFirebase, OperationType, handleFirestoreError } from '../context/FirebaseContext';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('exams');
  const [stats, setStats] = useState<any>({});
  const [questions, setQuestions] = useState<Question[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [newExam, setNewExam] = useState({ title: '', duration: 150, scheduledAt: '' });
  const [newQuestion, setNewQuestion] = useState<Partial<Question>>({
    text: '', optionA: '', optionB: '', optionC: '', optionD: '', correctAnswer: 'A', topic: '', difficulty: 'Medium'
  });
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState<string | null>(null);
  const navigate = useNavigate();
  const { profile } = useFirebase();

  useEffect(() => {
    // Real-time questions
    const qQuestions = query(collection(db, 'questions'), orderBy('createdAt', 'desc'));
    const unsubQuestions = onSnapshot(qQuestions, (snapshot) => {
      const qList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question));
      setQuestions(qList);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'questions'));

    // Real-time exams
    const qExams = query(collection(db, 'exams'), orderBy('createdAt', 'desc'));
    const unsubExams = onSnapshot(qExams, (snapshot) => {
      const eList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exam));
      setExams(eList);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'exams'));

    // Stats (simplified for now, can be improved with more listeners)
    const fetchStats = async () => {
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        const resultsSnap = await getDocs(collection(db, 'results'));
        setStats({
          totalStudents: usersSnap.docs.filter(d => d.data().role === 'student').length,
          totalExams: snapshotExams.docs.length,
          questionBankSize: snapshotQuestions.docs.length,
          recentResults: resultsSnap.size
        });
      } catch (e) {}
    };

    // We can use the snapshots to update stats too
    let snapshotQuestions: any = { docs: [] };
    let snapshotExams: any = { docs: [] };

    const unsubStatsQ = onSnapshot(collection(db, 'questions'), (s) => {
      snapshotQuestions = s;
      updateStats();
    });
    const unsubStatsE = onSnapshot(collection(db, 'exams'), (s) => {
      snapshotExams = s;
      updateStats();
    });
    const unsubStatsU = onSnapshot(collection(db, 'users'), (s) => {
      updateStats();
    });
    const unsubStatsR = onSnapshot(collection(db, 'results'), (s) => {
      updateStats();
    });

    const updateStats = async () => {
      const usersSnap = await getDocs(collection(db, 'users'));
      const resultsSnap = await getDocs(collection(db, 'results'));
      setStats({
        totalStudents: usersSnap.docs.filter(d => d.data().role === 'student').length,
        totalExams: snapshotExams.docs.length,
        questionBankSize: snapshotQuestions.docs.length,
        recentResults: resultsSnap.size
      });
    };

    return () => {
      unsubQuestions();
      unsubExams();
      unsubStatsQ();
      unsubStatsE();
      unsubStatsU();
      unsubStatsR();
    };
  }, []);

  const handleCreateExam = async () => {
    if (!newExam.title || selectedQuestions.length === 0) {
      alert('Please enter a title and select at least one question.');
      return;
    }

    try {
      await addDoc(collection(db, 'exams'), {
        ...newExam,
        questionIds: selectedQuestions,
        isActive: false,
        createdAt: new Date().toISOString()
      });
      alert('Exam created successfully!');
      setNewExam({ title: '', duration: 150, scheduledAt: '' });
      setSelectedQuestions([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'exams');
    }
  };

  const handleToggleExam = async (id: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'exams', id), {
        isActive: !currentStatus
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `exams/${id}`);
    }
  };

  const handleAddQuestion = async () => {
    try {
      await addDoc(collection(db, 'questions'), {
        ...newQuestion,
        createdAt: new Date().toISOString()
      });
      alert('Question added!');
      setNewQuestion({ text: '', optionA: '', optionB: '', optionC: '', optionD: '', correctAnswer: 'A', topic: '', difficulty: 'Medium' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'questions');
    }
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = xlsx.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = xlsx.utils.sheet_to_json(ws);

        const batch = writeBatch(db);
        data.forEach((row: any) => {
          const qRef = doc(collection(db, 'questions'));
          batch.set(qRef, {
            text: row.text || row.Question,
            optionA: row.optionA || row.option_a || row.A,
            optionB: row.optionB || row.option_b || row.B,
            optionC: row.optionC || row.option_c || row.C,
            optionD: row.optionD || row.option_d || row.D,
            correctAnswer: row.correctAnswer || row.correct_answer || row.Answer,
            topic: row.topic || row.Topic || 'General',
            difficulty: row.difficulty || row.Difficulty || 'Medium',
            createdAt: new Date().toISOString()
          });
        });
        await batch.commit();
        alert(`Successfully uploaded ${data.length} questions!`);
      } catch (error) {
        console.error('Bulk upload error:', error);
        alert('Failed to process Excel file. Please check the format.');
      }
    };
    reader.readAsBinaryString(file);
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.CUSTOM_GEMINI_API_KEY;
    if (!apiKey) {
      setExtractionStatus('Error: Gemini API key not configured.');
      setIsExtracting(false);
      return;
    }

    setIsExtracting(true);
    setExtractionStatus('Reading PDF file...');
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      setExtractionStatus('AI is analyzing questions...');
      
      let response;
      let retries = 5;
      const models = ["gemini-3.1-flash-lite-preview", "gemini-3-flash-preview", "gemini-3.1-pro-preview"];
      let currentModelIdx = 0;

      while (retries > 0) {
        try {
          const genAI = new GoogleGenAI({ apiKey });
          response = await genAI.models.generateContent({
            model: models[currentModelIdx],
            contents: {
              parts: [
                { inlineData: { data: base64Data, mimeType: 'application/pdf' } },
                { text: "Extract all multiple choice questions from this PDF. Return ONLY a JSON array of objects with: text, optionA, optionB, optionC, optionD, correctAnswer (A/B/C/D), topic, difficulty." }
              ]
            },
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    optionA: { type: Type.STRING },
                    optionB: { type: Type.STRING },
                    optionC: { type: Type.STRING },
                    optionD: { type: Type.STRING },
                    correctAnswer: { type: Type.STRING },
                    topic: { type: Type.STRING },
                    difficulty: { type: Type.STRING },
                  },
                  required: ["text", "optionA", "optionB", "optionC", "optionD", "correctAnswer"]
                }
              }
            }
          });
          break;
        } catch (err: any) {
          retries--;
          if (retries > 0) {
            currentModelIdx = (currentModelIdx + 1) % models.length;
            setExtractionStatus(`AI busy, retrying... (${5 - retries}/5)`);
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          throw err;
        }
      }

      if (!response) throw new Error('Failed to get response from AI');

      let text = response.text || '[]';
      if (text.includes('```')) text = text.replace(/```json\n?|```/g, '').trim();
      const extractedQuestions = JSON.parse(text);
      
      if (!Array.isArray(extractedQuestions) || extractedQuestions.length === 0) {
        setExtractionStatus('No questions found.');
        setIsExtracting(false);
        return;
      }

      setExtractionStatus(`Saving ${extractedQuestions.length} questions...`);
      const batch = writeBatch(db);
      extractedQuestions.forEach(q => {
        const qRef = doc(collection(db, 'questions'));
        batch.set(qRef, {
          ...q,
          createdAt: new Date().toISOString()
        });
      });
      await batch.commit();
      setExtractionStatus(`Success: Saved ${extractedQuestions.length} questions!`);
    } catch (error: any) {
      setExtractionStatus(`Error: ${error.message}`);
    } finally {
      setIsExtracting(false);
      setTimeout(() => setExtractionStatus(null), 5000);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

  const toggleSelectAll = () => {
    if (selectedQuestions.length === questions.length) {
      setSelectedQuestions([]);
    } else {
      setSelectedQuestions(questions.map(q => q.id));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-500">Welcome back, {profile?.name || 'Administrator'}</p>
          </div>
          <Button variant="ghost" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" /> Logout
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-indigo-50 border-indigo-100">
            <div className="flex items-center">
              <div className="p-3 bg-indigo-100 rounded-lg mr-4">
                <Users className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm text-indigo-600 font-medium">Students</p>
                <p className="text-2xl font-bold text-indigo-900">{stats.totalStudents || 0}</p>
              </div>
            </div>
          </Card>
          <Card className="bg-emerald-50 border-emerald-100">
            <div className="flex items-center">
              <div className="p-3 bg-emerald-100 rounded-lg mr-4">
                <FileText className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-emerald-600 font-medium">Exams</p>
                <p className="text-2xl font-bold text-emerald-900">{stats.totalExams || 0}</p>
              </div>
            </div>
          </Card>
          <Card className="bg-amber-50 border-amber-100">
            <div className="flex items-center">
              <div className="p-3 bg-amber-100 rounded-lg mr-4">
                <Database className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-amber-600 font-medium">Questions</p>
                <p className="text-2xl font-bold text-amber-900">{stats.questionBankSize || 0}</p>
              </div>
            </div>
          </Card>
          <Card className="bg-rose-50 border-rose-100">
            <div className="flex items-center">
              <div className="p-3 bg-rose-100 rounded-lg mr-4">
                <TrendingUp className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <p className="text-sm text-rose-600 font-medium">Results</p>
                <p className="text-2xl font-bold text-rose-900">{stats.recentResults || 0}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-8 overflow-x-auto">
          <button
            onClick={() => setActiveTab('exams')}
            className={`px-6 py-3 font-medium text-sm whitespace-nowrap transition-colors ${activeTab === 'exams' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Manage Exams
          </button>
          <button
            onClick={() => setActiveTab('questions')}
            className={`px-6 py-3 font-medium text-sm whitespace-nowrap transition-colors ${activeTab === 'questions' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Question Bank
          </button>
        </div>

        {activeTab === 'exams' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <Card title="Active & Scheduled Exams">
                <div className="space-y-4">
                  {exams.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">No exams created yet.</p>
                  ) : (
                    exams.map((exam) => (
                      <div key={exam.id} className="flex items-center justify-between p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                        <div>
                          <h4 className="font-semibold text-gray-900">{exam.title}</h4>
                          <p className="text-xs text-gray-500">
                            {exam.duration} mins • {Array.isArray(exam.questionIds) ? exam.questionIds.length : 0} questions
                          </p>
                          <p className="text-xs text-gray-400 mt-1">Scheduled: {exam.scheduledAt || 'Not set'}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button 
                            variant={exam.isActive ? 'danger' : 'primary'} 
                            size="sm"
                            onClick={() => handleToggleExam(exam.id, !!exam.isActive)}
                          >
                            {exam.isActive ? <><Square className="w-3 h-3 mr-1" /> Stop</> : <><Play className="w-3 h-3 mr-1" /> Start</>}
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => navigate(`/admin/analytics/${exam.id}`)}>
                            <BarChart2 className="w-3 h-3 mr-1" /> Analytics
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>

            <div>
              <Card title="Create New Exam">
                <div className="space-y-4">
                  <Input 
                    label="Exam Title" 
                    placeholder="DDCET26 MockTest-1" 
                    value={newExam.title}
                    onChange={(e) => setNewExam({ ...newExam, title: e.target.value })}
                  />
                  <Input 
                    label="Duration (Minutes)" 
                    type="number" 
                    value={newExam.duration}
                    onChange={(e) => setNewExam({ ...newExam, duration: parseInt(e.target.value) || 0 })}
                  />
                  <Input 
                    label="Scheduled At" 
                    type="datetime-local" 
                    value={newExam.scheduledAt}
                    onChange={(e) => setNewExam({ ...newExam, scheduledAt: e.target.value })}
                  />
                  
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-medium text-gray-700">Select Questions ({selectedQuestions.length})</label>
                      <button onClick={toggleSelectAll} className="text-xs text-indigo-600 hover:underline">
                        {selectedQuestions.length === questions.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                      {questions.length === 0 ? (
                        <p className="text-xs text-gray-500 p-2">No questions found in bank. Please upload questions first.</p>
                      ) : (
                        questions.map((q) => (
                          <label key={q.id} className="flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              className="rounded text-indigo-600 mr-3"
                              checked={selectedQuestions.includes(q.id)}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedQuestions([...selectedQuestions, q.id]);
                                else setSelectedQuestions(selectedQuestions.filter(id => id !== q.id));
                              }}
                            />
                            <span className="text-xs text-gray-700 truncate">{q.text}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>

                  <Button fullWidth onClick={handleCreateExam}>
                    <Plus className="w-4 h-4 mr-2" /> Create Exam
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'questions' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <Card title="Question Bank">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-sm text-gray-500">{questions.length} questions available</p>
                  <div className="flex flex-col items-end space-y-2">
                    <div className="flex space-x-2">
                      <label className={`cursor-pointer ${isExtracting ? 'opacity-50 pointer-events-none' : ''}`}>
                        <input type="file" className="hidden" accept=".pdf" onChange={handlePdfUpload} disabled={isExtracting} />
                        <div className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
                          {isExtracting ? (
                            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" /> Extracting...</>
                          ) : (
                            <><FileText className="w-4 h-4 mr-2" /> AI Extract (PDF)</>
                          )}
                        </div>
                      </label>
                      <label className="cursor-pointer">
                        <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleBulkUpload} />
                        <div className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">
                          <Upload className="w-4 h-4 mr-2" /> Bulk Upload (Excel)
                        </div>
                      </label>
                    </div>
                    {extractionStatus && (
                      <p className={`text-xs font-medium ${extractionStatus.startsWith('Error') ? 'text-rose-600' : extractionStatus.startsWith('Success') ? 'text-emerald-600' : 'text-indigo-600'}`}>
                        {extractionStatus}
                      </p>
                    )}
                  </div>
                </div>
                <div className="space-y-4">
                  {questions.map((q) => (
                    <div key={q.id} className="p-4 border border-gray-100 rounded-xl">
                      <div className="flex justify-between mb-2">
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded uppercase">{q.topic || 'General'}</span>
                        <span className="text-[10px] text-gray-400 font-medium uppercase">{q.difficulty}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 mb-3">{q.text}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className={`text-xs p-2 rounded ${q.correctAnswer === 'A' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-gray-50 text-gray-600'}`}>A: {q.optionA}</div>
                        <div className={`text-xs p-2 rounded ${q.correctAnswer === 'B' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-gray-50 text-gray-600'}`}>B: {q.optionB}</div>
                        <div className={`text-xs p-2 rounded ${q.correctAnswer === 'C' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-gray-50 text-gray-600'}`}>C: {q.optionC}</div>
                        <div className={`text-xs p-2 rounded ${q.correctAnswer === 'D' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-gray-50 text-gray-600'}`}>D: {q.optionD}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <div>
              <Card title="Add Single Question">
                <div className="space-y-4">
                  <Input label="Question Text" value={newQuestion.text} onChange={(e) => setNewQuestion({ ...newQuestion, text: e.target.value })} />
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="Option A" value={newQuestion.optionA} onChange={(e) => setNewQuestion({ ...newQuestion, optionA: e.target.value })} />
                    <Input label="Option B" value={newQuestion.optionB} onChange={(e) => setNewQuestion({ ...newQuestion, optionB: e.target.value })} />
                    <Input label="Option C" value={newQuestion.optionC} onChange={(e) => setNewQuestion({ ...newQuestion, optionC: e.target.value })} />
                    <Input label="Option D" value={newQuestion.optionD} onChange={(e) => setNewQuestion({ ...newQuestion, optionD: e.target.value })} />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Correct Answer</label>
                    <select 
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={newQuestion.correctAnswer}
                      onChange={(e) => setNewQuestion({ ...newQuestion, correctAnswer: e.target.value })}
                    >
                      <option value="A">Option A</option>
                      <option value="B">Option B</option>
                      <option value="C">Option C</option>
                      <option value="D">Option D</option>
                    </select>
                  </div>
                  <Input label="Topic" placeholder="Physics, Math, etc." value={newQuestion.topic} onChange={(e) => setNewQuestion({ ...newQuestion, topic: e.target.value })} />
                  <Button fullWidth onClick={handleAddQuestion}>
                    <Plus className="w-4 h-4 mr-2" /> Add Question
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
