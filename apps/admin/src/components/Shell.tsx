import {
  Bell,
  Bike,
  ChartSpline,
  CircleDollarSign,
  FileCheck,
  Headphones,
  Map,
  PackageSearch,
  Shield,
  Users,
} from 'lucide-react';
import type { PropsWithChildren } from 'react';
import { NavLink } from 'react-router-dom';
import { useAdminSession } from '../state/adminSession';

const navItems = [
  { to: '/', label: 'Overview', icon: ChartSpline },
  { to: '/deliveries', label: 'Deliveries', icon: PackageSearch },
  { to: '/riders', label: 'Riders', icon: Bike },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/documents', label: 'Documents', icon: FileCheck },
  { to: '/pricing', label: 'Pricing', icon: CircleDollarSign },
  { to: '/geofences', label: 'Geofences', icon: Map },
  { to: '/support', label: 'Support', icon: Headphones },
  { to: '/risk', label: 'Risk', icon: Shield },
];

export function Shell({ children }: PropsWithChildren) {
  const { user, logout } = useAdminSession();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">B</div>
          <div>
            <strong>Benbax</strong>
            <span>Operations</span>
          </div>
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} end={item.to === '/'}>
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <strong>{user?.name ?? 'Admin'}</strong>
            <span>{user?.role ?? 'OPERATIONS'}</span>
          </div>
          <button className="icon-button" type="button" aria-label="Notifications">
            <Bell size={18} />
          </button>
          <button className="secondary-button" type="button" onClick={logout}>
            Sign out
          </button>
        </header>
        {children}
      </main>
    </div>
  );
}
