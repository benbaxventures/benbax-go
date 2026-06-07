import http from 'http';
import { Server } from 'socket.io';
import { createApp } from './app';
import { corsOrigins, env } from './config/env';
import { redis } from './config/redis';
import { registerRealtimeHandlers } from './realtime/socket';

const app = createApp();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: corsOrigins,
    credentials: true,
  },
});

app.set('io', io);
registerRealtimeHandlers(io);

server.listen(env.API_PORT, env.API_HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Benbax API listening on ${env.API_HOST}:${env.API_PORT}`);
});

process.on('SIGTERM', async () => {
  io.close();
  await redis?.quit();
  server.close(() => process.exit(0));
});
