import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { motion } from 'motion/react';
import { CheckSquare, Square as SquareIcon, FileText, Upload, Plus, BarChart2, Play, Square, LogOut, Users, Database, TrendingUp } from 'lucide-react';
import { Question, Exam } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('exams');
  const [stats, setStats] = useState<any>({});
  const [questions, setQuestions] = useState<Question[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<number[]>([]);
  const [newExam, setNewExam] = useState({ title: '', duration: 150, scheduled_at: '' });
  const [newQuestion, setNewQuestion] = useState<Partial<Question>>({
    text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_answer: 'A', topic: '', difficulty: 'Medium'
  });
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState<string | null>(null);
  const navigate = useNavigate();

  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!token) navigate('/');
    fetchStats();
    fetchQuestions();
    fetchExams();
  }, []);

  const fetchStats = async () => {
    const res = await fetch('/api/admin/stats', { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    setStats(data);
  };

  const fetchQuestions = async () => {
    const res = await fetch('/api/admin/questions', { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    setQuestions(data);
  };

  const fetchExams = async () => {
    const res = await fetch('/api/admin/exams', { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    setExams(data);
  };

  const handleCreateExam = async () => {
    if (!newExam.title || selectedQuestions.length === 0) {
      alert('Please enter a title and select at least one question.');
      return;
    }

    console.log('Sending exam data:', { ...newExam, questions: selectedQuestions });

    const res = await fetch('/api/admin/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ ...newExam, questions: selectedQuestions }),
    });
    if (res.ok) {
      alert('Exam created successfully!');
      fetchExams();
      setNewExam({ title: '', duration: 150, scheduled_at: '' });
      setSelectedQuestions([]);
    }
  };

  const handleToggleExam = async (id: number, currentStatus: boolean) => {
    const res = await fetch(`/api/admin/exams/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ is_active: !currentStatus }),
    });
    if (res.ok) fetchExams();
  };

  const handleAddQuestion = async () => {
    const res = await fetch('/api/admin/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(newQuestion),
    });
    if (res.ok) {
      alert('Question added!');
      fetchQuestions();
      setNewQuestion({ text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_answer: 'A', topic: '', difficulty: 'Medium' });
    }
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/admin/questions/bulk', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    if (res.ok) {
      const data = await res.json();
      alert(data.message);
      fetchQuestions();
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.CUSTOM_GEMINI_API_KEY;
    if (!apiKey) {
      setExtractionStatus('Error: Gemini API key not configured. Please add CUSTOM_GEMINI_API_KEY to your AI Studio environment variables.');
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

      setExtractionStatus('AI is analyzing questions (this may take a moment)...');
      const genAI = new GoogleGenAI({ apiKey });
      const response = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: 'application/pdf',
              },
            },
            { text: "Extract all multiple choice questions from this PDF. For each question, provide the text, options A, B, C, D, and the correct answer (A, B, C, or D). Also provide a topic and difficulty level (Easy, Medium, Hard). Return ONLY a JSON array." }
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
                option_a: { type: Type.STRING },
                option_b: { type: Type.STRING },
                option_c: { type: Type.STRING },
                option_d: { type: Type.STRING },
                correct_answer: { type: Type.STRING },
                topic: { type: Type.STRING },
                difficulty: { type: Type.STRING },
              },
              required: ["text", "option_a", "option_b", "option_c", "option_d", "correct_answer"]
            }
          }
        }
      });

      let text = response.text || '[]';
      // Clean markdown code blocks if present
      if (text.includes('```')) {
        text = text.replace(/```json\n?|```/g, '').trim();
      }
      
      let extractedQuestions;
      try {
        extractedQuestions = JSON.parse(text);
      } catch (e) {
        console.error('JSON Parse Error:', text);
        throw new Error('AI returned invalid data format. Please try again.');
      }
      
      if (!Array.isArray(extractedQuestions) || extractedQuestions.length === 0) {
        setExtractionStatus('No questions found in this PDF.');
        setIsExtracting(false);
        return;
      }

      setExtractionStatus(`Saving ${extractedQuestions.length} questions to database...`);
      const res = await fetch('/api/admin/questions/bulk-json', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(extractedQuestions),
      });

      const data = await res.json();
      if (res.ok) {
        setExtractionStatus(`Success: ${data.message}`);
        fetchQuestions();
        fetchStats();
      } else {
        setExtractionStatus(`Error: ${data.error || 'Failed to save questions'}`);
      }
    } catch (error: any) {
      console.error('PDF Extraction Error:', error);
      setExtractionStatus(`Error: ${error.message || 'Extraction failed'}`);
    } finally {
      setIsExtracting(false);
      // Clear status after 5 seconds
      setTimeout(() => setExtractionStatus(null), 5000);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
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
            <p className="text-gray-500">Welcome back, C-TAG Administrator</p>
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
                            {exam.duration} mins • {(() => {
                              try {
                                if (!exam.questions) return 0;
                                // Handle both stringified JSON and already parsed arrays
                                const qData = typeof exam.questions === 'string' 
                                  ? JSON.parse(exam.questions) 
                                  : exam.questions;
                                
                                if (Array.isArray(qData)) return qData.length;
                                if (typeof qData === 'object' && qData !== null) return Object.keys(qData).length;
                                return 0;
                              } catch (e) {
                                console.error('Error parsing questions for exam:', exam.id, e);
                                return 0;
                              }
                            })()} questions
                          </p>
                          <p className="text-xs text-gray-400 mt-1">Scheduled: {exam.scheduled_at || 'Not set'}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button 
                            variant={exam.is_active ? 'danger' : 'primary'} 
                            size="sm"
                            onClick={() => handleToggleExam(exam.id, !!exam.is_active)}
                          >
                            {exam.is_active ? <><Square className="w-3 h-3 mr-1" /> Stop</> : <><Play className="w-3 h-3 mr-1" /> Start</>}
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
                    value={newExam.scheduled_at}
                    onChange={(e) => setNewExam({ ...newExam, scheduled_at: e.target.value })}
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
                        <div className={`text-xs p-2 rounded ${q.correct_answer === 'A' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-gray-50 text-gray-600'}`}>A: {q.option_a}</div>
                        <div className={`text-xs p-2 rounded ${q.correct_answer === 'B' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-gray-50 text-gray-600'}`}>B: {q.option_b}</div>
                        <div className={`text-xs p-2 rounded ${q.correct_answer === 'C' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-gray-50 text-gray-600'}`}>C: {q.option_c}</div>
                        <div className={`text-xs p-2 rounded ${q.correct_answer === 'D' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-gray-50 text-gray-600'}`}>D: {q.option_d}</div>
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
                    <Input label="Option A" value={newQuestion.option_a} onChange={(e) => setNewQuestion({ ...newQuestion, option_a: e.target.value })} />
                    <Input label="Option B" value={newQuestion.option_b} onChange={(e) => setNewQuestion({ ...newQuestion, option_b: e.target.value })} />
                    <Input label="Option C" value={newQuestion.option_c} onChange={(e) => setNewQuestion({ ...newQuestion, option_c: e.target.value })} />
                    <Input label="Option D" value={newQuestion.option_d} onChange={(e) => setNewQuestion({ ...newQuestion, option_d: e.target.value })} />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Correct Answer</label>
                    <select 
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={newQuestion.correct_answer}
                      onChange={(e) => setNewQuestion({ ...newQuestion, correct_answer: e.target.value })}
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
