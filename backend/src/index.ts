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

// Allow both local dev and deployed frontend simultaneously
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

const corsOptions = {
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
        // Allow requests with no origin (e.g. curl, Postman, server-to-server)
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
};

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

app.use(cors(corsOptions));
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
