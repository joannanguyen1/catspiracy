import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import './App.css';
import BoardView from "./components/BoardView";

const socket = io(
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:3001`
    : 'http://localhost:3001'
);

type LobbyPlayer = { id: string; name: string };

function App() {
  const [connected, setConnected] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [gameCode, setGameCode] = useState('');
  const [gameJoined, setGameJoined] = useState(false);
  const [myGameCode, setMyGameCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [joinError, setJoinError] = useState('');
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');

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
      setPlayers(data.players || []);
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
      setJoinError(data.message || 'Failed to join');
    });
    return () => {
      socket.off('lobby_update');
      socket.off('game_created');
      socket.off('join_success');
      socket.off('join_error');
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

  if (!gameJoined) {
    return (
      <div className="App">
        <h1>Cat Murder Mystery Game</h1>
        <p>Status: {connected ? '🟢 Connected' : '🔴 Disconnected'}</p>

        <input
          type="text"
          placeholder="Enter your name"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
        />

        {mode === 'choose' && (
          <div style={{ marginTop: 16 }}>
            <button onClick={() => setMode('create')} disabled={!connected}>
              Create Game
            </button>
            <button onClick={() => setMode('join')} disabled={!connected}>
              Join Game
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div style={{ marginTop: 16 }}>
            <button onClick={createGame} disabled={!connected || !playerName.trim()}>
              Create &amp; Start
            </button>
            <button onClick={() => setMode('choose')}>Back</button>
          </div>
        )}

        {mode === 'join' && (
          <div style={{ marginTop: 16 }}>
            <input
              type="text"
              placeholder="Enter game code"
              value={gameCode}
              onChange={(e) => setGameCode(e.target.value.toUpperCase())}
              maxLength={6}
              style={{ textTransform: 'uppercase', width: 120 }}
            />
            <button onClick={joinGame} disabled={!connected || !playerName.trim() || !gameCode.trim()}>
              Join
            </button>
            <button onClick={() => setMode('choose')}>Back</button>
          </div>
        )}

        {joinError && <p style={{ color: 'red', marginTop: 8 }}>{joinError}</p>}
      </div>
    );
  }

  return (
    <div className="App">
      <h1>Cat Murder Mystery Game</h1>
      <p>Status: {connected ? '🟢 Connected' : '🔴 Disconnected'}</p>
      <h2>Welcome, {playerName}!</h2>
      <p><strong>Game code: {myGameCode}</strong> — share this so others can join</p>
      <p>Players in this game ({players.length}):</p>
      <ul>
        {players.map((p) => (
          <li key={p.id}>{p.name} {isHost && p.id === socket.id ? '(you, host)' : ''}</li>
        ))}
      </ul>
      <BoardView />
    </div>
  );
}

export default App;