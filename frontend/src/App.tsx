import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const socket = io('http://localhost:3001');

function App() {
  const [connected, setConnected] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [gameJoined, setGameJoined] = useState(false);

  useEffect(() => {
    socket.on('connect', () => {
      setConnected(true);
      console.log('Connected to server');
    });

    socket.on('disconnect', () => {
      setConnected(false);
      console.log('Disconnected from server');
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const joinGame = () => {
    if (playerName.trim()) {
      socket.emit('join_game', { playerName });
      setGameJoined(true);
    }
  };

  return (
    <div className="App">
      <h1>Cat Murder Mystery Game 🐱🔍</h1>
      <p>Status: {connected ? '🟢 Connected' : '🔴 Disconnected'}</p>
      
      {!gameJoined ? (
        <div>
          <input 
            type="text" 
            placeholder="Enter your name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
          />
          <button onClick={joinGame} disabled={!connected}>
            Join Game
          </button>
        </div>
      ) : (
        <div>
          <h2>Welcome, {playerName}!</h2>
          <p>Game lobby - waiting for other players...</p>
        </div>
      )}
    </div>
  );
}

export default App;