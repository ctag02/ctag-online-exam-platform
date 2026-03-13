import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { motion } from 'motion/react';
import { LogIn, UserPlus } from 'lucide-react';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const endpoint = isLogin ? '/api/login' : '/api/register';
    const body = isLogin ? { email, password } : { email, password, name };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        if (isLogin) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          if (data.user.role === 'admin') navigate('/admin');
          else navigate('/dashboard');
        } else {
          setIsLogin(true);
          alert('Registration successful! Please login.');
        }
      } else {
        const text = await res.text();
        throw new Error(`Server Error: ${text.substring(0, 100)}...`);
      }
    } catch (err: any) {
      setError(err.message);
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
            <Button type="submit" fullWidth className="mt-2">
              {isLogin ? <><LogIn className="w-4 h-4 mr-2" /> Login</> : <><UserPlus className="w-4 h-4 mr-2" /> Register</>}
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
          <p>Admin: support@c-tag.online (Pass: TE@M4ctag)</p>
          <p>Student: palak@gmail.com (Pass: student123)</p>
        </div>
      </motion.div>
    </div>
  );
}
