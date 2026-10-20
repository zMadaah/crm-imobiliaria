import { BarChart3, Bell, CalendarDays, LogOut, SlidersHorizontal, Users } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { HotLeadToast } from './HotLeadToast';
import { NotificationBell } from './NotificationBell';
import { NotificationsProvider } from './NotificationsProvider';
import { PendingVisitsBanner } from './PendingVisitsBanner';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-md px-3 py-2 text-[0.95rem] ${
    isActive ? 'bg-pine text-white' : 'text-ink/80 hover:bg-pine-soft hover:text-ink'
  }`;

export function Layout() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <NotificationsProvider>
      <div className="flex h-dvh flex-col md:grid md:grid-cols-[15rem_1fr]">
        <aside className="shrink-0 border-b border-line bg-surface md:overflow-y-auto md:border-b-0 md:border-r">
          <div className="flex items-center justify-between px-5 py-4 md:block md:py-6">
            <p className="text-lg font-bold tracking-tight text-pine">Painel da imobiliária</p>
            <div className="md:hidden">
              <NotificationBell />
            </div>
          </div>
          <nav aria-label="Principal" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
            <NavLink to="/leads" className={navClass}>
              <Users size={18} aria-hidden />
              Leads
            </NavLink>
            <NavLink to="/agenda" className={navClass}>
              <CalendarDays size={18} aria-hidden />
              Agenda
            </NavLink>
            {user.role === 'OWNER' && (
              <NavLink to="/indicadores" className={navClass}>
                <BarChart3 size={18} aria-hidden />
                Indicadores
              </NavLink>
            )}
            {user.role === 'OWNER' && (
              <NavLink to="/pontuacao" className={navClass}>
                <SlidersHorizontal size={18} aria-hidden />
                Pontuação
              </NavLink>
            )}
            <NavLink to="/notificacoes" className={navClass}>
              <Bell size={18} aria-hidden />
              Notificações
            </NavLink>
          </nav>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <PendingVisitsBanner />
          <header className="flex h-16 shrink-0 items-center justify-end gap-3 px-5 md:px-10">
            <div className="hidden md:block">
              <NotificationBell />
            </div>
            <span className="text-sm text-muted">
              {user.name}
              <span className="sr-only">, {user.role === 'OWNER' ? 'dono' : 'corretor'}</span>
            </span>
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-pine-soft hover:text-ink"
            >
              <LogOut size={16} aria-hidden />
              Sair
            </button>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-16 md:px-10">
            <Outlet />
          </main>
        </div>
      </div>
      <HotLeadToast />
    </NotificationsProvider>
  );
}
