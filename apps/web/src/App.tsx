import { Navigate, Route, Routes } from 'react-router-dom';
import { homePathFor, useAuth } from './auth/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import { Layout } from './components/Layout';
import { Agenda } from './pages/Agenda';
import { Indicators } from './pages/Indicators';
import { LeadDetail } from './pages/LeadDetail';
import { Leads } from './pages/Leads';
import { Login } from './pages/Login';
import { Notifications } from './pages/Notifications';
import { ScoreSettings } from './pages/ScoreSettings';

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? homePathFor(user) : '/entrar'} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/entrar" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route
          path="/pontuacao"
          element={
            <RequireAuth role="OWNER">
              <ScoreSettings />
            </RequireAuth>
          }
        />
        <Route path="/leads" element={<Leads />} />
        <Route path="/leads/:id" element={<LeadDetail />} />
        <Route path="/agenda" element={<Agenda />} />
        <Route
          path="/indicadores"
          element={
            <RequireAuth role="OWNER">
              <Indicators />
            </RequireAuth>
          }
        />
        <Route path="/notificacoes" element={<Notifications />} />
      </Route>
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
