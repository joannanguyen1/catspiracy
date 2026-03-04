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

type GameTimer = { remainingSeconds: number; intervalId: ReturnType<typeof setInterval> };
const gameTimers = new Map<string, GameTimer>();

function stopGameTimer(gameCode: string) {
  const timer = gameTimers.get(gameCode);
  if (timer) {
    clearInterval(timer.intervalId);
    gameTimers.delete(gameCode);
  }
}

// 6 cat suspects; one is randomly chosen as murderer per game
const CAT_IDS = ['whiskers', 'shadow', 'mittens', 'tiger', 'luna', 'oliver'];

// All board rooms (must match frontend BoardView)
const ALL_BOARD_ROOMS = [
  'top-left', 'top-mid', 'top-right',
  'left-mid', 'center', 'right-mid',
  'bottom-left', 'bottom-mid', 'bottom-right',
];

const CLUE_TEXT_POOL = [
  'A paw print near the fish bowl.',
  'Fish scales on the floor.',
  'A napkin with fish oil.',
  'A whisker by the sofa.',
  'Tuna crumbs under the table.',
  'A suspicious hair on the carpet.',
  'Scratches on the cabinet.',
  'A dropped collar tag.',
  'Fish-scented breath on the window.',
];

const ROOM_DISPLAY_NAMES: Record<string, string> = {
  'top-left': 'Cat Tower',
  'top-mid': 'Sunbeam Deck',
  'top-right': 'Dining Room',
  'left-mid': 'Kitchen',
  center: 'Fish Tank',
  'right-mid': 'Yarn Vault',
  'bottom-left': 'Litter Kingdom',
  'bottom-mid': 'Basement Box Fort',
  'bottom-right': 'Nap Chamber',
};

type GameClueAssignment = { roomToClue: Record<string, string>; clueRoomNames: string[] };
const gameClueAssignments = new Map<string, GameClueAssignment>();

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

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

      const game = await prisma.game.create({
        data: {
          code,
          status: 'lobby',
          players: {
            create: { socketId: socket.id, playerName },
          },
        },
        include: { players: true },
      });
      const hostPlayer = game.players[0];
      if (hostPlayer) {
        await prisma.game.update({
          where: { id: game.id },
          data: { hostPlayerId: hostPlayer.id },
        });
      }

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

  socket.on('start_game', async () => {
    try {
      const gameCode = socketToGame.get(socket.id);
      if (!gameCode) {
        socket.emit('start_error', { message: 'Not in a game' });
        return;
      }
      const game = await prisma.game.findUnique({
        where: { code: gameCode },
        include: { players: { orderBy: { id: 'asc' } } },
      });
      if (!game || game.status !== 'lobby') {
        socket.emit('start_error', { message: 'Game not in lobby' });
        return;
      }
      const player = game.players.find((p) => p.socketId === socket.id);
      if (!player) {
        socket.emit('start_error', { message: 'Player not in game' });
        return;
      }
      if (game.hostPlayerId !== player.id) {
        socket.emit('start_error', { message: 'Only the host can start the game' });
        return;
      }
      if (game.players.length < 2) {
        socket.emit('start_error', { message: 'Need at least 2 players to start' });
        return;
      }
      const murdererCatId =
        CAT_IDS[Math.floor(Math.random() * CAT_IDS.length)] as string;
      const firstPlayer = game.players[0];
      if (!firstPlayer) {
        socket.emit('start_error', { message: 'No players' });
        return;
      }
      await prisma.game.update({
        where: { id: game.id },
        data: {
          status: 'playing',
          murdererCatId: murdererCatId,
          currentTurnPlayerId: firstPlayer.id,
          remainingSeconds: 300,
          startedAt: new Date(),
        },
      });
      const shuffledRooms = shuffle([...ALL_BOARD_ROOMS]).slice(0, 4);
      const shuffledClues = shuffle([...CLUE_TEXT_POOL]).slice(0, 4);
      const roomToClue: Record<string, string> = {};
      shuffledRooms.forEach((room, i) => {
        roomToClue[room] = shuffledClues[i] ?? 'A clue was found.';
      });
      gameClueAssignments.set(gameCode, { roomToClue, clueRoomNames: shuffledRooms });
      const payload = {
        status: 'playing' as const,
        players: game.players.map((p) => ({
          id: p.id,
          socketId: p.socketId,
          name: p.playerName,
        })),
        currentTurnSocketId: firstPlayer.socketId,
        remainingSeconds: 300,
        catIds: [...CAT_IDS],
        cluesCollectedCount: 0,
        clueRoomNames: shuffledRooms,
      };
      io.to(getRoom(gameCode)).emit('game_started', payload);
      console.log('Game started:', gameCode);

      const intervalId = setInterval(async () => {
        const t = gameTimers.get(gameCode);
        if (!t) return;
        t.remainingSeconds -= 1;
        io.to(getRoom(gameCode)).emit('timer_update', {
          remainingSeconds: t.remainingSeconds,
        });
        if (t.remainingSeconds <= 0) {
          stopGameTimer(gameCode);
          await prisma.game.update({
            where: { id: game.id },
            data: { status: 'lost', endedAt: new Date(), remainingSeconds: 0 },
          });
          io.to(getRoom(gameCode)).emit('game_lost', { reason: 'time' });
          console.log('Game lost (time):', gameCode);
        }
      }, 1000);
      gameTimers.set(gameCode, { remainingSeconds: 300, intervalId });
    } catch (err) {
      console.error('start_game error:', err);
      socket.emit('start_error', { message: 'Failed to start game' });
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

  socket.on('collect_clue', async (data: { roomName?: string }) => {
    try {
      const gameCode = socketToGame.get(socket.id);
      const roomName = typeof data?.roomName === 'string' ? data.roomName.trim() : '';
      if (!gameCode || !roomName) {
        socket.emit('clue_error', { message: 'Invalid request' });
        return;
      }
      const assignment = gameClueAssignments.get(gameCode);
      if (!assignment || !assignment.roomToClue[roomName]) {
        socket.emit('clue_error', { message: 'No clue in this room' });
        return;
      }
      const game = await prisma.game.findUnique({
        where: { code: gameCode },
        include: { players: { orderBy: { id: 'asc' } } },
      });
      if (!game || game.status !== 'playing') {
        socket.emit('clue_error', { message: 'Game not active' });
        return;
      }
      const player = game.players.find((p) => p.socketId === socket.id);
      if (!player) {
        socket.emit('clue_error', { message: 'Not in game' });
        return;
      }
      if (game.currentTurnPlayerId !== player.id) {
        socket.emit('clue_error', { message: 'Not your turn' });
        return;
      }
      const existing = await prisma.clueDiscovery.findFirst({
        where: { gameId: game.id, roomName },
      });
      if (existing) {
        socket.emit('clue_error', { message: 'Clue already collected here' });
        return;
      }
      const clueText = assignment.roomToClue[roomName] ?? 'A clue was found.';
      await prisma.clueDiscovery.create({
        data: {
          gameId: game.id,
          roomName,
          clueText,
          discoveredById: player.id,
        },
      });
      const discoveries = await prisma.clueDiscovery.findMany({
        where: { gameId: game.id },
        select: { roomName: true },
      });
      const roomsCollected = discoveries.map((d) => d.roomName);
      const cluesCount = roomsCollected.length;
      const playerIndex = game.players.findIndex((p) => p.id === player.id);
      const nextIndex = (playerIndex + 1) % game.players.length;
      const nextPlayer = game.players[nextIndex];
      if (!nextPlayer) {
        socket.emit('clue_error', { message: 'No next player' });
        return;
      }
      await prisma.game.update({
        where: { id: game.id },
        data: { currentTurnPlayerId: nextPlayer.id },
      });
      const roomDisplay = ROOM_DISPLAY_NAMES[roomName] ?? roomName;
      const logMessage = `${player.playerName} found a clue in ${roomDisplay}: "${clueText}"`;
      io.to(getRoom(gameCode)).emit('clue_found', {
        roomName,
        clueText,
        cluesCollectedCount: cluesCount,
        currentTurnSocketId: nextPlayer.socketId,
        roomsCollected,
        logMessage,
      });
    } catch (err) {
      console.error('collect_clue error:', err);
      socket.emit('clue_error', { message: 'Failed to collect clue' });
    }
  });

  socket.on('vote_suspect', async (data: { catId?: string }) => {
    try {
      const gameCode = socketToGame.get(socket.id);
      const catId = typeof data?.catId === 'string' ? data.catId.trim() : '';
      if (!gameCode || !catId) {
        socket.emit('vote_error', { message: 'Invalid vote' });
        return;
      }
      if (!CAT_IDS.includes(catId)) {
        socket.emit('vote_error', { message: 'Unknown suspect' });
        return;
      }
      const game = await prisma.game.findUnique({
        where: { code: gameCode },
        include: { players: true },
      });
      if (!game || game.status !== 'playing') {
        socket.emit('vote_error', { message: 'Game not active' });
        return;
      }
      const player = game.players.find((p) => p.socketId === socket.id);
      if (!player) {
        socket.emit('vote_error', { message: 'Not in game' });
        return;
      }
      const murdererCatId = game.murdererCatId ?? '';
      if (catId === murdererCatId) {
        stopGameTimer(gameCode);
        await prisma.game.update({
          where: { id: game.id },
          data: { status: 'won', endedAt: new Date(), remainingSeconds: 0 },
        });
        io.to(getRoom(gameCode)).emit('game_won', {
          murdererCatId,
          voterName: player.playerName,
        });
        console.log('Game won:', gameCode);
        return;
      }
      const current = game.remainingSeconds ?? 300;
      const newSeconds = Math.max(0, current - 60);
      await prisma.game.update({
        where: { id: game.id },
        data: { remainingSeconds: newSeconds },
      });
      const timer = gameTimers.get(gameCode);
      if (timer) timer.remainingSeconds = newSeconds;
      io.to(getRoom(gameCode)).emit('wrong_vote', {
        remainingSeconds: newSeconds,
        votedCatId: catId,
        voterName: player.playerName,
      });
      if (newSeconds <= 0) {
        stopGameTimer(gameCode);
        await prisma.game.update({
          where: { id: game.id },
          data: { status: 'lost', endedAt: new Date(), remainingSeconds: 0 },
        });
        io.to(getRoom(gameCode)).emit('game_lost', { reason: 'wrong_vote' });
        console.log('Game lost (wrong vote):', gameCode);
      }
    } catch (err) {
      console.error('vote_suspect error:', err);
      socket.emit('vote_error', { message: 'Failed to vote' });
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
            stopGameTimer(gameCode);
            gameClueAssignments.delete(gameCode);
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
