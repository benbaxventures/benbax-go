import http from 'http';
import { Server } from 'socket.io';
import { createApp } from './app';
import { corsOriginHandler, env } from './config/env';
import { redis } from './config/redis';
import { startRideDispatchSweeper } from './modules/dispatch/dispatch.service';
import { registerRealtimeHandlers } from './realtime/socket';

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
