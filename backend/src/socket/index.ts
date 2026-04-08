import { Server, Socket } from 'socket.io';
import { supabase } from '../supabase';

interface UserPayload { id: string; name: string; role: string; }

// Per-session meeting state
interface MeetingState {
    active: boolean;
    mentorInCall: boolean;      // mentor has actually joined the call (past lobby)
    waitingRoom: Set<string>;
    admitted: Set<string>;
    permissions: Record<string, { mic: boolean; cam: boolean; screen: boolean }>;
}

const sessionUsers: Record<string, Set<string>> = {};
const meetings: Record<string, MeetingState> = {};

function getMeeting(sessionId: string): MeetingState {
    if (!meetings[sessionId]) {
        meetings[sessionId] = {
            active: false,
            mentorInCall: false,
            waitingRoom: new Set(),
            admitted: new Set(),
            permissions: {},
        };
    }
    return meetings[sessionId];
}

export function setupSocket(io: Server) {
    io.use(async (socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) return next(new Error('No token'));
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data.user) return next(new Error('Invalid token'));
        const meta = data.user.user_metadata as { name?: string; role?: string };
        (socket as any).user = { id: data.user.id, name: meta.name || 'Unknown', role: meta.role || 'student' };
        next();
    });

    io.on('connection', (socket: Socket) => {
        const user = (socket as any).user as UserPayload;

        // ── Session join ───────────────────────────────────────────────────
        socket.on('join-session', (sessionId: string) => {
            socket.join(sessionId);
            if (!sessionUsers[sessionId]) sessionUsers[sessionId] = new Set();
            sessionUsers[sessionId].add(user.id);
            socket.to(sessionId).emit('user-joined', { userId: user.id, name: user.name, role: user.role });
            socket.emit('session-joined', { userId: user.id, name: user.name, role: user.role });
        });

        // ── Meeting: mentor starts the call ────────────────────────────────
        socket.on('meeting-start', ({ sessionId }: { sessionId: string }) => {
            if (user.role !== 'mentor') return;
            const m = getMeeting(sessionId);
            m.active = true;
            m.admitted.add(user.id);
            m.permissions[user.id] = { mic: true, cam: true, screen: true };
            // Notify everyone meeting is live — but students still need to request join
            io.to(sessionId).emit('meeting-started', { hostName: user.name });
        });

        // ── Meeting: mentor actually entered the call (after lobby) ────────
        socket.on('mentor-joined-call', ({ sessionId }: { sessionId: string }) => {
            if (user.role !== 'mentor') return;
            const m = getMeeting(sessionId);
            m.active = true;
            m.mentorInCall = true;
            socket.to(sessionId).emit('mentor-in-call');
        });

        // ── Meeting: mentor left the call (back to editor) ─────────────────
        socket.on('mentor-left-call', ({ sessionId }: { sessionId: string }) => {
            if (user.role !== 'mentor') return;
            const m = getMeeting(sessionId);
            m.mentorInCall = false;
            socket.to(sessionId).emit('mentor-left-call');
        });

        // ── Meeting: mentor ends the call ──────────────────────────────────
        socket.on('meeting-end-call', ({ sessionId }: { sessionId: string }) => {
            if (user.role !== 'mentor') return;
            const m = getMeeting(sessionId);
            m.active = false;
            m.mentorInCall = false;
            m.waitingRoom.clear();
            m.admitted.clear();
            m.permissions = {};
            io.to(sessionId).emit('call-ended');
        });

        // ── Meeting: student requests to join ──────────────────────────────
        socket.on('meeting-request-join', ({ sessionId }: { sessionId: string }) => {
            if (user.role !== 'student') return;
            const m = getMeeting(sessionId);
            if (!m.active || !m.mentorInCall) {
                socket.emit('meeting-not-started');
                return;
            }
            m.waitingRoom.add(socket.id);
            socket.to(sessionId).emit('participant-waiting', { userId: user.id, name: user.name, socketId: socket.id });
        });

        // ── Meeting: mentor admits a participant ───────────────────────────
        socket.on('meeting-admit', ({ sessionId, socketId, userId }: { sessionId: string; socketId: string; userId: string }) => {
            if (user.role !== 'mentor') return;
            const m = getMeeting(sessionId);
            m.waitingRoom.delete(socketId);
            m.admitted.add(userId);
            m.permissions[userId] = { mic: true, cam: true, screen: false };
            // Tell that specific socket they're admitted
            io.to(socketId).emit('meeting-admitted', { permissions: m.permissions[userId] });
            // Tell mentor the waiting room updated
            socket.emit('waiting-room-update', { waitingRoom: [] });
        });

        // ── Meeting: mentor denies a participant ───────────────────────────
        socket.on('meeting-deny', ({ sessionId, socketId }: { sessionId: string; socketId: string }) => {
            if (user.role !== 'mentor') return;
            const m = getMeeting(sessionId);
            m.waitingRoom.delete(socketId);
            io.to(socketId).emit('meeting-denied');
        });

        // ── Meeting: host controls per participant ─────────────────────────
        socket.on('host-set-permission', ({ sessionId, targetUserId, permission, value }:
            { sessionId: string; targetUserId: string; permission: 'mic' | 'cam' | 'screen'; value: boolean }) => {
            if (user.role !== 'mentor') return;
            const m = getMeeting(sessionId);
            if (!m.permissions[targetUserId]) m.permissions[targetUserId] = { mic: true, cam: true, screen: false };
            m.permissions[targetUserId][permission] = value;
            // Notify the target participant
            socket.to(sessionId).emit('permission-changed', { permission, value, by: user.name });
        });

        // ── Meeting: remove participant ────────────────────────────────────
        socket.on('meeting-remove', ({ sessionId, targetUserId }: { sessionId: string; targetUserId: string }) => {
            if (user.role !== 'mentor') return;
            const m = getMeeting(sessionId);
            m.admitted.delete(targetUserId);
            socket.to(sessionId).emit('host-remove-me');
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
                .select().single();
            if (error) return socket.emit('error', 'Failed to send message');
            io.to(sessionId).emit('new-message', { ...data, user_name: user.name, user_role: user.role });
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

        // ── WebRTC signaling ───────────────────────────────────────────────
        socket.on('webrtc-offer', ({ sessionId, offer }: { sessionId: string; offer: unknown }) => {
            socket.to(sessionId).emit('webrtc-offer', { offer, from: user.id });
        });
        socket.on('webrtc-answer', ({ sessionId, answer }: { sessionId: string; answer: unknown }) => {
            socket.to(sessionId).emit('webrtc-answer', { answer, from: user.id });
        });
        socket.on('webrtc-ice-candidate', ({ sessionId, candidate }: { sessionId: string; candidate: unknown }) => {
            socket.to(sessionId).emit('webrtc-ice-candidate', { candidate, from: user.id });
        });
        socket.on('peer-ready', ({ sessionId }: { sessionId: string }) => {
            socket.to(sessionId).emit('peer-ready');
        });

        // ── Hand raise ─────────────────────────────────────────────────────
        socket.on('raise-hand', ({ sessionId, name }: { sessionId: string; name: string }) => {
            socket.to(sessionId).emit('hand-raised', { name });
        });
        socket.on('lower-hand', ({ sessionId }: { sessionId: string }) => {
            socket.to(sessionId).emit('hand-lowered');
        });

        // ── In-call chat ───────────────────────────────────────────────────
        socket.on('incall-message', ({ sessionId, name, text }: { sessionId: string; name: string; text: string }) => {
            socket.to(sessionId).emit('incall-message', { name, text });
        });

        // ── End session (closes workspace) ─────────────────────────────────
        socket.on('end-session', async (sessionId: string) => {
            if (user.role !== 'mentor') return;
            await supabase.from('sessions').update({ status: 'ended' }).eq('id', sessionId);
            delete meetings[sessionId];
            io.to(sessionId).emit('session-ended');
        });

        // ── Disconnect ─────────────────────────────────────────────────────
        socket.on('disconnecting', () => {
            for (const room of socket.rooms) {
                if (room !== socket.id) {
                    sessionUsers[room]?.delete(user.id);
                    // If mentor disconnects, mark meeting inactive
                    if (user.role === 'mentor' && meetings[room]) {
                        meetings[room].active = false;
                        meetings[room].mentorInCall = false;
                        socket.to(room).emit('call-ended');
                    }
                    socket.to(room).emit('user-left', { userId: user.id, name: user.name });
                }
            }
        });
    });
}
