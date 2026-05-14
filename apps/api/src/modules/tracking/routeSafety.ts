import type { Delivery, DeliveryTrackingPoint, Prisma, RiderProfile } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { realtimeEvents } from '../../realtime/events';

type Coordinate = {
  latitude: number;
  longitude: number;
};

type ExpectedRoute = {
  provider: 'google' | 'fallback';
  polyline: Coordinate[];
  corridorMeters: number;
  calculatedAt: string;
};

type DeliveryRouteMetadata = {
  expectedRoute?: ExpectedRoute;
  routeSafety?: {
    lastDeviationAt?: string;
    consecutiveDeviationCount?: number;
  };
};

type RealtimeServer = {
  to: (room: string) => {
    emit: (event: string, payload: unknown) => void;
  };
};

const ROUTE_CORRIDOR_METERS = 300;
const STALE_LOCATION_MINUTES = 5;

export async function buildExpectedRoute(pickup: Coordinate, dropoff: Coordinate): Promise<ExpectedRoute> {
  if (!env.GOOGLE_MAPS_API_KEY) {
    return {
      provider: 'fallback',
      polyline: [pickup, dropoff],
      corridorMeters: ROUTE_CORRIDOR_METERS,
      calculatedAt: new Date().toISOString()
    };
  }

  try {
    const params = new URLSearchParams({
      origin: `${pickup.latitude},${pickup.longitude}`,
      destination: `${dropoff.latitude},${dropoff.longitude}`,
      key: env.GOOGLE_MAPS_API_KEY
    });
    const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`);
    const body = (await response.json()) as {
      routes?: Array<{ overview_polyline?: { points?: string } }>;
    };
    const encoded = body.routes?.[0]?.overview_polyline?.points;

    return {
      provider: encoded ? 'google' : 'fallback',
      polyline: encoded ? decodePolyline(encoded) : [pickup, dropoff],
      corridorMeters: ROUTE_CORRIDOR_METERS,
      calculatedAt: new Date().toISOString()
    };
  } catch {
    return {
      provider: 'fallback',
      polyline: [pickup, dropoff],
      corridorMeters: ROUTE_CORRIDOR_METERS,
      calculatedAt: new Date().toISOString()
    };
  }
}

export async function evaluateTrackingSafety(input: {
  delivery: Delivery;
  rider: RiderProfile;
  point: DeliveryTrackingPoint;
  io?: RealtimeServer;
}) {
  const metadata = getRouteMetadata(input.delivery.metadata);
  const expectedRoute =
    metadata.expectedRoute ??
    (await buildExpectedRoute(
      {
        latitude: Number(input.delivery.pickupLatitude),
        longitude: Number(input.delivery.pickupLongitude)
      },
      {
        latitude: Number(input.delivery.dropoffLatitude),
        longitude: Number(input.delivery.dropoffLongitude)
      }
    ));

  if (!metadata.expectedRoute) {
    await prisma.delivery.update({
      where: { id: input.delivery.id },
      data: {
        metadata: {
          ...metadata,
          expectedRoute
        } satisfies Prisma.InputJsonValue
      }
    });
  }

  const currentPoint = {
    latitude: Number(input.point.latitude),
    longitude: Number(input.point.longitude)
  };
  const distanceFromRouteMeters = distanceToPolylineMeters(currentPoint, expectedRoute.polyline);
  const isRouteDeviation = distanceFromRouteMeters > expectedRoute.corridorMeters;
  const isStalePoint = Date.now() - input.point.capturedAt.getTime() > STALE_LOCATION_MINUTES * 60_000;
  const isImpossibleSpeed = Number(input.point.speedKph ?? 0) > 120;

  if (!isRouteDeviation && !isStalePoint && !isImpossibleSpeed) {
    if (metadata.routeSafety?.consecutiveDeviationCount) {
      await prisma.delivery.update({
        where: { id: input.delivery.id },
        data: {
          metadata: {
            ...metadata,
            expectedRoute,
            routeSafety: { consecutiveDeviationCount: 0 }
          } satisfies Prisma.InputJsonValue
        }
      });
    }
    return;
  }

  const consecutiveDeviationCount = isRouteDeviation
    ? (metadata.routeSafety?.consecutiveDeviationCount ?? 0) + 1
    : (metadata.routeSafety?.consecutiveDeviationCount ?? 0);
  const severity = getSeverity(consecutiveDeviationCount, isImpossibleSpeed, isStalePoint);
  const type = isRouteDeviation ? 'ROUTE_DEVIATION' : isImpossibleSpeed ? 'IMPOSSIBLE_SPEED' : 'STALE_LOCATION';
  const details = {
    deliveryId: input.delivery.id,
    trackingCode: input.delivery.trackingCode,
    latitude: currentPoint.latitude,
    longitude: currentPoint.longitude,
    distanceFromRouteMeters: Math.round(distanceFromRouteMeters),
    corridorMeters: expectedRoute.corridorMeters,
    speedKph: input.point.speedKph ? Number(input.point.speedKph) : null,
    escalation: getEscalation(severity)
  };

  const activity = await prisma.suspiciousActivity.create({
    data: {
      riderProfileId: input.rider.id,
      deliveryId: input.delivery.id,
      type,
      severity,
      details
    }
  });

  await prisma.delivery.update({
    where: { id: input.delivery.id },
    data: {
      metadata: {
        ...metadata,
        expectedRoute,
        routeSafety: {
          lastDeviationAt: new Date().toISOString(),
          consecutiveDeviationCount
        }
      } satisfies Prisma.InputJsonValue
    }
  });

  if (isRouteDeviation) {
    await prisma.notification.create({
      data: {
        userId: input.rider.userId,
        title: 'Route warning',
        body: 'You are moving away from the delivery route.',
        data: details
      }
    });
  }

  input.io?.to('admins').emit(realtimeEvents.adminAlert, {
    id: activity.id,
    type,
    severity,
    message: buildAlertMessage(type, severity, details.distanceFromRouteMeters),
    details,
    createdAt: activity.createdAt
  });
  input.io?.to(`rider:${input.rider.userId}`).emit(realtimeEvents.riderWarning, {
    type,
    severity,
    message: isRouteDeviation
      ? 'You are moving away from the delivery route.'
      : 'Your tracking signal needs attention.',
    details
  });
}

function getRouteMetadata(metadata: Prisma.JsonValue): DeliveryRouteMetadata {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as DeliveryRouteMetadata)
    : {};
}

function getSeverity(consecutiveDeviationCount: number, isImpossibleSpeed: boolean, isStalePoint: boolean) {
  if (isImpossibleSpeed || consecutiveDeviationCount >= 5) return 'HIGH';
  if (isStalePoint || consecutiveDeviationCount >= 3) return 'MEDIUM';
  return 'LOW';
}

function getEscalation(severity: string) {
  if (severity === 'HIGH') return 'Freeze payout, call rider/customer, and require face check.';
  if (severity === 'MEDIUM') return 'Alert operations and monitor the rider live.';
  return 'Warn rider and continue monitoring.';
}

function buildAlertMessage(type: string, severity: string, distanceFromRouteMeters: number) {
  if (type === 'ROUTE_DEVIATION') {
    return `Rider is ${distanceFromRouteMeters}m away from route corridor (${severity}).`;
  }
  if (type === 'IMPOSSIBLE_SPEED') return `Impossible rider speed detected (${severity}).`;
  return `Rider location is stale (${severity}).`;
}

function decodePolyline(encoded: string): Coordinate[] {
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  const coordinates: Coordinate[] = [];

  while (index < encoded.length) {
    const latitudeResult = decodePolylineValue(encoded, index);
    latitude += latitudeResult.delta;
    index = latitudeResult.index;

    const longitudeResult = decodePolylineValue(encoded, index);
    longitude += longitudeResult.delta;
    index = longitudeResult.index;

    coordinates.push({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
  }

  return coordinates;
}

function decodePolylineValue(encoded: string, startIndex: number) {
  let result = 0;
  let shift = 0;
  let index = startIndex;
  let byte = 0;

  do {
    byte = encoded.charCodeAt(index) - 63;
    index += 1;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20 && index < encoded.length);

  return {
    delta: result & 1 ? ~(result >> 1) : result >> 1,
    index
  };
}

function distanceToPolylineMeters(point: Coordinate, polyline: Coordinate[]) {
  if (polyline.length < 2) return Number.POSITIVE_INFINITY;

  let minDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = polyline[index];
    const end = polyline[index + 1];
    if (!start || !end) continue;
    minDistance = Math.min(minDistance, distanceToSegmentMeters(point, start, end));
  }
  return minDistance;
}

function distanceToSegmentMeters(point: Coordinate, start: Coordinate, end: Coordinate) {
  const originLatitude = toRadians(point.latitude);
  const metersPerDegreeLatitude = 111_320;
  const metersPerDegreeLongitude = Math.cos(originLatitude) * 111_320;
  const pointXY = toXY(point, metersPerDegreeLatitude, metersPerDegreeLongitude);
  const startXY = toXY(start, metersPerDegreeLatitude, metersPerDegreeLongitude);
  const endXY = toXY(end, metersPerDegreeLatitude, metersPerDegreeLongitude);
  const dx = endXY.x - startXY.x;
  const dy = endXY.y - startXY.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) return haversineMeters(point, start);

  const t = Math.max(0, Math.min(1, ((pointXY.x - startXY.x) * dx + (pointXY.y - startXY.y) * dy) / lengthSquared));
  const projection = { x: startXY.x + t * dx, y: startXY.y + t * dy };
  return Math.hypot(pointXY.x - projection.x, pointXY.y - projection.y);
}

function toXY(point: Coordinate, metersPerDegreeLatitude: number, metersPerDegreeLongitude: number) {
  return {
    x: point.longitude * metersPerDegreeLongitude,
    y: point.latitude * metersPerDegreeLatitude
  };
}

function haversineMeters(a: Coordinate, b: Coordinate) {
  const earthRadiusMeters = 6_371_000;
  const deltaLatitude = toRadians(b.latitude - a.latitude);
  const deltaLongitude = toRadians(b.longitude - a.longitude);
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);
  const h =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toRadians(degrees: number) {
  return degrees * (Math.PI / 180);
}
