import './index.css';
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import DevMenu from './pages/DevMenu';
import Dashboard from './pages/Dashboard';
import LoginPage from './pages/LoginPage';
import HealthCheck from './pages/HealthCheck';
import AdminDashboard from './pages/AdminDashboard';
import client from './lib/hc';

const OnlineRequiredGate = ({ children }: { children: React.ReactNode }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let disposed = false;
    let requestPending = false;

    const checkConnection = async () => {
      if (requestPending || disposed) return;
      if (!navigator.onLine) {
        setIsConnected(false);
        setIsChecking(false);
        return;
      }
      requestPending = true;
      try {
        const response = await client.api.health.$get();
        if (!response.ok) throw new Error('API unavailable');
        const uid = localStorage.getItem('physiproof_test_uid');
        const abandonedSessionId = uid ? localStorage.getItem(`physiproof_run_session_id_${uid}`) : null;
        if (uid && abandonedSessionId && localStorage.getItem(`physiproof_run_is_tracking_${uid}`) !== 'true') {
          await client.api.running.sessions[':id'].$delete({ param: { id: abandonedSessionId } }).catch(() => undefined);
          localStorage.removeItem(`physiproof_run_session_id_${uid}`);
        }
        if (!disposed) {
          setIsConnected(true);
          setIsChecking(false);
        }
      } catch {
        if (!disposed) {
          setIsConnected(false);
          setIsChecking(false);
        }
      } finally {
        requestPending = false;
      }
    };

    const handleOffline = () => {
      setIsConnected(false);
      setIsChecking(false);
      const uid = localStorage.getItem('physiproof_test_uid');
      if (uid) {
        localStorage.removeItem(`physiproof_run_is_tracking_${uid}`);
        localStorage.removeItem(`physiproof_run_route_${uid}`);
        localStorage.removeItem(`physiproof_run_start_time_${uid}`);
        localStorage.removeItem(`physiproof_run_distance_${uid}`);
      }
    };
    const handleOnline = () => { void checkConnection(); };

    void checkConnection();
    const interval = window.setInterval(() => { void checkConnection(); }, 30_000);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (isConnected) return <>{children}</>;
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem', boxSizing: 'border-box', background: '#070b12', color: '#fff', textAlign: 'center' }}>
      <div style={{ maxWidth: '420px' }}>
        <div style={{ fontSize: '2.5rem' }}>🌐</div>
        <h1 style={{ fontSize: '1.2rem' }}>{isChecking ? 'オンライン接続を確認中…' : 'オンライン接続が必要です'}</h1>
        <p style={{ color: '#aab2c0', lineHeight: 1.7, fontSize: '0.9rem' }}>
          PhysiProofは走行の記録と領域の更新にオンライン通信を使います。接続を確認してから再読み込みしてください。オフライン中の記録は保存・後送されません。
        </p>
        <button onClick={() => window.location.reload()} style={{ marginTop: '0.5rem', padding: '0.7rem 1.2rem', border: 0, borderRadius: '10px', background: '#00d4ff', color: '#001015', fontWeight: 800, cursor: 'pointer' }}>再読み込み</button>
      </div>
    </div>
  );
};

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
        <OnlineRequiredGate>
          <Routes>
            <Route path="/" element={<Root />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<AuthGuard><Dashboard /></AuthGuard>} />
            <Route path="/admin" element={<AdminGuard><AdminDashboard /></AdminGuard>} />
            <Route path="/dev-menu" element={<DevMenu />} />
            <Route path="/health-check" element={<HealthCheck />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </OnlineRequiredGate>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
