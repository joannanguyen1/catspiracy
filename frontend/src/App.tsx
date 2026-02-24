import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import './App.css';
import BoardView from './components/BoardView';
import CatIcon from './components/CatIcon';
import { getCatDisplayName, getCatAvatarColor, getCatInitial } from './constants/cats';

const socket = io(
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:3001`
    : 'http://localhost:3001'
);

type LobbyPlayer = { id: string; name: string };

type GameStartedPayload = {
  status: 'playing';
  players: { id: number; socketId: string; name: string }[];
  currentTurnSocketId: string;
  remainingSeconds: number;
  catIds: string[];
  cluesCollectedCount: number;
  roomsCollected?: string[];
};

function App() {
  const [connected, setConnected] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [gameCode, setGameCode] = useState('');
  const [gameJoined, setGameJoined] = useState(false);
  const [myGameCode, setMyGameCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [joinError, setJoinError] = useState('');
  const [startError, setStartError] = useState('');
  const [gameStatus, setGameStatus] = useState<'lobby' | 'playing' | 'lost' | 'won'>('lobby');
  const [gameState, setGameState] = useState<GameStartedPayload | null>(null);
  const [gameLog, setGameLog] = useState<string>('Waiting for game to start...');
  const [winPayload, setWinPayload] = useState<{ murdererCatId: string; voterName: string } | null>(null);

  const resetToLobby = () => {
    setGameJoined(false);
    setMyGameCode('');
    setIsHost(false);
    setPlayers([]);
    setGameStatus('lobby');
    setGameState(null);
    setGameLog('Waiting for game to start...');
    setWinPayload(null);
    setStartError('');
    setJoinError('');
  };

  useEffect(() => {
    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  useEffect(() => {
    socket.on('lobby_update', (data: { players: LobbyPlayer[] }) => {
      setPlayers(data.players ?? []);
    });
    socket.on('game_created', (data: { gameCode: string; playerName: string }) => {
      setMyGameCode(data.gameCode);
      setGameJoined(true);
      setIsHost(true);
    });
    socket.on('join_success', (data: { gameCode: string; playerName: string }) => {
      setMyGameCode(data.gameCode);
      setGameJoined(true);
      setJoinError('');
    });
    socket.on('join_error', (data: { message: string }) => {
      setJoinError(data.message ?? 'Failed to join');
    });
    socket.on('game_started', (data: GameStartedPayload) => {
      setGameStatus('playing');
      setGameState({ ...data, roomsCollected: data.roomsCollected ?? [] });
      setStartError('');
      setGameLog('Game started! Find 4 clues and identify the murderer.\n');
    });
    socket.on('clue_found', (data: {
      roomName: string;
      clueText: string;
      cluesCollectedCount: number;
      currentTurnSocketId: string;
      roomsCollected: string[];
      logMessage: string;
    }) => {
      setGameState((prev) =>
        prev
          ? {
              ...prev,
              cluesCollectedCount: data.cluesCollectedCount,
              currentTurnSocketId: data.currentTurnSocketId,
              roomsCollected: data.roomsCollected,
            }
          : null
      );
      setGameLog((log) => log + data.logMessage + '\n');
    });
    socket.on('clue_error', (data: { message: string }) => {
      setGameLog((log) => log + `(Error: ${data.message})\n`);
    });
    socket.on('start_error', (data: { message: string }) => {
      setStartError(data.message ?? 'Failed to start');
    });
    socket.on('timer_update', (data: { remainingSeconds: number }) => {
      setGameState((prev) =>
        prev ? { ...prev, remainingSeconds: data.remainingSeconds } : null
      );
    });
    socket.on('game_lost', () => {
      setGameStatus('lost');
    });
    socket.on('game_won', (data: { murdererCatId: string; voterName: string }) => {
      setGameStatus('won');
      setWinPayload({ murdererCatId: data.murdererCatId, voterName: data.voterName });
    });
    socket.on('wrong_vote', (data: { remainingSeconds: number; votedCatId: string; voterName: string }) => {
      setGameState((prev) =>
        prev ? { ...prev, remainingSeconds: data.remainingSeconds } : null
      );
      setGameLog(
        (log) =>
          log +
          `${data.voterName} accused ${getCatDisplayName(data.votedCatId)}. Wrong! -1 minute.\n`
      );
    });
    socket.on('vote_error', (data: { message: string }) => {
      setGameLog((log) => log + `(Vote error: ${data.message})\n`);
    });
    return () => {
      socket.off('lobby_update');
      socket.off('game_created');
      socket.off('join_success');
      socket.off('join_error');
      socket.off('game_started');
      socket.off('start_error');
      socket.off('timer_update');
      socket.off('game_lost');
      socket.off('game_won');
      socket.off('wrong_vote');
      socket.off('vote_error');
      socket.off('clue_found');
      socket.off('clue_error');
    };
  }, []);

  const createGame = () => {
    if (playerName.trim()) {
      setJoinError('');
      socket.emit('create_game', { playerName: playerName.trim() });
    }
  };

  const joinGame = () => {
    if (playerName.trim() && gameCode.trim()) {
      setJoinError('');
      socket.emit('join_game', {
        gameCode: gameCode.trim().toUpperCase(),
        playerName: playerName.trim(),
      });
    }
  };

  const startGame = () => {
    setStartError('');
    socket.emit('start_game');
  };

  // ——— Pre-join: single lobby card (create or join) ———
  if (!gameJoined) {
    return (
      <div className="App lobby-screen">
        <div className="lobby-card">
          <div className="cat-icon-wrap">
            <CatIcon />
          </div>
          <h1 className="game-title">CATSPIRACY</h1>
          <p className="tagline">Who ate the fish?</p>

          <div className="field">
            <label className="field-label" htmlFor="detective-name">
              DETECTIVE NAME
            </label>
            <input
              id="detective-name"
              type="text"
              placeholder="Enter your name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn-create"
            onClick={createGame}
            disabled={!connected || !playerName.trim()}
          >
            <span aria-hidden>🔍</span> CREATE NEW CASE
          </button>

          <div className="lobby-divider">OR JOIN EXISTING</div>

          <div className="join-row">
            <div className="field">
              <label className="field-label" htmlFor="game-code">
                GAME CODE
              </label>
              <input
                id="game-code"
                type="text"
                placeholder="Code"
                value={gameCode}
                onChange={(e) => setGameCode(e.target.value.toUpperCase())}
                maxLength={6}
                style={{ textTransform: 'uppercase' }}
              />
            </div>
            <button
              type="button"
              className="btn-join"
              onClick={joinGame}
              disabled={!connected || !playerName.trim() || !gameCode.trim()}
            >
              JOIN
            </button>
          </div>

          {joinError && <p className="lobby-error">{joinError}</p>}
        </div>
      </div>
    );
  }

  // ——— Waiting room (after join, before start) ———
  if (gameStatus === 'lobby') {
    return (
      <div className="App lobby-screen">
        <div className="waiting-room-card">
          <div className="cat-icon-wrap">
            <CatIcon />
          </div>
          <h1 className="game-title">CATSPIRACY</h1>
          <p className="tagline">Who ate the fish?</p>
          <p className="game-code-display">{myGameCode}</p>
          <p style={{ fontSize: '0.85rem', color: '#555', margin: '0 0 8px' }}>
            Players in this game ({players.length})
          </p>
          <ul className="players-list">
            {players.map((p) => (
              <li key={p.id}>
                {p.name} {isHost && p.id === socket.id ? '(you, host)' : ''}
              </li>
            ))}
          </ul>
          {isHost && (
            <button
              type="button"
              className="btn-start"
              onClick={startGame}
              disabled={players.length < 2}
            >
              Start game {players.length < 2 ? '(need 2+ players)' : ''}
            </button>
          )}
          {!isHost && (
            <p style={{ fontSize: '0.9rem', color: '#555' }}>
              Waiting for host to start…
            </p>
          )}
          {startError && <p className="lobby-error">{startError}</p>}
        </div>
      </div>
    );
  }

  // ——— Won ———
  if (gameStatus === 'won' && winPayload) {
    return (
      <div className="App won-screen">
        <div className="won-card">
          <h2>You caught the murderer!</h2>
          <p>
            {winPayload.voterName} correctly identified{' '}
            <strong>{getCatDisplayName(winPayload.murdererCatId)}</strong> as the fish thief. 🐟🔍
          </p>
          <button type="button" className="btn-play-again" onClick={resetToLobby}>
            Play again
          </button>
        </div>
      </div>
    );
  }

  // ——— Lost ———
  if (gameStatus === 'lost') {
    return (
      <div className="App lost-screen">
        <div className="lost-card">
          <h2>Time&apos;s up!</h2>
          <p>The fish murderer got away… 🐟</p>
          <button type="button" className="btn-play-again" onClick={resetToLobby}>
            Play again
          </button>
        </div>
      </div>
    );
  }

  // ——— Playing: header + panels (suspects | map | objectives + log) ———
  if (gameStatus === 'playing' && gameState) {
    const isMyTurn = gameState.currentTurnSocketId === socket.id;
    const minutes = Math.floor(gameState.remainingSeconds / 60);
    const seconds = gameState.remainingSeconds % 60;

    return (
      <div className="App game-screen">
        <header className="game-header">
          <span>CATSPIRACY</span>
          <span className="timer">
            🕐 {minutes}:{seconds.toString().padStart(2, '0')}
          </span>
        </header>

        <main className="game-main">
          <section className="game-panel suspects">
            <h3>SUSPECTS</h3>
            <div className="suspects-grid">
              {gameState.catIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="suspect-card"
                  onClick={() => socket.emit('vote_suspect', { catId: id })}
                  aria-label={`Vote for ${getCatDisplayName(id)}`}
                >
                  <div
                    className="avatar"
                    style={{ background: getCatAvatarColor(id) }}
                  >
                    {getCatInitial(id)}
                  </div>
                  <div className="name">{getCatDisplayName(id)}</div>
                </button>
              ))}
            </div>
            <div className="suspect-note">
              Clicking a suspect initiates a &quot;Vote&quot; action. Incorrect votes
              reduce the timer by 1 minute.
            </div>
          </section>

          <section className="game-panel map-panel">
            <h3>HOUSE MAP</h3>
            <span className="clues-badge">
              {gameState.cluesCollectedCount} / 4 CLUES FOUND
            </span>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <BoardView
                clueRoomNames={['left-mid', 'center', 'top-right', 'bottom-left']}
                isMyTurn={isMyTurn}
                roomsCollected={gameState.roomsCollected ?? []}
                onRoomClick={(roomName: string) => socket.emit('collect_clue', { roomName })}
              />
            </div>
            <p className="map-instruction">
              Click a location to use 1 turn and search for clues.
            </p>
            <div>
              {isMyTurn ? (
                <span className="turn-badge my-turn">Your turn</span>
              ) : (
                <span className="turn-badge other-turn">
                  Waiting for another player&apos;s turn…
                </span>
              )}
            </div>
          </section>

          <section className="game-panel objectives">
            <h3>CURRENT OBJECTIVE</h3>
            <ul>
              <li>Find 4 clues ({gameState.cluesCollectedCount}/4)</li>
              <li>Identify the murderer before time runs out</li>
              <li>Avoid false accusations (-1 minute penalty)</li>
            </ul>
            <div className="server-status">
              {connected
                ? 'Connected via WebSocket.'
                : 'Disconnected.'}{' '}
              <span className="game-id">Game #{myGameCode}</span>
            </div>
          </section>

          <section className="game-panel log-panel">
            <h3>GAME LOG</h3>
            <div className="log-content">{gameLog}</div>
          </section>
        </main>
      </div>
    );
  }

  return null;
}

export default App;
