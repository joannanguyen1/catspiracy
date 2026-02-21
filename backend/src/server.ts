import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import prisma from './db';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

const socketToGame = new Map<string, string>();

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}

function getRoom(gameCode: string) {
  return `game:${gameCode}`;
}

async function broadcastLobbyToRoom(gameCode: string) {
  const game = await prisma.game.findUnique({
    where: { code: gameCode },
    include: { players: true },
  });
  if (!game) return;
  const players = game.players.map((p) => ({
    id: p.socketId,
    name: p.playerName,
  }));
  io.to(getRoom(gameCode)).emit('lobby_update', { players });
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create_game', async (data: { playerName?: string }) => {
    try {
      const playerName = (data?.playerName || 'Anonymous').trim().slice(0, 32);
      let code = generateCode();
      let existing = await prisma.game.findUnique({ where: { code } });
      while (existing) {
        code = generateCode();
        existing = await prisma.game.findUnique({ where: { code } });
      }

      await prisma.game.create({
        data: {
          code,
          status: 'lobby',
          players: {
            create: { socketId: socket.id, playerName },
          },
        },
      });

      socketToGame.set(socket.id, code);
      socket.join(getRoom(code));

      console.log('Game created:', code, 'by', playerName);
      socket.emit('game_created', { gameCode: code, playerName });
      await broadcastLobbyToRoom(code);
    } catch (err) {
      console.error('create_game error:', err);
      socket.emit('join_error', { message: 'Failed to create game' });
    }
  });

  socket.on('join_game', async (data: { gameCode?: string; playerName?: string }) => {
    try {
      const gameCode = (data?.gameCode || '').trim().toUpperCase();
      const playerName = (data?.playerName || 'Anonymous').trim().slice(0, 32);

      const game = await prisma.game.findUnique({
        where: { code: gameCode },
      });
      if (!game || game.status !== 'lobby') {
        socket.emit('join_error', { message: 'Invalid game code' });
        return;
      }

      await prisma.player.create({
        data: { gameId: game.id, socketId: socket.id, playerName },
      });

      socketToGame.set(socket.id, gameCode);
      socket.join(getRoom(gameCode));

      console.log('Player joined game:', gameCode, playerName);
      socket.emit('join_success', { gameCode, playerName });
      io.to(getRoom(gameCode)).emit('player_joined', { id: socket.id, name: playerName });
      await broadcastLobbyToRoom(gameCode);
    } catch (err) {
      console.error('join_game error:', err);
      socket.emit('join_error', { message: 'Failed to join game' });
    }
  });

  socket.on('collect_clue', (data: unknown) => {
    const gameCode = socketToGame.get(socket.id);
    if (gameCode) {
      io.to(getRoom(gameCode)).emit('clue_collected', data);
    }
  });

  socket.on('vote_suspect', (data: unknown) => {
    const gameCode = socketToGame.get(socket.id);
    if (gameCode) {
      io.to(getRoom(gameCode)).emit('vote_cast', data);
    }
  });

  socket.on('disconnect', async () => {
    const gameCode = socketToGame.get(socket.id);
    socketToGame.delete(socket.id);

    if (gameCode) {
      try {
        const player = await prisma.player.findFirst({
          where: { socketId: socket.id },
          include: { game: true },
        });
        if (player) {
          await prisma.player.delete({ where: { id: player.id } });
          io.to(getRoom(gameCode)).emit('player_left', {
            id: socket.id,
            name: player.playerName,
          });
          await broadcastLobbyToRoom(gameCode);

          const remaining = await prisma.player.count({
            where: { gameId: player.gameId },
          });
          if (remaining === 0) {
            await prisma.game.delete({ where: { id: player.gameId } });
            console.log('Game ended:', gameCode);
          }
        }
      } catch (err) {
        console.error('disconnect error:', err);
      }
    } else {
      console.log('User disconnected:', socket.id);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen({ port: Number(PORT), host: '0.0.0.0' }, () => {
  console.log(`Server running on port ${PORT} (accessible from network)`);
});
