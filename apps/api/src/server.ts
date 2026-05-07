import http from 'http';
import { Server } from 'socket.io';
import { env, corsOrigins } from './config/env';
import { redis } from './config/redis';
import { createApp } from './app';
import { registerRealtimeHandlers } from './realtime/socket';

const app = createApp();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: corsOrigins,
    credentials: true
  }
});

app.set('io', io);
registerRealtimeHandlers(io);

server.listen(env.API_PORT, () => {
  console.log(`Benbax API listening on port ${env.API_PORT}`);
});

process.on('SIGTERM', async () => {
  io.close();
  await redis?.quit();
  server.close(() => process.exit(0));
});
