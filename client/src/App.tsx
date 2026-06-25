import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { LoadingSkeleton } from './components/LoadingSkeleton';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Assets } from './pages/Assets';
import { Users } from './pages/Users';
import { Authorizations } from './pages/Authorizations';
import { AuditLog } from './pages/AuditLog';
import { TerminalShell } from './pages/TerminalShell';
import { SessionReplay } from './pages/SessionReplay';
import { ActiveSessions } from './pages/ActiveSessions';
import { Profile } from './pages/Profile';
import { ForcePasswordChange } from './pages/ForcePasswordChange';
import { SecuritySettings } from './pages/SecuritySettings';
import { NotFound } from './pages/NotFound';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, _hasHydrated } = useAuthStore();

  if (!_hasHydrated) {
    return <LoadingSkeleton fullScreen />;
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, _hasHydrated } = useAuthStore();

  if (!_hasHydrated) {
    return <LoadingSkeleton fullScreen />;
  }

  if (!user || user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

const ComplianceRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, _hasHydrated } = useAuthStore();

  if (!_hasHydrated) {
    return <LoadingSkeleton fullScreen />;
  }

  if (!user || (user.role !== 'admin' && user.role !== 'auditor')) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

function App() {
  const _hasHydrated = useAuthStore((s) => s._hasHydrated);

  if (!_hasHydrated) {
    return <LoadingSkeleton fullScreen text="启动中..." />;
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/force-change-password" element={<ProtectedRoute><ForcePasswordChange /></ProtectedRoute>} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="terminal" element={<Navigate to="/terminal/ssh" replace />} />
            <Route path="terminal/ssh" element={<TerminalShell />} />
            <Route path="terminal/rdp" element={<TerminalShell />} />
            <Route path="profile" element={<Profile />} />

            <Route path="replay" element={<ComplianceRoute><SessionReplay /></ComplianceRoute>} />
            <Route path="replay/:id" element={<ComplianceRoute><SessionReplay /></ComplianceRoute>} />

            <Route path="assets" element={<AdminRoute><Assets /></AdminRoute>} />
            <Route path="users" element={<AdminRoute><Users /></AdminRoute>} />
            <Route path="authorizations" element={<AdminRoute><Authorizations /></AdminRoute>} />
            <Route path="sessions" element={<AdminRoute><ActiveSessions /></AdminRoute>} />
            <Route path="security" element={<AdminRoute><SecuritySettings /></AdminRoute>} />

            <Route path="audit" element={<ComplianceRoute><AuditLog /></ComplianceRoute>} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
