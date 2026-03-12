import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { motion } from 'motion/react';
import { 
  Play, 
  CheckCircle, 
  Clock, 
  LogOut, 
  RefreshCw, 
  Award, 
  ChevronRight,
  FileText
} from 'lucide-react';
import { Exam, Result } from '../types';

export default function StudentDashboard() {
  const [activeExams, setActiveExams] = useState<Exam[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const token = localStorage.getItem('token');
  let user: any = {};
  try {
    user = JSON.parse(localStorage.getItem('user') || '{}');
  } catch (e) {
    user = {};
  }

  useEffect(() => {
    if (!token) navigate('/');
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [examsRes, resultsRes] = await Promise.all([
        fetch('/api/student/exams', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/student/results', { headers: { 'Authorization': `Bearer ${token}` } })
      ]);
      const examsData = await examsRes.json();
      const resultsData = await resultsRes.json();
      setActiveExams(examsData);
      setResults(resultsData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Welcome, {user.name}</h1>
            <p className="text-sm text-gray-500">Student ID: #{user.id}</p>
          </div>
          <div className="flex space-x-2">
            <Button variant="ghost" size="sm" onClick={fetchData}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Play className="w-4 h-4 mr-2 text-indigo-600" /> Active Mock Tests
              </h2>
              {activeExams.length === 0 ? (
                <Card className="text-center py-12">
                  <div className="flex flex-col items-center">
                    <div className="p-4 bg-gray-100 rounded-full mb-4">
                      <Clock className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-gray-500 font-medium">No active exams at the moment.</p>
                    <p className="text-xs text-gray-400 mt-1">Please wait for the administrator to start an exam or click refresh.</p>
                  </div>
                </Card>
              ) : (
                <div className="space-y-4">
                  {activeExams.map((exam) => (
                    <motion.div
                      key={exam.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                    >
                      <Card className="hover:border-indigo-200 transition-all cursor-pointer group" onClick={() => navigate(`/exam/${exam.id}`)}>
                        <div className="flex justify-between items-center">
                          <div>
                            <h3 className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">{exam.title}</h3>
                            <div className="flex items-center text-xs text-gray-500 mt-1 space-x-3">
                              <span className="flex items-center"><Clock className="w-3 h-3 mr-1" /> {exam.duration} mins</span>
                              <span className="flex items-center"><FileText className="w-3 h-3 mr-1" /> MCQ Format</span>
                            </div>
                          </div>
                          <Button size="sm" className="group-hover:scale-105 transition-transform">
                            Start <ChevronRight className="w-4 h-4 ml-1" />
                          </Button>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <CheckCircle className="w-4 h-4 mr-2 text-emerald-600" /> Recent Results
              </h2>
              {results.length === 0 ? (
                <p className="text-sm text-gray-400 italic">You haven't completed any exams yet.</p>
              ) : (
                <div className="space-y-4">
                  {results.slice().reverse().map((result) => (
                    <Card key={result.id} className="bg-white border-l-4 border-l-emerald-500">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-gray-900">{result.exam_title}</h4>
                          <p className="text-xs text-gray-500 mt-1">Submitted: {new Date(result.submitted_at).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-indigo-600">{result.score}</p>
                          <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Obtained Marks</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-gray-50">
                        <div className="text-center">
                          <p className="text-xs font-bold text-emerald-600">{result.correct_count}</p>
                          <p className="text-[10px] text-gray-400 uppercase">Correct</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-bold text-rose-600">{result.wrong_count}</p>
                          <p className="text-[10px] text-gray-400 uppercase">Wrong</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-bold text-amber-600">{result.skipped_count}</p>
                          <p className="text-[10px] text-gray-400 uppercase">Skipped</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="space-y-6">
            <Card className="bg-indigo-600 text-white border-none">
              <div className="flex flex-col items-center text-center py-4">
                <div className="p-3 bg-white/20 rounded-full mb-4">
                  <Award className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-bold">C-TAG Performance</h3>
                <p className="text-indigo-100 text-sm mt-2">Keep practicing to improve your mock test scores!</p>
              </div>
            </Card>

            <Card title="Exam Guidelines">
              <ul className="text-xs text-gray-600 space-y-3">
                <li className="flex items-start">
                  <span className="w-4 h-4 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 mt-0.5">1</span>
                  Ensure a stable internet connection before starting.
                </li>
                <li className="flex items-start">
                  <span className="w-4 h-4 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 mt-0.5">2</span>
                  Camera access is mandatory for AI proctoring.
                </li>
                <li className="flex items-start">
                  <span className="w-4 h-4 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 mt-0.5">3</span>
                  Do not switch tabs or minimize the browser.
                </li>
                <li className="flex items-start">
                  <span className="w-4 h-4 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 mt-0.5">4</span>
                  Exams will auto-submit when the timer expires.
                </li>
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
