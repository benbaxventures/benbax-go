import type { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { realtimeEvents } from './events';

type SocketAuth = {
  sub: string;
  role: string;
};

export function registerRealtimeHandlers(io: Server) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token || typeof token !== 'string') return next(new Error('Unauthorized'));

    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as SocketAuth;
      socket.data.user = { id: payload.sub, role: payload.role };
      return next();
    } catch {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const user = socket.data.user as { id: string; role: string };

    socket.join(`user:${user.id}`);
    if (user.role === 'RIDER') socket.join(`rider:${user.id}`);
    if (user.role === 'DRIVER') socket.join(`driver:${user.id}`);
    if (['ADMIN', 'OPERATIONS', 'SUPPORT'].includes(user.role)) socket.join('admins');

    try {
      await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
    } catch {}

    socket.to(`user:${user.id}`).emit(realtimeEvents.userPresence, { userId: user.id, online: true });
    io.to('admins').emit(realtimeEvents.userPresence, { userId: user.id, online: true });

    socket.on('delivery:join', (deliveryId: string) => {
      socket.join(`delivery:${deliveryId}`);
    });

    socket.on('delivery:leave', (deliveryId: string) => {
      socket.leave(`delivery:${deliveryId}`);
    });

    socket.on('ride:join', (tripId: string) => {
      socket.join(`ride:${tripId}`);
    });

    socket.on('ride:leave', (tripId: string) => {
      socket.leave(`ride:${tripId}`);
    });

    socket.on(realtimeEvents.chatMessage, (payload) => {
      io.to(`delivery:${payload.deliveryId}`).emit(realtimeEvents.chatMessage, {
        ...payload,
        senderId: user.id,
        sentAt: new Date().toISOString()
      });
    });

    socket.on('disconnect', async () => {
      try {
        await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
      } catch {}
      io.to(`user:${user.id}`).emit(realtimeEvents.userPresence, { userId: user.id, online: false });
      io.to('admins').emit(realtimeEvents.userPresence, { userId: user.id, online: false });
    });
  });
}
