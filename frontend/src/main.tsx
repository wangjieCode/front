import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from './App';
import { LoginPage } from './pages/LoginPage';
import { ProjectSelectPage } from './pages/ProjectSelectPage';
import { ConversationTestPage } from './pages/ConversationTestPage';
import { authService } from './services/authService';
import 'antd/dist/reset.css';

// 受保护的路由组件
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!authService.isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/select-project"
          element={
            <ProtectedRoute>
              <ProjectSelectPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/conversation-test"
          element={
            <ProtectedRoute>
              <ConversationTestPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <App />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
