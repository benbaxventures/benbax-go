import http from 'http';
import { Server } from 'socket.io';
import { createApp } from './app';
import { corsOriginHandler, env } from './config/env';
import { redis } from './config/redis';
import { startRideDispatchSweeper } from './modules/dispatch/dispatch.service';
import { registerRealtimeHandlers } from './realtime/socket';

// The API fires a number of best-effort background tasks (re-dispatching a
// released ride, fanning out notifications) without awaiting them. Node's
// default for an unhandled rejection is to terminate the process, so a single
// transient database blip in one of those tasks would take the whole API down
// mid-request — every in-flight client then gets an HTML error page from the
// hosting proxy instead of a JSON response, and the whole fleet reconnects at
// once. Log it and stay up; individual call sites still attach their own
// `.catch` so failures are attributed.
process.on('unhandledRejection', (reason) => {
  console.error('[api] unhandled promise rejection', reason);
});

// An uncaught exception leaves the process in an unknown state, so this one
// does exit — but only after flushing the reason to the log.
process.on('uncaughtException', (error) => {
  console.error('[api] uncaught exception, shutting down', error);
  process.exit(1);
});

const app = createApp();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: corsOriginHandler,
    credentials: true,
  },
});

app.set('io', io);
registerRealtimeHandlers(io);
// Expires unanswered ride offers, moves them to the next driver, and retries
// waiting rides as drivers come online. Survives restarts (state is in the DB).
startRideDispatchSweeper(io);

server.listen(env.API_PORT, env.API_HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Benbax API listening on ${env.API_HOST}:${env.API_PORT}`);
});

process.on('SIGTERM', async () => {
  io.close();
  await redis?.quit();
  server.close(() => process.exit(0));
});
