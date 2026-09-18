import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  Car,
  CircleDollarSign,
  Clock,
  PackageCheck,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
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
import type { OpsOverview } from '../lib/opsTypes';
import { apiRequest } from '../services/api';

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
    queryKey: ['ops-overview'],
    queryFn: () => apiRequest<OpsOverview>('/admin/ops/overview'),
    refetchInterval: 10_000,
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

      <div className="metrics-grid metrics-grid-5">
        <Link to="/live" className="metric-link">
          <MetricCard
            label="Drivers online now"
            value={`${data?.drivers.live ?? 0}`}
            delta={`${data?.drivers.idle ?? 0} available · ${data?.drivers.busy ?? 0} on trip · ${data?.drivers.total ?? 0} registered`}
            icon={<Car size={20} />}
          />
        </Link>
        <Link to="/live" className="metric-link">
          <MetricCard
            label="Waiting for a driver"
            value={`${data?.rides.open ?? 0}`}
            delta={`${data?.rides.active ?? 0} ${data?.rides.active === 1 ? 'trip' : 'trips'} in progress · ${data?.passengersOnline ?? 0} ${data?.passengersOnline === 1 ? 'passenger' : 'passengers'} online`}
            icon={<Clock size={20} />}
          />
        </Link>
        <MetricCard
          label="Rides today"
          value={`${data?.rides.completedToday ?? 0}`}
          delta={`completed of ${data?.rides.requestedToday ?? 0} requested · ${data?.rides.cancelledToday ?? 0} cancelled`}
          icon={<Activity size={20} />}
        />
        <MetricCard
          label="Active deliveries"
          value={`${data?.deliveries.active ?? 0}`}
          delta={`${data?.riders.total ?? 0} delivery riders · ${data?.users ?? 0} users`}
          icon={<PackageCheck size={20} />}
        />
        <MetricCard
          label="Revenue"
          value={`GHS ${(data?.revenueGhs ?? 0).toFixed(2)}`}
          delta={`All paid orders · GHS ${(data?.rides.revenueTodayGhs ?? 0).toFixed(2)} rides today`}
          icon={<CircleDollarSign size={20} />}
        />
      </div>

      {data?.drivers.staleOnline ? (
        <p className="form-notice">
          <Users size={14} /> {data.drivers.staleOnline}{' '}
          {data.drivers.staleOnline === 1
            ? 'driver is marked online without a connected app and is'
            : 'drivers are marked online without a connected app and are'}{' '}
          not counted above.
        </p>
      ) : null}

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
