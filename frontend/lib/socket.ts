import { io, Socket } from 'socket.io-client';
import { getToken } from './auth';

let socket: Socket | null = null;

export async function getSocket(): Promise<Socket> {
    if (!socket) {
        const token = await getToken();
        socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000', {
            auth: { token },
            autoConnect: false,
        });
    }
    return socket;
}

export function disconnectSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
}
