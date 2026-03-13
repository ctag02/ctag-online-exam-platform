import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { motion } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import { 
  Download, 
  ChevronLeft, 
  AlertTriangle, 
  Trophy, 
  Users, 
  Target, 
  TrendingDown 
} from 'lucide-react';
import * as xlsx from 'xlsx';
import { Result, WarningLog } from '../types';
import { useFirebase } from '../context/FirebaseContext';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';

export default function Analytics() {
  const { id } = useParams();
  const [data, setData] = useState<{ results: Result[], warnings: WarningLog[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useFirebase();

  useEffect(() => {
    if (!user) return;
    fetchAnalytics();
  }, [user, id]);

  const fetchAnalytics = async () => {
    if (!id) return;
    setLoading(true);
    try {
      // Fetch results
      const resultsQuery = query(
        collection(db, 'results'),
        where('exam_id', '==', id),
        orderBy('score', 'desc')
      );
      const resultsSnapshot = await getDocs(resultsQuery);
      const resultsData = resultsSnapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          ...d,
          submitted_at: d.submitted_at?.toDate?.()?.toISOString() || d.submitted_at
        };
      }) as Result[];

      // Fetch warnings
      const warningsQuery = query(
        collection(db, 'warning_logs'),
        where('exam_id', '==', id),
        orderBy('timestamp', 'desc')
      );
      const warningsSnapshot = await getDocs(warningsQuery);
      const warningsData = warningsSnapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          ...d,
          timestamp: d.timestamp?.toDate?.()?.toISOString() || d.timestamp
        };
      }) as WarningLog[];

      setData({ results: resultsData, warnings: warningsData });
    } catch (err) {
      console.error("Error fetching analytics:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!data) return;
    
    const exportData = data.results.map((r, idx) => ({
      Rank: idx + 1,
      'Student Name': r.student_name,
      'Obtained Marks': r.score,
      'Correct Answers': r.correct_count,
      'Wrong Answers': r.wrong_count,
      'Skipped Questions': r.skipped_count,
      'Total Wrong Topics': r.wrong_topics_count,
      'Total Skipped Topics': r.skipped_topics_count,
      'Wrong Topics List': r.wrong_topics_list,
      'Skipped Topics List': r.skipped_topics_list,
      'Submission Time': new Date(r.submitted_at).toLocaleString()
    }));

    const ws = xlsx.utils.json_to_sheet(exportData);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Results');
    xlsx.writeFile(wb, `Exam_Results_${id}.xlsx`);
  };

  if (loading || !data) return <div className="min-h-screen flex items-center justify-center">Loading analytics...</div>;

  const totalStudents = data.results.length;
  const avgScore = totalStudents > 0 ? (data.results.reduce((acc, r) => acc + r.score, 0) / totalStudents).toFixed(1) : '0.0';
  const highestScore = totalStudents > 0 ? Math.max(...data.results.map(r => r.score)) : 0;
  const topStudent = data.results[0]?.student_name || 'N/A';

  // Chart Data: Score Distribution
  const scoreRanges = [
    { range: '0-20', count: 0 },
    { range: '21-40', count: 0 },
    { range: '41-60', count: 0 },
    { range: '61-80', count: 0 },
    { range: '81-100', count: 0 },
  ];

  data.results.forEach(r => {
    if (r.score <= 20) scoreRanges[0].count++;
    else if (r.score <= 40) scoreRanges[1].count++;
    else if (r.score <= 60) scoreRanges[2].count++;
    else if (r.score <= 80) scoreRanges[3].count++;
    else scoreRanges[4].count++;
  });

  const COLORS = ['#F43F5E', '#F59E0B', '#3B82F6', '#8B5CF6', '#10B981'];

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center">
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin')} className="mr-4">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Exam Analytics</h1>
              <p className="text-sm text-gray-500">In-depth performance insights for C-TAG students</p>
            </div>
          </div>
          <Button variant="primary" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" /> Export to Excel
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-white">
            <div className="flex items-center">
              <div className="p-3 bg-indigo-100 rounded-lg mr-4">
                <Users className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Total Students</p>
                <p className="text-2xl font-bold text-gray-900">{totalStudents}</p>
              </div>
            </div>
          </Card>
          <Card className="bg-white">
            <div className="flex items-center">
              <div className="p-3 bg-emerald-100 rounded-lg mr-4">
                <Target className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Average Score</p>
                <p className="text-2xl font-bold text-gray-900">{avgScore}</p>
              </div>
            </div>
          </Card>
          <Card className="bg-white">
            <div className="flex items-center">
              <div className="p-3 bg-amber-100 rounded-lg mr-4">
                <Trophy className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Highest Score</p>
                <p className="text-2xl font-bold text-gray-900">{highestScore}</p>
                <p className="text-[10px] text-gray-400 truncate">{topStudent}</p>
              </div>
            </div>
          </Card>
          <Card className="bg-white">
            <div className="flex items-center">
              <div className="p-3 bg-rose-100 rounded-lg mr-4">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Proctoring Alerts</p>
                <p className="text-2xl font-bold text-gray-900">{data.warnings.length}</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <Card title="Score Distribution">
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoreRanges}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="range" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {scoreRanges.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Proctoring Warning Logs">
            <div className="max-h-80 overflow-y-auto space-y-3">
              {data.warnings.length === 0 ? (
                <p className="text-center text-gray-400 py-12 italic">No security violations detected.</p>
              ) : (
                data.warnings.map((log) => (
                  <div key={log.id} className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-start">
                    <AlertTriangle className="w-4 h-4 text-rose-600 mr-3 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-rose-900">{log.student_name}</p>
                      <p className="text-[10px] text-rose-700 font-medium uppercase tracking-wider mb-1">{log.type}</p>
                      <p className="text-xs text-rose-600 leading-relaxed">{log.message}</p>
                      <p className="text-[10px] text-rose-400 mt-1">{new Date(log.timestamp).toLocaleTimeString()}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        <Card title="Student Leaderboard">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Rank</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Student</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Score</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Correct</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Wrong</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Skipped</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Wrong Topics</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Skipped Topics</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((r, idx) => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-4">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        idx === 0 ? 'bg-amber-100 text-amber-700' : 
                        idx === 1 ? 'bg-gray-200 text-gray-700' : 
                        idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-400'
                      }`}>
                        {idx + 1}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm font-bold text-gray-900">{r.student_name}</p>
                      <p className="text-[10px] text-gray-400">{r.student_email}</p>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-sm font-black text-indigo-600">{r.score}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-xs font-bold text-emerald-600">{r.correct_count}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-xs font-bold text-rose-600">{r.wrong_count}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-xs font-bold text-amber-600">{r.skipped_count}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-xs font-bold text-rose-400">{r.wrong_topics_count}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-xs font-bold text-amber-400">{r.skipped_topics_count}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
