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

/** When a player disconnects we set their socketId to this so they can rejoin by code + name. */
const DISCONNECTED_SOCKET_ID = '__disconnected__';

type GameTimer = { remainingSeconds: number; intervalId: ReturnType<typeof setInterval> };
const gameTimers = new Map<string, GameTimer>();

const gameDetectiveSelections = new Map<string, Map<string, string>>();

/** Persistent detective choice by player ID (survives disconnect for rejoin). gameCode -> playerId -> detectiveId */
const gamePlayerToDetective = new Map<string, Map<number, string>>();

/** During final round: gameCode -> [catId1, catId2]. After final minigame: gameCode -> single remaining (murderer). */
const gameFinalTwoSuspects = new Map<string, string[]>();
const gameRemainingSuspectAfterFinal = new Map<string, string>();

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

const CAT_DISPLAY_NAMES: Record<string, string> = {
  whiskers: 'Whiskers',
  shadow:   'Shadow',
  mittens:  'Mittens',
  tiger:    'Tiger',
  luna:     'Luna',
  oliver:   'Oliver',
};

const ALIBI_POOL = [
  '%CAT% was spotted napping in the %ROOM% all evening — the fur impression in the cushion is still warm.',
  'Security footage from the %ROOM% clearly shows %CAT% chasing a moth for three straight hours.',
  '%CAT% knocked over a potted plant in the %ROOM% and spent the entire night cleaning up the soil.',
  'Fresh paw prints throughout the %ROOM% were DNA-matched to %CAT%, who never left the area.',
  '%CAT% was hopelessly tangled in the %ROOM% curtains and had to be rescued well past midnight.',
  '%CAT% was caught on camera batting a bottle cap around the %ROOM% the entire evening.',
  'A hairball found in the %ROOM% was DNA-matched to %CAT%. Clearly preoccupied with other matters.',
  '%CAT% held an unbroken 3-hour grooming session in the %ROOM%. No time for crime.',
  '%CAT% had been loudly demanding attention in the %ROOM% all night — multiple witnesses confirm it.',
  '%CAT% was spotted staring intensely at a wall in the %ROOM% for hours, hunting imaginary prey.',
  'A knocked-over glass of water in the %ROOM% perfectly matches %CAT%\'s signature chaos pattern.',
  '%CAT% was busy yowling at nothing in the %ROOM% — the neighbours filed a noise complaint.',
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

type GameClueAssignment = {
  roomToClue: Record<string, string>;
  clueRoomNames: string[];
  roomToCatId: Record<string, string>; // which innocent cat is exonerated by this room's clue
};
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
    id: p.socketId === DISCONNECTED_SOCKET_ID ? `disconnected:${p.id}` : p.socketId,
    name: p.playerName,
    connected: p.socketId !== DISCONNECTED_SOCKET_ID,
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
      const connectedPlayers = game.players.filter((p) => p.socketId !== DISCONNECTED_SOCKET_ID);
      if (connectedPlayers.length < 2) {
        socket.emit('start_error', { message: 'Need at least 2 players connected to start' });
        return;
      }
      const murdererCatId =
        CAT_IDS[Math.floor(Math.random() * CAT_IDS.length)] as string;
      const firstPlayer = connectedPlayers[0];
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
      const innocentCats = shuffle(CAT_IDS.filter((id) => id !== murdererCatId)).slice(0, 4);
      const shuffledAlibis = shuffle([...ALIBI_POOL]).slice(0, 4);
      const roomToClue: Record<string, string> = {};
      const roomToCatId: Record<string, string> = {};
      shuffledRooms.forEach((room, i) => {
        const catId = innocentCats[i] ?? innocentCats[0] ?? 'whiskers';
        const catName = CAT_DISPLAY_NAMES[catId] ?? catId;
        const roomName = ROOM_DISPLAY_NAMES[room] ?? room;
        const alibi = (shuffledAlibis[i] ?? ALIBI_POOL[0] ?? '')
          .replace('%CAT%', catName)
          .replace('%ROOM%', roomName);
        roomToClue[room] = alibi;
        roomToCatId[room] = catId;
      });
      gameClueAssignments.set(gameCode, { roomToClue, clueRoomNames: shuffledRooms, roomToCatId });
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
          gameFinalTwoSuspects.delete(gameCode);
          gameRemainingSuspectAfterFinal.delete(gameCode);
          await prisma.game.update({
            where: { id: game.id },
            data: { status: 'lost', endedAt: new Date(), remainingSeconds: 0 },
          });
          io.to(getRoom(gameCode)).emit('game_lost', { reason: 'time', murdererCatId });
          console.log('Game lost (time):', gameCode);
        }
      }, 1000);
      gameTimers.set(gameCode, { remainingSeconds: 300, intervalId });
    } catch (err) {
      console.error('start_game error:', err);
      socket.emit('start_error', { message: 'Failed to start game' });
    }
  });

  socket.on('rejoin_game', async (data: { gameCode?: string; playerName?: string }) => {
    try {
      const gameCode = (data?.gameCode || '').trim().toUpperCase();
      const playerName = (data?.playerName || 'Anonymous').trim().slice(0, 32);
      if (!gameCode || !playerName) {
        socket.emit('rejoin_error', { message: 'Game code and name required' });
        return;
      }
      const game = await prisma.game.findUnique({
        where: { code: gameCode },
        include: { players: { orderBy: { id: 'asc' } }, clueDiscoveries: true },
      });
      if (!game) {
        socket.emit('rejoin_error', { message: 'Game not found' });
        return;
      }
      if (game.status === 'won' || game.status === 'lost') {
        socket.emit('rejoin_error', { message: 'Game has ended' });
        return;
      }
      const player = game.players.find(
        (p) => p.playerName === playerName && p.socketId === DISCONNECTED_SOCKET_ID
      );
      if (!player) {
        socket.emit('rejoin_error', { message: 'No disconnected player with that name in this game' });
        return;
      }
      await prisma.player.update({
        where: { id: player.id },
        data: { socketId: socket.id },
      });
      socketToGame.set(socket.id, gameCode);
      socket.join(getRoom(gameCode));

      const assignment = gameClueAssignments.get(gameCode);
      const roomsCollected = game.clueDiscoveries.map((d) => d.roomName);
      const eliminatedFromClues = assignment
        ? roomsCollected.map((r) => assignment.roomToCatId[r]).filter(Boolean)
        : [];

      if (game.status === 'lobby') {
        socket.emit('rejoin_success', {
          gameCode,
          playerName,
          status: 'lobby',
          isHost: game.hostPlayerId === player.id,
        });
        await broadcastLobbyToRoom(gameCode);
        console.log('Player rejoined lobby:', gameCode, playerName);
        return;
      }

      const currentTurn = game.players.find((p) => p.id === game.currentTurnPlayerId);
      const currentTurnSocketId =
        currentTurn?.id === player.id ? socket.id : (currentTurn?.socketId ?? game.players[0]?.socketId ?? '');
      const timer = gameTimers.get(gameCode);
      const remainingSeconds = timer?.remainingSeconds ?? game.remainingSeconds ?? 0;
      const clueRoomNames = assignment?.clueRoomNames ?? [];
      const finalTwo = gameFinalTwoSuspects.get(gameCode);
      const remainingAfterFinal = gameRemainingSuspectAfterFinal.get(gameCode);

      const playerToDetective = gamePlayerToDetective.get(gameCode);
      const myDetectiveId = playerToDetective?.get(player.id);
      if (myDetectiveId && gameDetectiveSelections.has(gameCode)) {
        gameDetectiveSelections.get(gameCode)!.set(socket.id, myDetectiveId);
        const selections = Object.fromEntries(gameDetectiveSelections.get(gameCode)!);
        io.to(getRoom(gameCode)).emit('detective_selections', { selections });
      }

      const payload = {
        status: game.status as 'playing' | 'final_round',
        gameCode,
        playerName,
        isHost: game.hostPlayerId === player.id,
        myDetectiveId: myDetectiveId ?? undefined,
        players: game.players.map((p) => ({
          id: p.id,
          socketId: p.id === player.id ? socket.id : p.socketId,
          name: p.playerName,
        })),
        currentTurnSocketId: currentTurnSocketId,
        remainingSeconds,
        catIds: [...CAT_IDS],
        cluesCollectedCount: roomsCollected.length,
        roomsCollected,
        clueRoomNames,
        eliminatedCatIds: eliminatedFromClues,
        finalRoundSuspects: finalTwo ?? undefined,
        remainingSuspectsAfterFinal: remainingAfterFinal ? [remainingAfterFinal] : undefined,
      };
      socket.emit('rejoin_success', payload);
      console.log('Player rejoined game:', gameCode, playerName);
    } catch (err) {
      console.error('rejoin_game error:', err);
      socket.emit('rejoin_error', { message: 'Failed to rejoin' });
    }
  });

  socket.on('join_game', async (data: { gameCode?: string; playerName?: string }) => {
    try {
      const gameCode = (data?.gameCode || '').trim().toUpperCase();
      const playerName = (data?.playerName || 'Anonymous').trim().slice(0, 32);

      const game = await prisma.game.findUnique({
        where: { code: gameCode },
        include: { players: true },
      });
      if (!game || game.status !== 'lobby') {
        socket.emit('join_error', { message: 'Invalid game code' });
        return;
      }
      const existingSameName = game.players.some((p) => p.playerName === playerName);
      if (existingSameName) {
        socket.emit('join_error', { message: 'A player with that name is already in this game. Use the same name and click Join to rejoin if you disconnected.' });
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
      const eliminatedCatId = assignment.roomToCatId[roomName] ?? '';
      const eliminatedCatName = CAT_DISPLAY_NAMES[eliminatedCatId] ?? eliminatedCatId;
      const logMessage =
        `🔍 ${player.playerName} searched the ${roomDisplay}:\n` +
        `"${clueText}"\n` +
        `✅ ${eliminatedCatName} has been cleared as a suspect.`;
      io.to(getRoom(gameCode)).emit('clue_found', {
        roomName,
        clueText,
        cluesCollectedCount: cluesCount,
        currentTurnSocketId: nextPlayer.socketId,
        roomsCollected,
        logMessage,
        eliminatedCatId,
      });

      if (cluesCount === 4) {
        const eliminatedFromClues = roomsCollected.map((r) => assignment.roomToCatId[r]).filter(Boolean);
        const finalTwoSuspects = CAT_IDS.filter((id) => !eliminatedFromClues.includes(id));
        gameFinalTwoSuspects.set(gameCode, finalTwoSuspects);
        await prisma.game.update({
          where: { id: game.id },
          data: { status: 'final_round' },
        });
        io.to(getRoom(gameCode)).emit('final_round_start', {
          finalTwoSuspects,
          logMessage: '🔎 All four clues found! Complete the final challenge to narrow the suspects to one.',
        });
      }
    } catch (err) {
      console.error('collect_clue error:', err);
      socket.emit('clue_error', { message: 'Failed to collect clue' });
    }
  });

  socket.on('final_minigame_complete', async () => {
    try {
      const gameCode = socketToGame.get(socket.id);
      if (!gameCode) return;
      const game = await prisma.game.findUnique({
        where: { code: gameCode },
      });
      if (!game || game.status !== 'final_round') {
        socket.emit('final_minigame_error', { message: 'Not in final round' });
        return;
      }
      const player = await prisma.player.findFirst({
        where: { gameId: game.id, socketId: socket.id },
      });
      if (!player) return;
      const twoSuspects = gameFinalTwoSuspects.get(gameCode);
      if (!twoSuspects || twoSuspects.length !== 2) return;
      const murdererCatId = game.murdererCatId ?? '';
      const eliminated = twoSuspects.find((id) => id !== murdererCatId) ?? twoSuspects[0] ?? '';
      const remaining = murdererCatId;
      gameFinalTwoSuspects.delete(gameCode);
      gameRemainingSuspectAfterFinal.set(gameCode, remaining);
      await prisma.game.update({
        where: { id: game.id },
        data: { status: 'playing' },
      });
      const eliminatedName = eliminated ? (CAT_DISPLAY_NAMES[eliminated] ?? eliminated) : 'A suspect';
      io.to(getRoom(gameCode)).emit('final_round_complete', {
        remainingSuspects: [remaining],
        eliminatedCatId: eliminated,
        logMessage: `✅ Final challenge complete! ${eliminatedName} has been cleared. One suspect remains.`,
      });
    } catch (err) {
      console.error('final_minigame_complete error:', err);
      socket.emit('final_minigame_error', { message: 'Failed to complete' });
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
        gameFinalTwoSuspects.delete(gameCode);
        gameRemainingSuspectAfterFinal.delete(gameCode);
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
      // Wrong accusation = instant game over
      stopGameTimer(gameCode);
      gameFinalTwoSuspects.delete(gameCode);
      gameRemainingSuspectAfterFinal.delete(gameCode);
      await prisma.game.update({
        where: { id: game.id },
        data: { status: 'lost', endedAt: new Date(), remainingSeconds: 0 },
      });
      io.to(getRoom(gameCode)).emit('game_lost', {
        reason: 'wrong_vote',
        voterName: player.playerName,
        votedCatId: catId,
        murdererCatId,
      });
      console.log('Game lost (wrong vote):', gameCode);
    } catch (err) {
      console.error('vote_suspect error:', err);
      socket.emit('vote_error', { message: 'Failed to vote' });
    }
  });

  socket.on('move_player', (data: { row?: number; col?: number }) => {
    const gameCode = socketToGame.get(socket.id);
    if (!gameCode) return;
    const row = typeof data?.row === 'number' ? Math.max(0, Math.min(27, Math.floor(data.row))) : 0;
    const col = typeof data?.col === 'number' ? Math.max(0, Math.min(27, Math.floor(data.col))) : 0;
    socket.to(getRoom(gameCode)).emit('player_moved', { socketId: socket.id, row, col });
  });

  socket.on('select_detective', async (data: { detectiveId?: string }) => {
    const gameCode = socketToGame.get(socket.id);
    if (!gameCode) return;
    const detectiveId = typeof data?.detectiveId === 'string' ? data.detectiveId.trim() : '';
    if (!detectiveId) return;

    if (!gameDetectiveSelections.has(gameCode)) {
      gameDetectiveSelections.set(gameCode, new Map());
    }
    gameDetectiveSelections.get(gameCode)!.set(socket.id, detectiveId);

    if (!gamePlayerToDetective.has(gameCode)) {
      gamePlayerToDetective.set(gameCode, new Map());
    }
    try {
      const player = await prisma.player.findFirst({
        where: { socketId: socket.id, game: { code: gameCode } },
        select: { id: true },
      });
      if (player) {
        gamePlayerToDetective.get(gameCode)!.set(player.id, detectiveId);
      }
    } catch {
      /* ignore */
    }

    const selections = Object.fromEntries(gameDetectiveSelections.get(gameCode)!);
    io.to(getRoom(gameCode)).emit('detective_selections', { selections });
  });

  socket.on('disconnect', async () => {
    const gameCode = socketToGame.get(socket.id);
    socketToGame.delete(socket.id);

    if (gameCode) {
      const selMap = gameDetectiveSelections.get(gameCode);
      if (selMap) {
        selMap.delete(socket.id);
        if (selMap.size === 0) {
          gameDetectiveSelections.delete(gameCode);
        } else {
          const selections = Object.fromEntries(selMap);
          io.to(getRoom(gameCode)).emit('detective_selections', { selections });
        }
      }

      try {
        const player = await prisma.player.findFirst({
          where: { socketId: socket.id },
          include: { game: true },
        });
        if (player) {
          await prisma.player.update({
            where: { id: player.id },
            data: { socketId: DISCONNECTED_SOCKET_ID },
          });
          io.to(getRoom(gameCode)).emit('player_left', {
            id: socket.id,
            name: player.playerName,
          });
          await broadcastLobbyToRoom(gameCode);

          const connectedCount = await prisma.player.count({
            where: { gameId: player.gameId, socketId: { not: DISCONNECTED_SOCKET_ID } },
          });
          if (connectedCount === 0) {
            stopGameTimer(gameCode);
            gameClueAssignments.delete(gameCode);
            gameDetectiveSelections.delete(gameCode);
            gamePlayerToDetective.delete(gameCode);
            gameFinalTwoSuspects.delete(gameCode);
            gameRemainingSuspectAfterFinal.delete(gameCode);
            await prisma.game.delete({ where: { id: player.gameId } });
            console.log('Game ended (no players connected):', gameCode);
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
