import { Prisma, RideTripStatus, type RideTrip } from '@prisma/client';
import type { ReleaseRideDb } from '../../src/modules/ride-dispatch/ride-release.service';

/**
 * A tiny in-memory stand-in for the slice of Prisma the release service uses.
 *
 * It reproduces the two behaviours the service actually depends on —
 * `updateMany` only touching rows that still match its `where`, and
 * `$transaction` running its callback against the same store — so tests of
 * idempotency and of the release/start race are testing real logic rather
 * than a mock that always agrees.
 */

export type FakeAssignment = {
  id: string;
  tripId: string;
  driverProfileId: string;
  status: 'OFFERED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'COMPLETED';
  offeredAt: Date;
  respondedAt?: Date | null;
};

export type FakeDriver = {
  id: string;
  userId: string;
  status: string;
};

let sequence = 0;

export function makeTrip(overrides: Partial<RideTrip> = {}): RideTrip {
  sequence += 1;
  const decimal = (value: number) => new Prisma.Decimal(value);
  return {
    id: `trip-${sequence}`,
    tripCode: `TRIP${sequence}`,
    passengerId: 'passenger-1',
    status: RideTripStatus.ASSIGNED,
    pickupLabel: 'Q2X5+W2R',
    pickupAddress: null,
    pickupLatitude: decimal(5.65),
    pickupLongitude: decimal(-0.16),
    pickupLandmark: null,
    dropoffLabel: 'Golf Estate',
    dropoffAddress: null,
    dropoffLatitude: decimal(5.55),
    dropoffLongitude: decimal(-0.18),
    dropoffLandmark: null,
    requestedVehicleType: 'ECONOMY',
    scheduledFor: null,
    distanceKm: decimal(8),
    etaMinutes: 20,
    baseFare: decimal(5),
    perKmFare: decimal(2),
    perMinuteFare: decimal(0.5),
    surgeMultiplier: decimal(1),
    totalFare: decimal(25),
    notes: null,
    metadata: null,
    cancelledBy: null,
    cancellationReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as RideTrip;
}

export type FakeRideDb = ReleaseRideDb & {
  trips: Map<string, RideTrip>;
  assignments: FakeAssignment[];
  drivers: FakeDriver[];
  /** Runs once, just before the next rideTrip.updateMany — used to force a race. */
  onBeforeTripUpdate?: (() => void) | undefined;
};

export function createFakeRideDb(seed: {
  trips?: RideTrip[];
  assignments?: FakeAssignment[];
  drivers?: FakeDriver[];
}): FakeRideDb {
  const trips = new Map((seed.trips ?? []).map((trip) => [trip.id, trip]));
  const assignments = [...(seed.assignments ?? [])];
  const drivers = [...(seed.drivers ?? [])];

  const db: Partial<FakeRideDb> = {
    trips,
    assignments,
    drivers,
  };

  const client = {
    driverProfile: {
      findUnique: async ({ where }: { where: { userId?: string; id?: string } }) => {
        const match = drivers.find(
          (driver) =>
            (where.userId != null && driver.userId === where.userId) ||
            (where.id != null && driver.id === where.id)
        );
        return match ? { ...match } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
        const driver = drivers.find((candidate) => candidate.id === where.id);
        if (!driver) throw new Error('driver not found');
        driver.status = data.status;
        return { ...driver };
      },
    },
    rideTrip: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const trip = trips.get(where.id);
        return trip ? { ...trip } : null;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; status?: { in: RideTripStatus[] } };
        data: { status: RideTripStatus };
      }) => {
        db.onBeforeTripUpdate?.();
        db.onBeforeTripUpdate = undefined;
        const trip = trips.get(where.id);
        if (!trip) return { count: 0 };
        if (where.status && !where.status.in.includes(trip.status)) return { count: 0 };
        trips.set(where.id, { ...trip, status: data.status });
        return { count: 1 };
      },
    },
    rideAssignment: {
      findFirst: async ({ where }: { where: { tripId: string; driverProfileId: string } }) => {
        const matches = assignments
          .filter(
            (assignment) =>
              assignment.tripId === where.tripId &&
              assignment.driverProfileId === where.driverProfileId
          )
          .sort((a, b) => b.offeredAt.getTime() - a.offeredAt.getTime());
        return matches[0] ? { ...matches[0] } : null;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; status?: string };
        data: { status: FakeAssignment['status']; respondedAt: Date };
      }) => {
        const assignment = assignments.find((candidate) => candidate.id === where.id);
        if (!assignment) return { count: 0 };
        if (where.status && assignment.status !== where.status) return { count: 0 };
        assignment.status = data.status;
        assignment.respondedAt = data.respondedAt;
        return { count: 1 };
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
  };

  Object.assign(db, client);
  return db as FakeRideDb;
}

/**
 * The same fake, widened to stand in for the whole Prisma client.
 *
 * Booting the real Express app pulls in modules that touch tables this fake
 * knows nothing about — status events, notification recipients, the dispatch
 * engine's driver search. Those are all best-effort paths, so unknown models
 * answer with empty results rather than being stubbed one by one; the tables
 * the release flow actually reads and writes are the real fake above.
 */
export function asPrismaClient(db: FakeRideDb): FakeRideDb {
  const emptyModel = {
    findUnique: async () => null,
    findFirst: async () => null,
    findMany: async () => [],
    create: async () => ({}),
    createMany: async () => ({ count: 0 }),
    update: async () => ({}),
    updateMany: async () => ({ count: 0 }),
    delete: async () => ({}),
    deleteMany: async () => ({ count: 0 }),
    count: async () => 0,
  };

  /** A model the fake implements, with the empty defaults behind it. */
  const withDefaults = (model: object) =>
    new Proxy(model as Record<string, unknown>, {
      get: (target, key) =>
        key in target ? target[key as string] : emptyModel[key as keyof typeof emptyModel],
    });

  return new Proxy(db as unknown as Record<string | symbol, unknown>, {
    get(target, property) {
      if (typeof property === 'symbol') return target[property];
      const existing = target[property];
      if (existing !== undefined) {
        return typeof existing === 'object' && existing !== null && !Array.isArray(existing)
          ? withDefaults(existing)
          : existing;
      }
      if (property.startsWith('$')) return async () => undefined;
      return emptyModel;
    },
  }) as unknown as FakeRideDb;
}
