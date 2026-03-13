import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  AlertTriangle, 
  Camera, 
  CheckCircle2, 
  Menu, 
  X 
} from 'lucide-react';
import { Question, Exam, Result, WarningLog } from '../types';
import { useFirebase } from '../context/FirebaseContext';
import { doc, getDoc, collection, addDoc, serverTimestamp, setDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

export default function ExamEngine() {
  const { id } = useParams();
  const [exam, setExam] = useState<Exam & { questions: Question[] } | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [showNavigator, setShowNavigator] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [result, setResult] = useState<any>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const navigate = useNavigate();
  const { user, profile } = useFirebase();

  useEffect(() => {
    if (!user) return;
    fetchExam();
    setupProctoring();
    
    const handleVisibilityChange = () => {
      if (document.hidden) {
        logWarning('Tab Switch', 'Student attempted to switch tabs or minimize browser.');
        setWarning('CRITICAL ALERT: Tab switching detected. This activity has been logged.');
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopCamera();
    };
  }, [user]);

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0 && exam && !isFinished) {
      handleSubmit(true);
    }
  }, [timeLeft, exam, isFinished]);

  const fetchExam = async () => {
    if (!id || !user) return;
    try {
      const examDoc = await getDoc(doc(db, 'exams', id));
      if (!examDoc.exists()) {
        alert('Exam not found');
        navigate('/dashboard');
        return;
      }
      const examData = examDoc.data() as Exam;
      
      // Fetch questions
      let questionIds: string[] = [];
      if (Array.isArray(examData.questions)) {
        questionIds = examData.questions;
      } else if (typeof examData.questions === 'string') {
        try {
          questionIds = JSON.parse(examData.questions);
        } catch (e) {
          questionIds = [];
        }
      }

      if (questionIds.length === 0) {
        alert('This exam has no questions.');
        navigate('/dashboard');
        return;
      }

      const questionsData: Question[] = [];
      for (let i = 0; i < questionIds.length; i += 10) {
        const chunk = questionIds.slice(i, i + 10);
        const qQuery = query(collection(db, 'questions'), where('__name__', 'in', chunk));
        const qSnapshot = await getDocs(qQuery);
        qSnapshot.forEach(doc => {
          questionsData.push({ id: doc.id, ...doc.data() } as Question);
        });
      }

      const sortedQuestions = questionIds.map(qid => questionsData.find(q => q.id === qid)).filter(Boolean) as Question[];

      setExam({ ...examData, questions: sortedQuestions });
      setTimeLeft((examData.duration || 0) * 60);

      // Fetch existing responses
      const responsesQuery = query(
        collection(db, 'responses'),
        where('user_id', '==', user.uid),
        where('exam_id', '==', id)
      );
      const responsesSnapshot = await getDocs(responsesQuery);
      const existingAnswers: Record<string, string> = {};
      responsesSnapshot.forEach(doc => {
        const data = doc.data();
        existingAnswers[data.question_id] = data.answer;
      });
      setAnswers(existingAnswers);

    } catch (err) {
      console.error(err);
      alert('Failed to load exam. Please try again.');
      navigate('/dashboard');
    }
  };

  const setupProctoring = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) videoRef.current.srcObject = stream;
      
      const interval = setInterval(() => {
        if (Math.random() > 0.98) {
          logWarning('Movement', 'Repeated head movement away from screen detected.');
        }
      }, 10000);
      return () => clearInterval(interval);
    } catch (err) {
      console.error('Camera access denied', err);
      logWarning('Camera', 'Student denied camera access or camera is missing.');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const logWarning = async (type: string, message: string) => {
    if (!user || !id) return;
    try {
      await addDoc(collection(db, 'warning_logs'), {
        user_id: user.uid,
        exam_id: id,
        type,
        message,
        timestamp: serverTimestamp(),
        student_name: profile?.name || user.email
      });
    } catch (e) {
      console.error("Error logging warning:", e);
    }
  };

  const handleAnswer = async (questionId: string, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
    if (!user || !id) return;
    try {
      const responseId = `${user.uid}_${id}_${questionId}`;
      await setDoc(doc(db, 'responses', responseId), {
        user_id: user.uid,
        exam_id: id,
        question_id: questionId,
        answer,
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error("Error saving response:", e);
    }
  };

  const handleSubmit = async (auto = false) => {
    if (!auto && !showSubmitModal) {
      setShowSubmitModal(true);
      return;
    }
    
    if (!user || !id || !exam) return;

    setIsSubmitting(true);
    try {
      let correct = 0;
      let wrong = 0;
      let skipped = 0;
      const wrongTopics: Record<string, number> = {};
      const skippedTopics: Record<string, number> = {};

      exam.questions.forEach(q => {
        const studentAnswer = answers[q.id];
        if (!studentAnswer) {
          skipped++;
          skippedTopics[q.topic] = (skippedTopics[q.topic] || 0) + 1;
        } else if (studentAnswer === q.correct_answer) {
          correct++;
        } else {
          wrong++;
          wrongTopics[q.topic] = (wrongTopics[q.topic] || 0) + 1;
        }
      });

      const score = correct;

      const resultData = {
        user_id: user.uid,
        exam_id: id,
        score,
        correct_count: correct,
        wrong_count: wrong,
        skipped_count: skipped,
        exam_title: exam.title,
        student_name: profile?.name || user.email || '',
        student_email: user.email || '',
        skipped_topics_count: Object.keys(skippedTopics).length,
        wrong_topics_count: Object.keys(wrongTopics).length,
        skipped_topics_list: Object.keys(skippedTopics).join(', '),
        wrong_topics_list: Object.keys(wrongTopics).join(', ')
      };

      await addDoc(collection(db, 'results'), {
        ...resultData,
        submitted_at: serverTimestamp()
      });

      setResult({
        score,
        correct,
        wrong,
        skipped
      });
      setIsFinished(true);
      stopCamera();
    } catch (err) {
      console.error(err);
      alert('Error during submission. Please try again.');
    } finally {
      setIsSubmitting(false);
      setShowSubmitModal(false);
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!exam) return <div className="min-h-screen flex items-center justify-center">Loading exam...</div>;

  if (isFinished) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-md">
          <Card className="text-center py-12">
            <div className="flex flex-col items-center">
              <div className="p-4 bg-emerald-100 rounded-full mb-6">
                <CheckCircle2 className="w-12 h-12 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Exam Submitted!</h2>
              <p className="text-gray-500 mb-8">Your responses have been recorded successfully.</p>
              
              <div className="w-full bg-indigo-50 rounded-2xl p-6 mb-8">
                <p className="text-xs text-indigo-600 font-bold uppercase tracking-widest mb-1">Your Score</p>
                <p className="text-5xl font-black text-indigo-700">{result?.score}</p>
                <div className="grid grid-cols-3 gap-4 mt-6">
                  <div>
                    <p className="text-lg font-bold text-emerald-600">{result?.correct}</p>
                    <p className="text-[10px] text-gray-400 uppercase">Correct</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-rose-600">{result?.wrong}</p>
                    <p className="text-[10px] text-gray-400 uppercase">Wrong</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-amber-600">{result?.skipped}</p>
                    <p className="text-[10px] text-gray-400 uppercase">Skipped</p>
                  </div>
                </div>
              </div>
              
              <Button fullWidth onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  const currentQuestion = exam.questions[currentIdx];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-30 flex justify-between items-center">
        <div className="flex items-center">
          <Button variant="ghost" size="sm" onClick={() => setShowNavigator(true)}>
            <Menu className="w-5 h-5" />
          </Button>
          <div className="ml-3">
            <h1 className="text-sm font-bold text-gray-900 truncate max-w-[150px] md:max-w-none">{exam.title}</h1>
            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Q {currentIdx + 1} of {exam.questions.length}</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className={`flex items-center px-3 py-1.5 rounded-full font-mono text-sm font-bold ${timeLeft < 300 ? 'bg-rose-100 text-rose-600 animate-pulse' : 'bg-indigo-50 text-indigo-600'}`}>
            <Clock className="w-4 h-4 mr-2" />
            {formatTime(timeLeft)}
          </div>
          <Button size="sm" variant="primary" onClick={() => handleSubmit()} disabled={isSubmitting}>
            Submit
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Proctoring Feed (Mini) */}
          <div className="fixed bottom-4 right-4 w-24 h-32 md:w-32 md:h-40 bg-black rounded-xl border-2 border-white shadow-xl overflow-hidden z-40">
            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            <div className="absolute top-1 right-1">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            </div>
            <div className="absolute bottom-1 left-1 flex items-center text-[8px] text-white/70 font-bold uppercase">
              <Camera className="w-2 h-2 mr-1" /> AI Live
            </div>
          </div>

          {/* Left Column: Question */}
          <div className="lg:col-span-3">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentIdx}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="mb-8">
                  <div className="mb-6">
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded uppercase mb-2 inline-block">
                      {currentQuestion.topic || 'General'}
                    </span>
                    <h2 className="text-lg md:text-xl font-medium text-gray-900 leading-relaxed">
                      {currentQuestion.text}
                    </h2>
                  </div>

                  <div className="space-y-3">
                    {['A', 'B', 'C', 'D'].map((opt) => {
                      const optionKey = `option_${opt.toLowerCase()}` as keyof Question;
                      const isSelected = answers[currentQuestion.id] === opt;
                      return (
                        <button
                          key={opt}
                          onClick={() => handleAnswer(currentQuestion.id, opt)}
                          className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-center group ${
                            isSelected 
                              ? 'border-indigo-600 bg-indigo-50 text-indigo-700' 
                              : 'border-gray-100 hover:border-indigo-200 hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold mr-4 transition-colors ${
                            isSelected ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 group-hover:bg-indigo-100 group-hover:text-indigo-600'
                          }`}>
                            {opt}
                          </div>
                          <span className="text-sm md:text-base">{currentQuestion[optionKey] as string}</span>
                        </button>
                      );
                    })}
                  </div>
                </Card>
              </motion.div>
            </AnimatePresence>

            {/* Navigation Buttons */}
            <div className="flex justify-between items-center mt-4">
              <Button 
                variant="secondary" 
                onClick={() => setCurrentIdx(prev => Math.max(0, prev - 1))}
                disabled={currentIdx === 0}
              >
                <ChevronLeft className="w-4 h-4 mr-2" /> Previous
              </Button>
              <Button 
                variant="primary" 
                onClick={() => {
                  if (currentIdx < exam.questions.length - 1) setCurrentIdx(prev => prev + 1);
                  else handleSubmit();
                }}
              >
                {currentIdx === exam.questions.length - 1 ? 'Final Submit' : 'Next'} <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>

          {/* Right Column: Pallet (Desktop only) */}
          <div className="hidden lg:block">
            <Card title="Question Pallet" className="sticky top-24">
              <div className="grid grid-cols-5 gap-2">
                {exam.questions.map((q, idx) => {
                  const isAnswered = !!answers[q.id];
                  const isCurrent = currentIdx === idx;
                  return (
                    <button
                      key={q.id}
                      onClick={() => setCurrentIdx(idx)}
                      className={`h-10 rounded-lg text-xs font-bold transition-all ${
                        isCurrent 
                          ? 'bg-indigo-600 text-white ring-2 ring-indigo-300' 
                          : isAnswered 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
              
              <div className="mt-6 pt-6 border-t border-gray-100 space-y-2">
                <div className="flex items-center text-[10px] text-gray-500">
                  <div className="w-2 h-2 bg-indigo-600 rounded mr-2" /> Current
                </div>
                <div className="flex items-center text-[10px] text-gray-500">
                  <div className="w-2 h-2 bg-emerald-100 rounded mr-2" /> Answered
                </div>
                <div className="flex items-center text-[10px] text-gray-500">
                  <div className="w-2 h-2 bg-gray-100 rounded mr-2" /> Not Answered
                </div>
              </div>
            </Card>
          </div>
        </div>
      </main>

      {/* Question Navigator Drawer */}
      <AnimatePresence>
        {showNavigator && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setShowNavigator(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" 
            />
            <motion.div 
              initial={{ x: '-100%' }} 
              animate={{ x: 0 }} 
              exit={{ x: '-100%' }}
              className="fixed inset-y-0 left-0 w-72 bg-white shadow-2xl z-50 p-6 flex flex-col"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-gray-900">Question Navigator</h3>
                <button onClick={() => setShowNavigator(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              
              <div className="grid grid-cols-5 gap-2 overflow-y-auto flex-1">
                {exam.questions.map((q, idx) => {
                  const isAnswered = !!answers[q.id];
                  const isCurrent = currentIdx === idx;
                  return (
                    <button
                      key={q.id}
                      onClick={() => {
                        setCurrentIdx(idx);
                        setShowNavigator(false);
                      }}
                      className={`h-10 rounded-lg text-xs font-bold transition-all ${
                        isCurrent 
                          ? 'bg-indigo-600 text-white ring-2 ring-indigo-300' 
                          : isAnswered 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              <div className="mt-8 pt-6 border-t border-gray-100 space-y-3">
                <div className="flex items-center text-xs text-gray-500">
                  <div className="w-3 h-3 bg-indigo-600 rounded mr-2" /> Current Question
                </div>
                <div className="flex items-center text-xs text-gray-500">
                  <div className="w-3 h-3 bg-emerald-100 rounded mr-2" /> Answered
                </div>
                <div className="flex items-center text-xs text-gray-500">
                  <div className="w-3 h-3 bg-gray-100 rounded mr-2" /> Not Answered
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Warning Overlay */}
      <AnimatePresence>
        {warning && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-rose-600/90 backdrop-blur-md z-[100] flex items-center justify-center p-8 text-center"
          >
            <div className="max-w-md">
              <div className="bg-white/20 p-4 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                <AlertTriangle className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-3xl font-black text-white mb-4">PROCTORING ALERT</h2>
              <p className="text-white/90 text-lg mb-8 leading-relaxed">{warning}</p>
              <Button 
                variant="secondary" 
                size="lg" 
                className="bg-white text-rose-600 border-none hover:bg-gray-100"
                onClick={() => setWarning(null)}
              >
                I Understand, Return to Exam
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit Confirmation Modal */}
      <AnimatePresence>
        {showSubmitModal && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm"
            >
              <Card className="text-center p-8">
                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-indigo-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Ready to Submit?</h3>
                <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                  You have answered {Object.keys(answers).length} out of {exam.questions.length} questions. Once submitted, you cannot change your answers.
                </p>
                <div className="space-y-3">
                  <Button fullWidth onClick={() => handleSubmit(true)} disabled={isSubmitting}>
                    {isSubmitting ? 'Submitting...' : 'Yes, Submit Exam'}
                  </Button>
                  <Button fullWidth variant="secondary" onClick={() => setShowSubmitModal(false)} disabled={isSubmitting}>
                    Cancel
                  </Button>
                </div>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
