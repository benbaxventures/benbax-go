import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, Bike, CircleDollarSign, PackageCheck, Users } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MetricCard } from '../components/MetricCard';
import { formatDateTime } from '../lib/format';
import { apiRequest } from '../services/api';

type Dashboard = {
  users: number;
  riders: number;
  activeDeliveries: number;
  revenueGhs: number;
};

type ActivityEvent = {
  id: string;
  type: string;
  title: string;
  detail: string;
  at: string;
};

type DemandPoint = {
  hour: string;
  deliveries: number;
  rides: number;
  total: number;
};

type StuckOrder = {
  id: string;
  kind: 'DELIVERY' | 'RIDE';
  code: string;
  status: string;
  problem: string;
  pickupLabel: string;
  requester: { name: string; phone: string };
  ageMinutes: number;
};

export function DashboardPage() {
  const { data } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => apiRequest<Dashboard>('/admin/dashboard'),
  });

  const { data: activity } = useQuery({
    queryKey: ['admin-activity'],
    queryFn: () => apiRequest<ActivityEvent[]>('/admin/activity'),
    refetchInterval: 15_000,
  });

  const { data: demand } = useQuery({
    queryKey: ['admin-demand'],
    queryFn: () => apiRequest<DemandPoint[]>('/admin/demand'),
    refetchInterval: 60_000,
  });

  const { data: stuckOrders } = useQuery({
    queryKey: ['admin-stuck-orders'],
    queryFn: () => apiRequest<StuckOrder[]>('/admin/orders/stuck'),
    refetchInterval: 30_000,
  });

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Operations Overview</h1>
          <p>Live dispatch health, demand, rider supply, revenue, and support pressure.</p>
        </div>
        <span className="live-dot">Live</span>
      </div>

      <div className="metrics-grid">
        <MetricCard
          label="Active deliveries"
          value={`${data?.activeDeliveries ?? 0}`}
          delta="+12% today"
          icon={<PackageCheck size={20} />}
        />
        <MetricCard
          label="Riders"
          value={`${data?.riders ?? 0}`}
          delta="82% verified"
          icon={<Bike size={20} />}
        />
        <MetricCard
          label="Users"
          value={`${data?.users ?? 0}`}
          delta="Ghana launch"
          icon={<Users size={20} />}
        />
        <MetricCard
          label="Revenue"
          value={`GHS ${data?.revenueGhs ?? 0}`}
          delta="Paid orders"
          icon={<CircleDollarSign size={20} />}
        />
      </div>

      <div className="panel-grid">
        <div className="panel span-2">
          <div className="panel-header">
            <h2>Demand — last 24h (live)</h2>
            <Activity size={18} />
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={demand ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="hour" stroke="#5B6472" />
              <YAxis stroke="#5B6472" allowDecimals={false} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="deliveries"
                name="Deliveries"
                stackId="demand"
                stroke="#0E7C66"
                fill="#0E7C6633"
              />
              <Area
                type="monotone"
                dataKey="rides"
                name="Rides"
                stackId="demand"
                stroke="#2563EB"
                fill="#2563EB33"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="panel">
          <div className="panel-header">
            <h2>Needs attention</h2>
            <span className={`status-chip${stuckOrders?.length ? ' chip-danger' : ''}`}>
              <AlertTriangle size={14} />
              &nbsp;{stuckOrders?.length ?? 0}
            </span>
          </div>
          <ul className="dense-list">
            {stuckOrders?.length ? (
              stuckOrders.slice(0, 6).map((order) => (
                <li key={`${order.kind}-${order.id}`}>
                  <strong>
                    {order.code}
                    <span className="muted table-subtext">
                      {order.problem} · {order.requester.name}
                    </span>
                  </strong>
                  <span>{order.ageMinutes}m</span>
                </li>
              ))
            ) : (
              <li>
                <strong>All clear</strong>
                <span>No stuck orders</span>
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Recent user &amp; driver activity</h2>
          <span className="live-dot">Live</span>
        </div>
        {activity?.length ? (
          <ul className="timeline timeline-columns">
            {activity.slice(0, 20).map((event) => (
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
          <p className="muted">
            No recent activity — registrations, logins, orders, and rides will appear here.
          </p>
        )}
      </div>
    </section>
  );
}
