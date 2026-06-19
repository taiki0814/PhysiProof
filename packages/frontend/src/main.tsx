import './index.css';
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import DevMenu from './pages/DevMenu';
import Dashboard from './pages/Dashboard';
import LoginPage from './pages/LoginPage';
import HealthCheck from './pages/HealthCheck';
import AdminDashboard from './pages/AdminDashboard';

// エラー境界（簡易版）
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', color: 'red', backgroundColor: '#000', minHeight: '100vh' }}>
          <h1>Something went wrong.</h1>
          <pre>{this.state.error?.toString()}</pre>
          <button onClick={() => { localStorage.clear(); window.location.href = '/'; }}>Clear Cache & Restart</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const user = localStorage.getItem('physiproof_user');
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const AdminGuard = ({ children }: { children: React.ReactNode }) => {
  const user = localStorage.getItem('physiproof_user');
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  try {
    const parsed = JSON.parse(user);
    if (parsed.role !== 'admin') {
      return <Navigate to="/dashboard" replace />;
    }
  } catch (e) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const Root = () => {
  const user = localStorage.getItem('physiproof_user');
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  try {
    const parsed = JSON.parse(user);
    if (parsed.role === 'admin') {
      return <Navigate to="/admin" replace />;
    }
  } catch (e) {
    // ignore
  }
  return <Navigate to="/dashboard" replace />;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Root />} />
          <Route path="/login" element={<LoginPage />} />
          <Route 
            path="/dashboard" 
            element={
              <AuthGuard>
                <Dashboard />
              </AuthGuard>
            } 
          />
          <Route 
            path="/admin" 
            element={
              <AdminGuard>
                <AdminDashboard />
              </AdminGuard>
            } 
          />
          <Route path="/dev-menu" element={<DevMenu />} />
          <Route path="/health-check" element={<HealthCheck />} />
          {/* 404 Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
