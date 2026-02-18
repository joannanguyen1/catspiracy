import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join_game', (data) => {
    console.log('Player joining game:', data);
    // Game logic will go here
  });
  
  socket.on('collect_clue', (data) => {
    console.log('Clue collected:', data);
    // Game logic will go here
  });
  
  socket.on('vote_suspect', (data) => {
    console.log('Voting on suspect:', data);
    // Game logic will go here
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});