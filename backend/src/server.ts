import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

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

type Game = {
  code: string;
  hostSocketId: string;
  players: Map<string, { playerName: string }>;
};
const games = new Map<string, Game>();
const socketToGame = new Map<string, string>();

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  } while (games.has(code));
  return code;
}

function getRoom(gameCode: string) {
  return `game:${gameCode}`;
}

function broadcastLobbyToRoom(gameCode: string) {
  const game = games.get(gameCode);
  if (!game) return;
  const players = Array.from(game.players.entries()).map(([id, p]) => ({
    id,
    name: p.playerName,
  }));
  io.to(getRoom(gameCode)).emit('lobby_update', { players });
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create_game', (data: { playerName?: string }) => {
    const playerName = (data?.playerName || 'Anonymous').trim().slice(0, 32);
    const code = generateCode();
    const game: Game = {
      code,
      hostSocketId: socket.id,
      players: new Map([[socket.id, { playerName }]]),
    };
    games.set(code, game);
    socketToGame.set(socket.id, code);
    socket.join(getRoom(code));

    console.log('Game created:', code, 'by', playerName);
    socket.emit('game_created', { gameCode: code, playerName });
    broadcastLobbyToRoom(code);
  });

  socket.on('join_game', (data: { gameCode?: string; playerName?: string }) => {
    const gameCode = (data?.gameCode || '').trim().toUpperCase();
    const playerName = (data?.playerName || 'Anonymous').trim().slice(0, 32);

    const game = games.get(gameCode);
    if (!game) {
      socket.emit('join_error', { message: 'Invalid game code' });
      return;
    }

    game.players.set(socket.id, { playerName });
    socketToGame.set(socket.id, gameCode);
    socket.join(getRoom(gameCode));

    console.log('Player joined game:', gameCode, playerName);
    socket.emit('join_success', { gameCode, playerName });
    io.to(getRoom(gameCode)).emit('player_joined', { id: socket.id, name: playerName });
    broadcastLobbyToRoom(gameCode);
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

  socket.on('disconnect', () => {
    const gameCode = socketToGame.get(socket.id);
    socketToGame.delete(socket.id);
    if (gameCode) {
      const game = games.get(gameCode);
      if (game) {
        const player = game.players.get(socket.id);
        game.players.delete(socket.id);
        if (player) {
          io.to(getRoom(gameCode)).emit('player_left', {
            id: socket.id,
            name: player.playerName,
          });
          broadcastLobbyToRoom(gameCode);
          if (game.players.size === 0) {
            games.delete(gameCode);
            console.log('Game ended:', gameCode);
          }
        }
      }
    } else {
      console.log('User disconnected:', socket.id);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen({ port: PORT, host: '0.0.0.0' }, () => {
  console.log(`Server running on port ${PORT} (accessible from network)`);
});