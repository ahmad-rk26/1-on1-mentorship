import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDB } from './db';
import sessionRoutes from './routes/sessions';
import runRoutes from './routes/run';
import { setupSocket } from './socket';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json());

app.use('/api/sessions', sessionRoutes);
app.use('/api/run', runRoutes);
app.get('/health', (_, res) => res.json({ status: 'ok' }));

setupSocket(io);

const PORT = process.env.PORT || 4000;

initDB()
    .then(() => {
        server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch((err) => {
        console.error('Failed to init DB:', err);
        process.exit(1);
    });
