const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// -----------------------------
// Folders
// -----------------------------

const uploadDir = path.join(__dirname, 'uploads');
const databaseDir = path.join(__dirname, 'database');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

if (!fs.existsSync(databaseDir)) {
  fs.mkdirSync(databaseDir, { recursive: true });
}

// -----------------------------
// Message database
// -----------------------------

const messageFile = path.join(databaseDir, 'messages.json');

if (!fs.existsSync(messageFile)) {
  fs.writeFileSync(messageFile, '[]');
}

function loadMessages() {
  try {
    const data = fs.readFileSync(messageFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

function saveMessages(messages) {
  fs.writeFileSync(
    messageFile,
    JSON.stringify(messages, null, 2),
  );
}

let messages = loadMessages();

// -----------------------------
// Image upload
// -----------------------------

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname);
    const fileName =
        `${Date.now()}-${Math.round(Math.random() * 1000000)}${extension}`;

    cb(null, fileName);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

// -----------------------------
// Middleware
// -----------------------------

app.use('/uploads', express.static(uploadDir));

// -----------------------------
// Socket.IO
// -----------------------------

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// -----------------------------
// Basic API
// -----------------------------

app.get('/', (req, res) => {
  res.json({
    app: 'C7PL Chat Server',
    status: 'online',
    messages: messages.length,
  });
});

// -----------------------------
// Get chat history
// -----------------------------

app.get('/messages/:chatId', (req, res) => {
  const chatId = req.params.chatId;

  const chatMessages = messages.filter(
    (message) => message.chatId === chatId,
  );

  res.json(chatMessages);
});

// -----------------------------
// Upload image
// -----------------------------

app.post('/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No image uploaded',
    });
  }

  const imageUrl =
      `/uploads/${req.file.filename}`;

  res.json({
    success: true,
    imageUrl: imageUrl,
    fileName: req.file.filename,
  });
});

// -----------------------------
// Real-time connection
// -----------------------------

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join chat
  socket.on('join_chat', (chatId) => {
    socket.join(chatId);

    const chatMessages = messages.filter(
      (message) => message.chatId === chatId,
    );

    socket.emit('chat_history', chatMessages);

    console.log(
      `${socket.id} joined chat: ${chatId}`,
    );
  });

  // Send message
  socket.on('send_message', (data) => {
    if (!data.chatId || !data.senderId) {
      return;
    }

    const message = {
      id: `${Date.now()}-${Math.round(Math.random() * 1000000)}`,
      chatId: data.chatId,
      senderId: data.senderId,
      senderName: data.senderName || 'C7PL User',
      text: data.text || '',
      imageUrl: data.imageUrl || null,
      createdAt: new Date().toISOString(),
    };

    // Save permanently
    messages.push(message);
    saveMessages(messages);

    // Send instantly to everyone in chat
    io.to(data.chatId).emit(
      'new_message',
      message,
    );
  });

  // Typing
  socket.on('typing', (data) => {
    socket.to(data.chatId).emit(
      'user_typing',
      {
        userId: data.userId,
        userName: data.userName,
      },
    );
  });

  // Stop typing
  socket.on('stop_typing', (data) => {
    socket.to(data.chatId).emit(
      'user_stop_typing',
      {
        userId: data.userId,
      },
    );
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(
      'User disconnected:',
      socket.id,
    );
  });
});

// -----------------------------
// Start server
// -----------------------------

const PORT = 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `C7PL Chat Server running on port ${PORT}`,
  );
});