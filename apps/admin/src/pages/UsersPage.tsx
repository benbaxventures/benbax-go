import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { useState } from 'react';
import { formatDateTime, formatRelativeTime } from '../lib/format';
import { apiRequest } from '../services/api';

const PAGE_SIZE = 25;

const ROLE_OPTIONS = ['ALL', 'CUSTOMER', 'RIDER', 'DRIVER', 'ADMIN', 'SUPPORT', 'OPERATIONS'];
const STATUS_OPTIONS = ['ALL', 'ACTIVE', 'BLOCKED', 'DELETED'];

type ProfileSummary = {
  status: string;
  kycStatus: string;
  isOnline: boolean;
};

type AdminUserRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  role: string;
  status: string;
  createdAt: string;
  lastSeenAt: string | null;
  wallet: { balance: string; currency: string } | null;
  riderProfile: (ProfileSummary & { totalDeliveries: number }) | null;
  driverProfile: (ProfileSummary & { totalTrips: number }) | null;
  _count: { deliveries: number; rideTrips: number; supportCases: number };
};

type UsersResponse = {
  items: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
};

type ActivityEvent = {
  id: string;
  type: string;
  title: string;
  detail: string;
  at: string;
};

type UserSession = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

type UserActivityResponse = {
  user: AdminUserRow;
  sessions: UserSession[];
  events: ActivityEvent[];
};

export function UsersPage() {
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [role, setRole] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);

  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (submittedSearch) query.set('search', submittedSearch);
  if (role !== 'ALL') query.set('role', role);
  if (status !== 'ALL') query.set('status', status);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-users', page, submittedSearch, role, status],
    queryFn: () => apiRequest<UsersResponse>(`/admin/users?${query.toString()}`),
  });

  const users = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSubmittedSearch(search.trim());
  };

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>User Management</h1>
          <p>
            Every registered account — customers, riders, drivers, and staff — with sign-up time,
            last activity, and a full activity trail.
          </p>
        </div>
        <span className="status-chip">{total} accounts</span>
      </div>

      <form className="filters-row" onSubmit={handleSearchSubmit}>
        <div className="search-box">
          <Search size={16} />
          <input
            type="search"
            placeholder="Search name, email, or phone"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select
          value={role}
          aria-label="Filter by role"
          onChange={(event) => {
            setRole(event.target.value);
            setPage(1);
          }}
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === 'ALL' ? 'All roles' : option}
            </option>
          ))}
        </select>
        <select
          value={status}
          aria-label="Filter by status"
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === 'ALL' ? 'All statuses' : option}
            </option>
          ))}
        </select>
        <button type="submit" className="secondary-button">
          Search
        </button>
      </form>

      <div className={selectedUser ? 'split-layout' : undefined}>
        <div className="table-panel">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Status</th>
                <th>Registered</th>
                <th>Last seen</th>
                <th>Orders</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8}>Loading users...</td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={8}>Failed to load users: {(error as Error).message}</td>
                </tr>
              ) : users.length ? (
                users.map((user) => (
                  <tr
                    key={user.id}
                    className={`row-clickable${selectedUser?.id === user.id ? ' row-selected' : ''}`}
                    onClick={() => setSelectedUser(user)}
                  >
                    <td>
                      <strong>{user.name}</strong>
                      {user.riderProfile?.isOnline || user.driverProfile?.isOnline ? (
                        <span className="online-dot" title="Online now" />
                      ) : null}
                    </td>
                    <td>{user.email ?? '—'}</td>
                    <td>{user.phone}</td>
                    <td>
                      <span className="status-chip">{user.role}</span>
                    </td>
                    <td>
                      <span
                        className={`status-chip${user.status !== 'ACTIVE' ? ' chip-danger' : ''}`}
                      >
                        {user.status}
                      </span>
                    </td>
                    <td>{formatDateTime(user.createdAt)}</td>
                    <td>{formatRelativeTime(user.lastSeenAt)}</td>
                    <td>{user._count.deliveries + user._count.rideTrips}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>No users match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="pagination-row">
            <button
              type="button"
              className="secondary-button"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </button>
            <span className="muted">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="secondary-button"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        </div>

        {selectedUser ? (
          <UserActivityPanel user={selectedUser} onClose={() => setSelectedUser(null)} />
        ) : null}
      </div>
    </section>
  );
}

type UserActivityPanelProps = {
  user: AdminUserRow;
  onClose: () => void;
};

function UserActivityPanel({ user, onClose }: UserActivityPanelProps) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-user-activity', user.id],
    queryFn: () => apiRequest<UserActivityResponse>(`/admin/users/${user.id}/activity`),
  });

  const events = data?.events ?? [];
  const sessions = data?.sessions ?? [];

  return (
    <aside className="panel activity-panel">
      <div className="panel-header">
        <h2>{user.name}</h2>
        <button type="button" className="icon-button" aria-label="Close activity" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <dl className="definition-grid">
        <dt>Email</dt>
        <dd>{user.email ?? '—'}</dd>
        <dt>Phone</dt>
        <dd>{user.phone}</dd>
        <dt>Role</dt>
        <dd>{user.role}</dd>
        <dt>Registered</dt>
        <dd>{formatDateTime(user.createdAt)}</dd>
        <dt>Last seen</dt>
        <dd>{formatRelativeTime(user.lastSeenAt)}</dd>
        {user.wallet ? (
          <>
            <dt>Wallet</dt>
            <dd>
              {user.wallet.currency} {user.wallet.balance}
            </dd>
          </>
        ) : null}
      </dl>

      {sessions.length ? (
        <>
          <h3 className="timeline-heading">Sessions &amp; devices</h3>
          <ul className="timeline">
            {sessions.slice(0, 5).map((session) => (
              <li key={session.id}>
                <div className="timeline-row">
                  <strong>{describeDevice(session.userAgent)}</strong>
                  <time>{formatDateTime(session.createdAt)}</time>
                </div>
                <span className="muted">
                  {session.ipAddress ?? 'Unknown IP'} ·{' '}
                  {session.revokedAt
                    ? 'Signed out'
                    : new Date(session.expiresAt) > new Date()
                      ? 'Active'
                      : 'Expired'}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h3 className="timeline-heading">Activity</h3>
      {isLoading ? (
        <p className="muted">Loading activity...</p>
      ) : isError ? (
        <p className="muted">Failed to load activity: {(error as Error).message}</p>
      ) : events.length ? (
        <ul className="timeline">
          {events.map((event) => (
            <li key={event.id}>
              <div className="timeline-row">
                <strong>{event.title}</strong>
                <time>{formatDateTime(event.at)}</time>
              </div>
              <span className="muted">
                {event.type} · {event.detail}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No recorded activity yet.</p>
      )}
    </aside>
  );
}

function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  if (/okhttp|Expo|Dalvik|Android/i.test(userAgent)) return 'Android app';
  if (/CFNetwork|iPhone|iOS|Darwin/i.test(userAgent)) return 'iPhone app';
  if (/Mobile/i.test(userAgent)) return 'Mobile browser';
  if (/Mozilla/i.test(userAgent)) return 'Web browser';
  return userAgent.slice(0, 40);
}
