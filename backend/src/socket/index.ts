import { Server, Socket } from 'socket.io';
import { supabase } from '../supabase';

interface UserPayload {
    id: string;
    name: string;
    role: string;
}

const sessionUsers: Record<string, Set<string>> = {};

export function setupSocket(io: Server) {
    // Auth middleware — verify Supabase JWT
    io.use(async (socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) return next(new Error('No token'));

        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data.user) return next(new Error('Invalid token'));

        const meta = data.user.user_metadata as { name?: string; role?: string };
        (socket as any).user = {
            id: data.user.id,
            name: meta.name || 'Unknown',
            role: meta.role || 'student',
        };
        next();
    });

    io.on('connection', (socket: Socket) => {
        const user = (socket as any).user as UserPayload;

        socket.on('join-session', (sessionId: string) => {
            socket.join(sessionId);
            if (!sessionUsers[sessionId]) sessionUsers[sessionId] = new Set();
            sessionUsers[sessionId].add(user.id);
            socket.to(sessionId).emit('user-joined', { userId: user.id, name: user.name, role: user.role });
            socket.emit('session-joined', { userId: user.id, name: user.name, role: user.role });
        });

        // Mentor signals they entered the video call
        socket.on('mentor-in-call', ({ sessionId }: { sessionId: string }) => {
            if (user.role !== 'mentor') return;
            socket.to(sessionId).emit('mentor-in-call');
        });

        // Mentor signals they left the video call
        socket.on('mentor-left-call', ({ sessionId }: { sessionId: string }) => {
            if (user.role !== 'mentor') return;
            socket.to(sessionId).emit('mentor-left-call');
        });

        // ── Code sync ──────────────────────────────────────────────────────
        socket.on('code-change', ({ sessionId, code, language }: { sessionId: string; code: string; language: string }) => {
            socket.to(sessionId).emit('code-update', { code, language, from: user.id });
        });

        socket.on('language-change', ({ sessionId, language }: { sessionId: string; language: string }) => {
            socket.to(sessionId).emit('language-update', { language });
        });

        // ── Chat ───────────────────────────────────────────────────────────
        socket.on('send-message', async ({ sessionId, content }: { sessionId: string; content: string }) => {
            if (!content?.trim()) return;
            const { data, error } = await supabase
                .from('messages')
                .insert({ session_id: sessionId, user_id: user.id, content: content.trim() })
                .select()
                .single();

            if (error) return socket.emit('error', 'Failed to send message');

            io.to(sessionId).emit('new-message', {
                ...data,
                user_name: user.name,
                user_role: user.role,
            });
        });

        // ── File system sync ───────────────────────────────────────────────
        socket.on('fs-sync', ({ sessionId, tree }: { sessionId: string; tree: unknown }) => {
            socket.to(sessionId).emit('fs-tree', { tree });
        });
        socket.on('fs-file-update', ({ sessionId, fileId, content }: { sessionId: string; fileId: string; content: string }) => {
            socket.to(sessionId).emit('fs-file-update', { fileId, content });
        });
        socket.on('fs-create', ({ sessionId, parentId, node }: { sessionId: string; parentId: string | null; node: unknown }) => {
            socket.to(sessionId).emit('fs-create', { parentId, node });
        });
        socket.on('fs-rename', ({ sessionId, id: nid, name }: { sessionId: string; id: string; name: string }) => {
            socket.to(sessionId).emit('fs-rename', { id: nid, name });
        });
        socket.on('fs-delete', ({ sessionId, id: nid }: { sessionId: string; id: string }) => {
            socket.to(sessionId).emit('fs-delete', { id: nid });
        });
        socket.on('fs-open-file', ({ sessionId, fileId }: { sessionId: string; fileId: string }) => {
            socket.to(sessionId).emit('fs-open-file', { fileId });
        });
        socket.on('webrtc-offer', ({ sessionId, offer }: { sessionId: string; offer: unknown }) => {
            socket.to(sessionId).emit('webrtc-offer', { offer, from: user.id });
        });

        socket.on('webrtc-answer', ({ sessionId, answer }: { sessionId: string; answer: unknown }) => {
            socket.to(sessionId).emit('webrtc-answer', { answer, from: user.id });
        });

        socket.on('webrtc-ice-candidate', ({ sessionId, candidate }: { sessionId: string; candidate: unknown }) => {
            socket.to(sessionId).emit('webrtc-ice-candidate', { candidate, from: user.id });
        });

        socket.on('end-session', async (sessionId: string) => {
            // Only mentor should be able to end the session
            if (user.role !== 'mentor') return;
            // Update DB status
            await supabase.from('sessions').update({ status: 'ended' }).eq('id', sessionId);
            io.to(sessionId).emit('session-ended');
        });

        // End call only — both go back to editor, session stays alive
        socket.on('end-call', ({ sessionId }: { sessionId: string }) => {
            if (user.role !== 'mentor') return;
            io.to(sessionId).emit('call-ended');
        });

        // Student signals ready so mentor can re-initiate WebRTC offer
        socket.on('peer-ready', ({ sessionId }: { sessionId: string }) => {
            socket.to(sessionId).emit('peer-ready');
        });

        // Hand raise/lower
        socket.on('raise-hand', ({ sessionId, name }: { sessionId: string; name: string }) => {
            socket.to(sessionId).emit('hand-raised', { name });
        });
        socket.on('lower-hand', ({ sessionId }: { sessionId: string }) => {
            socket.to(sessionId).emit('hand-lowered');
        });

        // In-call chat (ephemeral, not stored in DB)
        socket.on('incall-message', ({ sessionId, name, text }: { sessionId: string; name: string; text: string }) => {
            socket.to(sessionId).emit('incall-message', { name, text });
        });

        // Host controls
        socket.on('mute-participant', ({ sessionId }: { sessionId: string }) => {
            socket.to(sessionId).emit('host-mute-me');
        });
        socket.on('remove-participant', ({ sessionId }: { sessionId: string }) => {
            socket.to(sessionId).emit('host-remove-me');
        });

        socket.on('disconnecting', () => {
            for (const room of socket.rooms) {
                if (room !== socket.id) {
                    sessionUsers[room]?.delete(user.id);
                    socket.to(room).emit('user-left', { userId: user.id, name: user.name });
                }
            }
        });
    });
}
