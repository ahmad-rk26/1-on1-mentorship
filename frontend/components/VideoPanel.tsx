'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { User } from '@/lib/auth';

interface Props {
    sessionId: string;
    socket: Socket;
    user: User;
    peerName: string;
    peerRole: string;
    sessionTitle: string;
    onLeave: () => void;
    onEndSession?: () => void;
}

interface Toast { id: number; msg: string; type: 'info' | 'warn' | 'success'; }
interface Participant { id: string; name: string; role: string; micOn: boolean; camOn: boolean; handRaised: boolean; socketId?: string; }
interface Permissions { mic: boolean; cam: boolean; screen: boolean; }

type Phase = 'lobby' | 'knocking' | 'call';

const TURN_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

export default function VideoPanel({ sessionId, socket, user, peerName, peerRole, sessionTitle, onLeave, onEndSession }: Props) {
    const remoteRef = useRef<HTMLVideoElement>(null);
    const localRef = useRef<HTMLVideoElement>(null);
    const previewRef = useRef<HTMLVideoElement>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const screenTrackRef = useRef<MediaStreamTrack | null>(null);
    const hideTimer = useRef<NodeJS.Timeout | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const toastId = useRef(0);
    const iceBufRef = useRef<RTCIceCandidateInit[]>([]);
    const remoteSetRef = useRef(false);

    const [phase, setPhase] = useState<Phase>('lobby');
    const [lobbyMic, setLobbyMic] = useState(true);
    const [lobbyCam, setLobbyCam] = useState(true);
    const [lobbyStream, setLobbyStream] = useState<MediaStream | null>(null);
    const [micOn, setMicOn] = useState(true);
    const [camOn, setCamOn] = useState(true);
    const [screenSharing, setScreenSharing] = useState(false);
    const [permissions, setPermissions] = useState<Permissions>({ mic: true, cam: true, screen: user.role === 'mentor' });
    const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
    const [error, setError] = useState('');
    const [remoteOn, setRemoteOn] = useState(false);
    const [showCtrl, setShowCtrl] = useState(true);
    const [elapsed, setElapsed] = useState(0);
    const [handUp, setHandUp] = useState(false);
    const [peerHandUp, setPeerHandUp] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);
    const [sidePanel, setSidePanel] = useState<null | 'participants' | 'chat'>(null);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [showEndModal, setShowEndModal] = useState(false);
    const [sessionEndedByHost, setSessionEndedByHost] = useState(false);
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [waitingRoom, setWaitingRoom] = useState<{ userId: string; name: string; socketId: string }[]>([]);
    const [mentorLive, setMentorLive] = useState(false);
    const [hasPeerJoined, setHasPeerJoined] = useState(false);
    const [pip, setPip] = useState({ right: 16, bottom: 80 });

    const dragRef = useRef({ active: false, startX: 0, startY: 0, startR: 0, startB: 0 });
    const remoteStreamRef = useRef<MediaStream | null>(null);

    const toast = useCallback((msg: string, type: Toast['type'] = 'info') => {
        const id = ++toastId.current;
        setToasts(p => [...p, { id, msg, type }]);
        setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
    }, []);

    const resetHide = useCallback(() => {
        setShowCtrl(true);
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setShowCtrl(false), 5000);
    }, []);

    // Apply remote stream
    useEffect(() => {
        if (remoteOn && remoteRef.current && remoteStreamRef.current) {
            remoteRef.current.srcObject = remoteStreamRef.current;
            remoteRef.current.play().catch(() => { });
        }
    }, [remoteOn]);

    // Apply local stream
    useEffect(() => {
        if (phase === 'call' && localRef.current && streamRef.current) {
            localRef.current.srcObject = streamRef.current;
            localRef.current.muted = true;
            localRef.current.play().catch(() => { });
        }
    }, [phase]);

    // Lobby preview
    useEffect(() => {
        if (phase !== 'lobby' && phase !== 'knocking') return;
        let s: MediaStream | null = null;
        navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 } },
            audio: true
        })
            .then(stream => {
                s = stream;
                setLobbyStream(stream);
                if (previewRef.current) previewRef.current.srcObject = stream;
            })
            .catch(() => setError('Camera/mic permission denied.'));

        return () => {
            s?.getTracks().forEach(t => t.stop());
            if (previewRef.current) previewRef.current.srcObject = null;
        };
    }, [phase]);

    // Timer
    useEffect(() => {
        if (phase !== 'call') return;
        resetHide();
        timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (hideTimer.current) clearTimeout(hideTimer.current);
        };
    }, [phase, resetHide]);

    // Socket Events
    useEffect(() => {
        if (user.role === 'mentor') {
            socket.emit('meeting-start', { sessionId });
        }

        socket.on('mentor-in-call', () => {
            if (user.role === 'student') {
                setMentorLive(true);
                toast('Host joined — you can now ask to join', 'success');
            }
        });

        socket.on('mentor-left-call', () => {
            if (user.role === 'student') {
                setMentorLive(false);
                if (phase === 'knocking') {
                    setPhase('lobby');
                    toast('Host left the call', 'warn');
                }
            }
        });

        socket.on('meeting-not-started', () => {
            setPhase('lobby');
            toast('Host has not started the meeting yet', 'warn');
        });

        socket.on('meeting-admitted', ({ permissions: perms }: { permissions: Permissions }) => {
            setPermissions(perms);
            toast('✅ You were admitted', 'success');
            joinCall(perms);
        });

        socket.on('meeting-denied', () => {
            toast('❌ Your request to join was denied', 'warn');
            setPhase('lobby');
        });

        socket.on('participant-waiting', (p: { userId: string; name: string; socketId: string }) => {
            setWaitingRoom(prev => [...prev.filter(x => x.userId !== p.userId), p]);
            toast(`🔔 Someone is asking to join`, 'info');
        });

        socket.on('permission-changed', ({ permission, value, by }: { permission: keyof Permissions; value: boolean; by: string }) => {
            setPermissions(prev => ({ ...prev, [permission]: value }));
            if (permission === 'mic') {
                streamRef.current?.getAudioTracks().forEach(t => { t.enabled = value; });
                setMicOn(value);
                toast(value ? `🎙️ ${by} unmuted your mic` : `🔇 ${by} muted your mic`, 'warn');
            }
            if (permission === 'cam') {
                streamRef.current?.getVideoTracks().forEach(t => { t.enabled = value; });
                setCamOn(value);
                toast(value ? `📷 ${by} enabled your camera` : `📷 ${by} disabled your camera`, 'warn');
            }
            if (permission === 'screen' && !value && screenSharing) {
                stopScreenShare();
                toast(`🖥️ ${by} stopped your screen share`, 'warn');
            }
        });

        socket.on('call-ended', () => {
            toast('📞 Host ended the call', 'warn');
            stopMedia();
            setTimeout(() => onLeave(), 1200);
        });

        socket.on('session-ended', () => { stopMedia(); setSessionEndedByHost(true); });

        socket.on('host-remove-me', () => {
            toast('You were removed from the call', 'warn');
            setTimeout(() => { stopMedia(); onLeave(); }, 1500);
        });

        // WebRTC Signaling - Fixed order
        socket.on('webrtc-offer', async ({ offer }: { offer: RTCSessionDescriptionInit }) => {
            const pc = await ensurePC();
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            remoteSetRef.current = true;
            await flushICE(pc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('webrtc-answer', { sessionId, answer });
        });

        socket.on('webrtc-answer', async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
            if (!pcRef.current) return;
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
            remoteSetRef.current = true;
            await flushICE(pcRef.current);
        });

        socket.on('webrtc-ice-candidate', async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
            if (!remoteSetRef.current || !pcRef.current) {
                iceBufRef.current.push(candidate);
                return;
            }
            try {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
            } catch { }
        });

        socket.on('peer-ready', async () => {
            if (user.role !== 'mentor') return;
            const pc = await ensurePC();
            if (streamRef.current) {
                const existingSenders = pc.getSenders().filter(s => s.track !== null);
                if (existingSenders.length === 0) {
                    streamRef.current.getTracks().forEach(t => pc.addTrack(t, streamRef.current!));
                }
            }
            await makeOffer();
        });

        socket.on('hand-raised', ({ name }: { name: string }) => {
            setPeerHandUp(true);
            toast(`✋ ${name} raised their hand`);
            setTimeout(() => setPeerHandUp(false), 8000);
        });

        socket.on('hand-lowered', () => setPeerHandUp(false));

        return () => {
            ['mentor-in-call', 'mentor-left-call', 'meeting-not-started', 'meeting-admitted',
                'meeting-denied', 'participant-waiting', 'permission-changed', 'call-ended',
                'session-ended', 'host-remove-me', 'webrtc-offer', 'webrtc-answer',
                'webrtc-ice-candidate', 'peer-ready', 'hand-raised', 'hand-lowered']
                .forEach(e => socket.off(e));
        };
    }, [socket, sessionId, user.role]);

    async function flushICE(pc: RTCPeerConnection) {
        for (const c of iceBufRef.current) {
            try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { }
        }
        iceBufRef.current = [];
    }

    async function ensurePC(): Promise<RTCPeerConnection> {
        if (pcRef.current) return pcRef.current;

        const pc = new RTCPeerConnection({ iceServers: TURN_SERVERS, iceCandidatePoolSize: 10 });
        pcRef.current = pc;

        pc.onicecandidate = e => {
            if (e.candidate) socket.emit('webrtc-ice-candidate', { sessionId, candidate: e.candidate });
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'connected') {
                setStatus('connected');
                toast(`📞 ${peerName || 'Peer'} joined`);
                setHasPeerJoined(true);
            }
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                setStatus('connecting');
                setRemoteOn(false);
            }
        };

        pc.ontrack = e => {
            remoteStreamRef.current = e.streams[0];
            if (remoteRef.current) {
                remoteRef.current.srcObject = e.streams[0];
                remoteRef.current.play().catch(() => { });
            }
            setRemoteOn(true);
            setStatus('connected');
        };

        return pc;
    }

    async function makeOffer() {
        if (!pcRef.current) return;
        const offer = await pcRef.current.createOffer();
        await pcRef.current.setLocalDescription(offer);
        socket.emit('webrtc-offer', { sessionId, offer });
    }

    function stopMedia() {
        streamRef.current?.getTracks().forEach(t => t.stop());
        screenTrackRef.current?.stop();
        screenTrackRef.current = null;
        remoteStreamRef.current = null;
        pcRef.current?.close();
        pcRef.current = null;
        streamRef.current = null;
        setHasPeerJoined(false);
    }

    function stopScreenShare() {
        screenTrackRef.current?.stop();
        screenTrackRef.current = null;
        const camTrack = streamRef.current?.getVideoTracks()[0];
        if (pcRef.current && camTrack) {
            const videoSender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
            if (videoSender) videoSender.replaceTrack(camTrack);
        }
        setScreenSharing(false);
    }

    async function joinCall(admittedPerms?: Permissions) {
        const perms = admittedPerms ?? permissions;
        lobbyStream?.getTracks().forEach(t => t.stop());
        setLobbyStream(null);
        setMicOn(lobbyMic);
        setCamOn(lobbyCam);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            });

            stream.getAudioTracks().forEach(t => t.enabled = lobbyMic && perms.mic);
            stream.getVideoTracks().forEach(t => t.enabled = lobbyCam && perms.cam);

            streamRef.current = stream;
            iceBufRef.current = [];
            remoteSetRef.current = false;

            await ensurePC();
            setPhase('call');

            if (localRef.current) localRef.current.srcObject = stream;

            if (user.role === 'mentor') {
                socket.emit('mentor-joined-call', { sessionId });
            } else {
                await new Promise(r => setTimeout(r, 200));
                socket.emit('peer-ready', { sessionId });
            }

            setParticipants([{ id: user.id, name: user.name, role: user.role, micOn: lobbyMic, camOn: lobbyCam, handRaised: false }]);
        } catch (err: any) {
            setError(`Could not start camera/mic: ${err.message}`);
            setStatus('error');
            setPhase('call');
        }
    }

    function toggleMic() {
        if (!permissions.mic) return toast('🔇 Host has muted your microphone', 'warn');
        streamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
        setMicOn(p => !p);
    }

    function toggleCam() {
        if (!permissions.cam) return toast('📷 Host has disabled your camera', 'warn');
        streamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
        setCamOn(p => !p);
    }

    function toggleHand() {
        const next = !handUp;
        setHandUp(next);
        if (next) {
            socket.emit('raise-hand', { sessionId, name: user.name });
            toast('✋ You raised your hand');
        } else {
            socket.emit('lower-hand', { sessionId });
        }
    }

    async function toggleScreenShare() {
        if (screenSharing) {
            stopScreenShare();
            return;
        }
        if (!permissions.screen && user.role !== 'mentor') {
            return toast('🖥️ Host has not allowed screen sharing', 'warn');
        }

        try {
            const screen = await (navigator.mediaDevices as any).getDisplayMedia({
                video: { cursor: 'always' },
                audio: true
            });
            const videoTrack = screen.getVideoTracks()[0];
            screenTrackRef.current = videoTrack;

            if (pcRef.current) {
                const videoSender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
                if (videoSender) {
                    await videoSender.replaceTrack(videoTrack);
                } else {
                    pcRef.current.addTrack(videoTrack, screen);
                    await makeOffer();
                }
            }

            videoTrack.onended = () => stopScreenShare();
            setScreenSharing(true);
            toast('📺 Screen sharing started');
        } catch (err: any) {
            if (err.name !== 'NotAllowedError') toast('Screen share failed', 'warn');
        }
    }

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen();
            setFullscreen(true);
        } else {
            document.exitFullscreen();
            setFullscreen(false);
        }
    }

    // Host controls
    function hostSetPermission(targetUserId: string, permission: 'mic' | 'cam' | 'screen', value: boolean) {
        socket.emit('host-set-permission', { sessionId, targetUserId, permission, value });
    }

    function admitParticipant(socketId: string, userId: string) {
        socket.emit('meeting-admit', { sessionId, socketId, userId });
        setWaitingRoom(prev => prev.filter(p => p.socketId !== socketId));
        toast(`✅ Admitted participant`, 'success');
    }

    function denyParticipant(socketId: string) {
        socket.emit('meeting-deny', { sessionId, socketId });
        setWaitingRoom(prev => prev.filter(p => p.socketId !== socketId));
    }

    function removeParticipant(targetUserId: string) {
        socket.emit('meeting-remove', { sessionId, targetUserId });
        toast('Removed participant', 'warn');
    }

    function handleLeave() {
        if (user.role === 'mentor') socket.emit('mentor-left-call', { sessionId });
        stopMedia();
        onLeave();
    }

    function handleEndCallOnly() {
        socket.emit('meeting-end-call', { sessionId });
        stopMedia();
        setShowEndModal(false);
        onLeave();
    }

    function handleEndCallAndSession() {
        socket.emit('end-session', sessionId);
        stopMedia();
        setShowEndModal(false);
        onEndSession?.();
    }

    // PiP Drag
    function onPipMouseDown(e: React.MouseEvent) {
        e.preventDefault();
        dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, startR: pip.right, startB: pip.bottom };
        window.addEventListener('mousemove', onPipMove);
        window.addEventListener('mouseup', onPipUp);
    }

    function onPipMove(e: MouseEvent) {
        if (!dragRef.current.active) return;
        const w = containerRef.current?.clientWidth ?? window.innerWidth;
        const h = containerRef.current?.clientHeight ?? window.innerHeight;
        setPip({
            right: Math.max(8, Math.min(w - 168, dragRef.current.startR - (e.clientX - dragRef.current.startX))),
            bottom: Math.max(80, Math.min(h - 110, dragRef.current.startB - (e.clientY - dragRef.current.startY)))
        });
    }

    function onPipUp() {
        dragRef.current.active = false;
        window.removeEventListener('mousemove', onPipMove);
        window.removeEventListener('mouseup', onPipUp);
    }

    const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const myInitial = user.name.charAt(0).toUpperCase();
    const peerInitial = peerName ? peerName.charAt(0).toUpperCase() : (peerRole === 'mentor' ? 'M' : 'S');
    const displayPeer = peerName || (peerRole === 'mentor' ? 'Mentor' : 'Student');

    // Session Ended Screen
    if (sessionEndedByHost) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-5" style={{ background: '#111827' }}>
                <div className="text-5xl">🏁</div>
                <h2 className="text-white text-2xl font-bold">Session Ended</h2>
                <p className="text-white/40 text-sm">The host ended the session for everyone.</p>
                <button onClick={onLeave} className="px-6 py-2.5 rounded-xl font-semibold text-[14px] text-white" style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
                    Back to Editor
                </button>
            </div>
        );
    }

    // Lobby Screen
    if (phase === 'lobby') {
        return (
            <div className="flex items-center justify-center h-full px-4" style={{ background: '#111827' }}>
                <div className="flex flex-col lg:flex-row items-center gap-10 max-w-4xl w-full">
                    <div className="relative rounded-2xl overflow-hidden flex-1 w-full max-w-lg" style={{ aspectRatio: '16/9', background: '#1f2937' }}>
                        <video ref={previewRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                        {!lobbyCam && (
                            <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#1f2937' }}>
                                <div className="w-24 h-24 rounded-full flex items-center justify-center text-4xl font-black" style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
                                    {myInitial}
                                </div>
                            </div>
                        )}
                        {user.role === 'student' && !mentorLive && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
                                <div className="flex gap-1.5">
                                    {[0, 1, 2].map(i => <div key={i} className="w-2.5 h-2.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />)}
                                </div>
                                <p className="text-white font-semibold text-[15px]">Waiting for host to start</p>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-5 w-full max-w-xs">
                        <h2 className="text-white text-2xl font-bold">{sessionTitle}</h2>
                        <p className="text-white/40 capitalize">{user.role}</p>

                        {user.role === 'mentor' ? (
                            <button onClick={() => joinCall()} className="w-full py-3 rounded-xl font-semibold text-white" style={{ background: 'linear-gradient(135deg,#1a73e8,#1557b0)' }}>
                                Join now
                            </button>
                        ) : mentorLive ? (
                            <button onClick={() => { socket.emit('meeting-request-join', { sessionId }); setPhase('knocking'); }} className="w-full py-3 rounded-xl font-semibold text-white" style={{ background: 'linear-gradient(135deg,#1a73e8,#1557b0)' }}>
                                Ask to join
                            </button>
                        ) : (
                            <button disabled className="w-full py-3 rounded-xl font-semibold text-white/30" style={{ background: 'rgba(255,255,255,0.06)' }}>
                                Waiting for host...
                            </button>
                        )}
                        <button onClick={onLeave} className="text-white/50 hover:text-white">← Back to editor</button>
                    </div>
                </div>
            </div>
        );
    }

    // Knocking Screen
    if (phase === 'knocking') {
        return (
            <div className="flex items-center justify-center h-full px-4" style={{ background: '#111827' }}>
                <div className="text-center text-white">
                    <p className="text-xl">Asking to join...</p>
                    <p className="text-white/50 mt-2">Waiting for host approval</p>
                    <button onClick={() => setPhase('lobby')} className="mt-6 px-6 py-2 rounded-xl border border-white/30 text-white/70">Cancel</button>
                </div>
            </div>
        );
    }

    // Main Call Screen
    return (
        <div ref={containerRef} className="relative flex h-full overflow-hidden select-none" style={{ background: '#111827' }}
            onMouseMove={resetHide} onClick={() => { resetHide(); setShowEndModal(false); }}>

            {/* Remote Video */}
            <div className="relative flex-1 flex items-center justify-center overflow-hidden">
                <video ref={remoteRef} autoPlay playsInline className="w-full h-full object-cover" style={{ display: remoteOn ? 'block' : 'none' }} />

                {!remoteOn && (
                    <div className="flex flex-col items-center gap-4">
                        {hasPeerJoined ? (
                            <>
                                <div className="w-28 h-28 rounded-full flex items-center justify-center text-5xl font-black" style={{ background: 'rgba(107,114,128,0.3)' }}>{peerInitial}</div>
                                <p className="text-white text-xl font-semibold">{displayPeer} left</p>
                                <p className="text-white/40">No one else is in the call</p>
                            </>
                        ) : (
                            <>
                                <div className="w-28 h-28 rounded-full flex items-center justify-center text-5xl font-black" style={{ background: peerRole === 'mentor' ? 'linear-gradient(135deg,#7c3aed,#4f46e5)' : 'linear-gradient(135deg,#0891b2,#0e7490)' }}>{peerInitial}</div>
                                <p className="text-white text-xl">{displayPeer}</p>
                                <p className="text-white/40">Waiting to join...</p>
                            </>
                        )}
                    </div>
                )}

                {/* Remote Name Tag */}
                {remoteOn && (
                    <div className="absolute bottom-20 left-6 bg-black/60 backdrop-blur px-4 py-1 rounded-xl text-white text-sm flex items-center gap-2">
                        {displayPeer} <span className="text-xs opacity-70">({peerRole})</span>
                        {peerHandUp && <span>✋</span>}
                    </div>
                )}

                {/* Local PiP */}
                <div className="absolute rounded-2xl overflow-hidden cursor-grab active:cursor-grabbing border-2 border-white/20 shadow-2xl"
                    style={{ width: 168, aspectRatio: '16/9', right: pip.right, bottom: pip.bottom, zIndex: 30 }}
                    onMouseDown={onPipMouseDown}>
                    <video ref={localRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                    {!camOn && (
                        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                            <div className="text-3xl font-bold text-white/80">{myInitial}</div>
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Controls */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-zinc-900/90 backdrop-blur-xl px-5 py-3 rounded-2xl" style={{ opacity: showCtrl ? 1 : 0, transition: 'opacity 0.3s' }}>
                <button onClick={toggleMic} className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${micOn ? 'bg-zinc-700' : 'bg-red-600'}`}>
                    {micOn ? '🎤' : '🔇'}
                </button>
                <button onClick={toggleCam} className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${camOn ? 'bg-zinc-700' : 'bg-red-600'}`}>
                    {camOn ? '📹' : '📵'}
                </button>
                <button onClick={toggleScreenShare} className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${screenSharing ? 'bg-emerald-600' : 'bg-zinc-700'}`}>
                    🖥️
                </button>
                <button onClick={toggleHand} className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${handUp ? 'bg-amber-500' : 'bg-zinc-700'}`}>
                    ✋
                </button>
                <button onClick={() => user.role === 'mentor' ? setShowEndModal(true) : handleLeave()} className="w-12 h-12 rounded-full flex items-center justify-center text-xl bg-red-600">
                    ☎️
                </button>
            </div>

            {/* Toasts */}
            <div className="absolute top-6 right-6 flex flex-col gap-2 z-50">
                {toasts.map(t => (
                    <div key={t.id} className={`px-5 py-3 rounded-2xl text-sm shadow-xl ${t.type === 'success' ? 'bg-emerald-600' : t.type === 'warn' ? 'bg-red-600' : 'bg-zinc-800'}`}>
                        {t.msg}
                    </div>
                ))}
            </div>

            {/* End Call Modal */}
            {showEndModal && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-50" onClick={() => setShowEndModal(false)}>
                    <div className="bg-zinc-900 p-6 rounded-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
                        <h3 className="text-white text-xl font-semibold mb-4">End the call?</h3>
                        <button onClick={handleEndCallOnly} className="w-full py-3 mb-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-white">End call only</button>
                        <button onClick={handleEndCallAndSession} className="w-full py-3 bg-red-600 hover:bg-red-700 rounded-xl text-white">End call & close session</button>
                        <button onClick={() => setShowEndModal(false)} className="w-full py-3 text-white/60 mt-2">Cancel</button>
                    </div>
                </div>
            )}
        </div>
    );
}