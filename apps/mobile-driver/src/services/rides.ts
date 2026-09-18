import { ApiConnectionError, apiRequest, ApiResponseError } from './api';

/** Why an accept attempt failed, in terms the dispatch screen can act on. */
export class AcceptRideError extends Error {
  kind: 'taken' | 'busy' | 'network' | 'other';
  /** For `busy`: the trip the driver still has to finish. */
  activeTripId?: string;

  constructor(message: string, kind: AcceptRideError['kind'], activeTripId?: string) {
    super(message);
    this.name = 'AcceptRideError';
    this.kind = kind;
    if (activeTripId) this.activeTripId = activeTripId;
  }
}

/**
 * Accepts a ride: the targeted offer when `assignmentId` is given, otherwise
 * straight from the open-requests list. First driver to accept wins; everyone
 * else gets `kind: 'taken'`.
 */
export async function acceptRide(input: { tripId: string; assignmentId?: string }) {
  try {
    await apiRequest(
      input.assignmentId
        ? `/ride-dispatch/assignments/${input.assignmentId}/accept`
        : `/ride-dispatch/trips/${input.tripId}/claim`,
      { method: 'POST' }
    );
    return { tripId: input.tripId };
  } catch (err) {
    if (err instanceof ApiConnectionError) {
      throw new AcceptRideError('Cannot reach the server. Check your connection.', 'network');
    }
    if (err instanceof ApiResponseError) {
      if (err.code === 'DRIVER_BUSY') {
        const details = err.details as { tripId?: string } | undefined;
        throw new AcceptRideError(err.message, 'busy', details?.tripId);
      }
      if (err.status === 409 || err.code === 'RIDE_UNAVAILABLE') {
        throw new AcceptRideError(err.message, 'taken');
      }
      throw new AcceptRideError(err.message, 'other');
    }
    throw new AcceptRideError(
      err instanceof Error ? err.message : 'Could not accept this ride.',
      'other'
    );
  }
}
