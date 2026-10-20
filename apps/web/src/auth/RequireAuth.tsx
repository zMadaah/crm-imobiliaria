import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { UserRole } from '../lib/types';
import { homePathFor, useAuth } from './AuthContext';

export function RequireAuth({ children, role }: { children: ReactNode; role?: UserRole }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="p-8 text-muted">Carregando…</p>;
  if (!user) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  if (role && user.role !== role) return <Navigate to={homePathFor(user)} replace />;
  return <>{children}</>;
}
