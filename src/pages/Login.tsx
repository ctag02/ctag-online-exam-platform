import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { motion } from 'motion/react';
import { LogIn, UserPlus } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Fetch profile to check role
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const profile = userDoc.data();
          if (profile.role === 'admin') navigate('/admin');
          else navigate('/dashboard');
        } else {
          // If profile doesn't exist for some reason, default to student
          navigate('/dashboard');
        }
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        await updateProfile(user, { displayName: name });
        
        // Determine role
        const role = email === 'ctagclub@gmail.com' || email === 'support@c-tag.online' ? 'admin' : 'student';
        
        // Create user profile in Firestore
        await setDoc(doc(db, 'users', user.uid), {
          email,
          name,
          role,
          createdAt: new Date().toISOString()
        });
        
        setIsLogin(true);
        alert('Registration successful! Please login.');
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      let message = 'An error occurred during authentication.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        message = 'Invalid email or password.';
      } else if (err.code === 'auth/email-already-in-use') {
        message = 'This email is already registered.';
      } else if (err.code === 'auth/weak-password') {
        message = 'Password should be at least 6 characters.';
      }
      setError(`${message} (${err.code || err.message || 'Unknown error'})`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-indigo-600 mb-2">C-TAG</h1>
          <p className="text-gray-600">Online Exam Platform</p>
        </div>

        <Card title={isLogin ? 'Login' : 'Register'}>
          <form onSubmit={handleSubmit}>
            {!isLogin && (
              <Input
                label="Full Name"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            )}
            <Input
              label="Email Address"
              type="email"
              placeholder="support@c-tag.online"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
            <Button type="submit" fullWidth className="mt-2" disabled={loading}>
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
              ) : (
                isLogin ? <><LogIn className="w-4 h-4 mr-2" /> Login</> : <><UserPlus className="w-4 h-4 mr-2" /> Register</>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-indigo-600 hover:underline"
            >
              {isLogin ? "Don't have an account? Register" : "Already have an account? Login"}
            </button>
          </div>
        </Card>

        <div className="mt-8 text-center text-xs text-gray-400">
          <p className="font-semibold mb-1">Demo Credentials:</p>
          <p>Admin: ctagclub@gmail.com (Register with this email)</p>
          <p>Student: palak@gmail.com (Register with this email)</p>
        </div>
      </motion.div>
    </div>
  );
}
