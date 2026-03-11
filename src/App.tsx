import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import StudentDashboard from './pages/StudentDashboard';
import ExamEngine from './pages/ExamEngine';
import Analytics from './pages/Analytics';

function PrivateRoute({ children, role }: { children: React.ReactNode, role?: string }) {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  if (!token) return <Navigate to="/" />;
  if (role && user.role !== role) return <Navigate to="/" />;

  return <>{children}</>;
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        
        {/* Admin Routes */}
        <Route path="/admin" element={
          <PrivateRoute role="admin">
            <AdminDashboard />
          </PrivateRoute>
        } />
        <Route path="/admin/analytics/:id" element={
          <PrivateRoute role="admin">
            <Analytics />
          </PrivateRoute>
        } />

        {/* Student Routes */}
        <Route path="/dashboard" element={
          <PrivateRoute role="student">
            <StudentDashboard />
          </PrivateRoute>
        } />
        <Route path="/exam/:id" element={
          <PrivateRoute role="student">
            <ExamEngine />
          </PrivateRoute>
        } />
      </Routes>
    </Router>
  );
}
