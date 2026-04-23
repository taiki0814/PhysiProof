import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import client from './lib/hc';
import TestPage from './pages/TestPage';

/**
 * Minimal React bootstrap.
 * For larger projects, consider moving the App component to its own file.
 */
const App = () => {
  const [status, setStatus] = useState('Loading...');

  useEffect(() => {
    client.api.hello.$get()
      .then(res => res.json())
      .then(data => setStatus(data.message))
      .catch(() => setStatus('Backend Offline'));
  }, []);

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', textAlign: 'center' }}>
      <h1>Monorepo Starter Kit</h1>
      <p>Backend Status: <strong>{status}</strong></p>
      <div style={{ marginTop: '2rem' }}>
        <Link to="/test" style={{ color: 'blue', textDecoration: 'underline' }}>
          テストページへ移動
        </Link>
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/test" element={<TestPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
