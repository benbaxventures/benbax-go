import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.DOTENV_CONFIG_PATH = 'tests/.env.does-not-exist';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:59999/benbax_test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-must-be-at-least-24-chars';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-must-be-at-least-24-chars';

import { __testing } from '../src/realtime/socket';

type Emitted = { room: string; event: string; payload: unknown };

/** A socket stub that records what a relay would put on the wire. */
function fakeSocket(rooms: string[]) {
  const broadcasts: Emitted[] = [];
  return {
    broadcasts,
    socket: {
      rooms: new Set(rooms),
      broadcast: {
        to: (room: string) => ({
          emit: (event: string, payload: unknown) => broadcasts.push({ room, event, payload }),
        }),
      },
    },
  };
}

function fakeIo() {
  const emits: Emitted[] = [];
  return {
    emits,
    io: {
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => emits.push({ room, event, payload }),
      }),
    },
  };
}

const POSITION = { latitude: 5.6508, longitude: -0.1668, heading: 91 };

describe('relayDriverPositionToRides', () => {
  it('sends the position to every trip the driver is on', () => {
    // A driver's socket is in its own user room, the drivers room, and the
    // room for the ride it accepted.
    const { socket, broadcasts } = fakeSocket([
      'driver-socket-id',
      'user:driver-1',
      'drivers',
      'ride:trip-1',
    ]);
    const { io, emits } = fakeIo();

    __testing.relayDriverPositionToRides(socket, io as never, POSITION);

    assert.equal(broadcasts.length, 1);
    assert.equal(broadcasts[0]?.room, 'ride:trip-1');
    assert.equal(broadcasts[0]?.event, 'ride:tracking:point');
    assert.deepEqual(broadcasts[0]?.payload, { ...POSITION, tripId: 'trip-1' });
    // Ops sees the same movement without joining every ride room.
    assert.equal(emits.length, 1);
    assert.equal(emits[0]?.room, 'admins');
  });

  it('does nothing when the driver is not on a trip', () => {
    const { socket, broadcasts } = fakeSocket(['driver-socket-id', 'user:driver-1', 'drivers']);
    const { io, emits } = fakeIo();

    __testing.relayDriverPositionToRides(socket, io as never, POSITION);

    assert.equal(broadcasts.length, 0);
    assert.equal(emits.length, 0);
  });

  it('never echoes the position back to the driver who sent it', () => {
    // `broadcast.to` excludes the sender; a plain `io.to` would send the
    // driver their own GPS and fight their map.
    const { socket, broadcasts } = fakeSocket(['ride:trip-1']);
    const { io } = fakeIo();

    __testing.relayDriverPositionToRides(socket, io as never, POSITION);

    assert.equal(broadcasts.length, 1, 'expected a broadcast that skips the sender');
  });

  it('ignores rooms that are not rides', () => {
    const { socket, broadcasts } = fakeSocket(['delivery:d-1', 'customer-watchers', 'ride:trip-9']);
    const { io } = fakeIo();

    __testing.relayDriverPositionToRides(socket, io as never, POSITION);

    assert.deepEqual(
      broadcasts.map((b) => b.room),
      ['ride:trip-9']
    );
  });

  it('carries heading through only when the device reported one', () => {
    const { socket, broadcasts } = fakeSocket(['ride:trip-1']);
    const { io } = fakeIo();

    __testing.relayDriverPositionToRides(socket, io as never, {
      latitude: 5.6,
      longitude: -0.1,
    });

    assert.deepEqual(broadcasts[0]?.payload, {
      latitude: 5.6,
      longitude: -0.1,
      tripId: 'trip-1',
    });
  });
});
