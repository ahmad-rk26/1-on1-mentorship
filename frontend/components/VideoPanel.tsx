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

interface Toast { id: number; msg: string; type: 'info' | 'warn'; }
interface Participant { id: string; name: string; role: string; micOn: boolean; handRaised: boolean; }


export default function VideoPanel({ sessionId, socket, user, peerName, peerRole, sessionTitle, onLeave, onEndSession }: Props) {
    const remoteRef = useRef<HTMLVideoElement>(null);
    const localRef = useRef<HTMLVideoElement>(null);
    const previewRef = useRef<HTMLVideoElement>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const toastId = useRef(0);

    // Lobby state
    const [phase, setPhase] = useState<'lobby' | 'call'>('lobby');
    const [lobbyMic, setLobbyMic] = useState(true);
    const [lobbyCam, setLobbyCam] = useState(true);
    const [lobbyStream, setLobbyStream] = useState<MediaStream | null>(null);

    // Call state
    const [micOn, setMicOn] = useState(true);
    const [camOn, setCamOn] = useState(true);
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
    const [showEndMenu, setShowEndMenu] = useState(false);
    const [showEndModal, setShowEndModal] = useState(false);
    const [sessionEndedByHost, setSessionEndedByHost] = useState(false);
    const [screenSharing, setScreenSharing] = useState(false);
    const screenTrackRef = useRef<MediaStreamTrack | null>(null);

    // Participants
    const [participants, setParticipants] = useState<Participant[]>([]);

    // PiP drag
    const [pip, setPip] = useState({ right: 16, bottom: 80 });
    const dragRef = useRef({ active: false, startX: 0, startY: 0, startR: 0, startB: 0 });

    // ── Toast helper ─────────────────────────────────────────────────────
    const toast = useCallback((msg: string, type: Toast['type'] = 'info') => {
        const id = ++toastId.current;
        setToasts(p => [...p, { id, msg, type }]);
        setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
    }, []);

    // ── Auto-hide controls ────────────────────────────────────────────────
    const resetHide = useCallback(() => {
        setShowCtrl(true);
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setShowCtrl(false), 4000);
    }, []);

    // ── Lobby: start preview stream ───────────────────────────────────────
    useEffect(() => {
        let stream: MediaStream | null = null;
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(s => {
                stream = s;
                setLobbyStream(s);
                if (previewRef.current) previewRef.current.srcObject = s;
            })
            .catch(() => setError('Camera/mic permission denied.'));
        return () => {
            stream?.getTracks().forEach(t => t.stop());
            if (previewRef.current) previewRef.current.srcObject = null;
        };
    }, []);

    // ── Always listen for session-ended (works in lobby + call phase) ─────
    useEffect(() => {
        function onSessionEnded() {
            lobbyStream?.getTracks().forEach(t => t.stop());
            if (previewRef.current) previewRef.current.srcObject = null;
            stopMedia();
            setSessionEndedByHost(true);
        }
        function onCallEnded() {
            lobbyStream?.getTracks().forEach(t => t.stop());
            if (previewRef.current) previewRef.current.srcObject = null;
            stopMedia();
            toast('📞 Host ended the call', 'warn');
            setTimeout(() => onLeave(), 1200);
        }
        socket.on('session-ended', onSessionEnded);
        socket.on('call-ended', onCallEnded);
        return () => {
            socket.off('session-ended', onSessionEnded);
            socket.off('call-ended', onCallEnded);
        };
    }, [socket, lobbyStream]);

    // ── Call: socket events ───────────────────────────────────────────────
    useEffect(() => {
        if (phase !== 'call') return;
        resetHide();

        // Buffer ICE candidates that arrive before remote description is set
        const iceCandidateBuffer: RTCIceCandidateInit[] = [];
        let remoteDescSet = false;

        async function flushCandidates(pc: RTCPeerConnection) {
            for (const c of iceCandidateBuffer) {
                try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { }
            }
            iceCandidateBuffer.length = 0;
        }

        socket.on('webrtc-offer', async ({ offer }: { offer: RTCSessionDescriptionInit }) => {
            const pc = await ensurePC();
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            remoteDescSet = true;
            await flushCandidates(pc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('webrtc-answer', { sessionId, answer });
        });

        socket.on('webrtc-answer', async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
            if (!pcRef.current) return;
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
            remoteDescSet = true;
            await flushCandidates(pcRef.current);
        });

        socket.on('webrtc-ice-candidate', async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
            if (!remoteDescSet || !pcRef.current) {
                iceCandidateBuffer.push(candidate);
                return;
            }
            try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch { }
        });

        socket.on('peer-ready', async () => {
            if (user.role !== 'mentor') return;
            // Ensure PC exists and stream is attached before making offer
            const pc = await ensurePC();
            if (streamRef.current) {
                const senders = pc.getSenders();
                if (senders.length === 0) {
                    streamRef.current.getTracks().forEach(t => pc.addTrack(t, streamRef.current!));
                }
            }
            await makeOffer();
        });

        socket.on('hand-raised', ({ name }: { name: string }) => {
            setPeerHandUp(true);
            toast(`✋ ${name} raised their hand`, 'info');
            setTimeout(() => setPeerHandUp(false), 8000);
        });
        socket.on('hand-lowered', () => setPeerHandUp(false));
        socket.on('host-mute-me', () => {
            streamRef.current?.getAudioTracks().forEach(t => { t.enabled = false; });
            setMicOn(false);
            toast('🔇 Host muted your microphone', 'warn');
        });
        socket.on('host-remove-me', () => {
            toast('You were removed from the call', 'warn');
            setTimeout(() => { stopMedia(); onLeave(); }, 1500);
        });

        // Timer
        timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);

        return () => {
            socket.off('webrtc-offer'); socket.off('webrtc-answer');
            socket.off('webrtc-ice-candidate'); socket.off('peer-ready');
            socket.off('hand-raised'); socket.off('hand-lowered');
            socket.off('host-mute-me'); socket.off('host-remove-me');
            socket.off('session-ended');
            if (hideTimer.current) clearTimeout(hideTimer.current);
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [phase, sessionId, socket]);

    // ── Join call from lobby ──────────────────────────────────────────────
    async function joinCall() {
        lobbyStream?.getTracks().forEach(t => t.stop());
        setLobbyStream(null);
        setMicOn(lobbyMic);
        setCamOn(lobbyCam);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: lobbyCam ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
                audio: lobbyMic ? { echoCancellation: true, noiseSuppression: true } : false,
            });
            streamRef.current = stream;
            // Set phase AFTER stream is ready so socket listeners are active
            setPhase('call');
            // Small delay to let useEffect re-run with phase='call' and register socket listeners
            await new Promise(r => setTimeout(r, 100));
            if (localRef.current) localRef.current.srcObject = stream;
            await ensurePC();
            if (user.role === 'mentor') {
                await makeOffer();
            } else {
                socket.emit('peer-ready', { sessionId });
            }
            setParticipants([{ id: user.id, name: user.name, role: user.role, micOn: lobbyMic, handRaised: false }]);
        } catch (err: any) {
            setError(`Could not start camera/mic: ${err.message}`);
            setStatus('error');
            setPhase('call');
        }
    }

    async function ensurePC(): Promise<RTCPeerConnection> {
        if (pcRef.current) return pcRef.current;
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                // Free TURN servers for NAT traversal (different networks)
                {
                    urls: 'turn:openrelay.metered.ca:80',
                    username: 'openrelayproject',
                    credential: 'openrelayproject',
                },
                {
                    urls: 'turn:openrelay.metered.ca:443',
                    username: 'openrelayproject',
                    credential: 'openrelayproject',
                },
                {
                    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                    username: 'openrelayproject',
                    credential: 'openrelayproject',
                },
            ],
            iceCandidatePoolSize: 10,
        });
        pcRef.current = pc;

        pc.onicecandidate = e => {
            if (e.candidate) socket.emit('webrtc-ice-candidate', { sessionId, candidate: e.candidate });
        };

        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'failed') {
                // Try ICE restart
                pc.restartIce();
            }
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'connected') {
                setStatus('connected');
                toast(`📞 ${peerName || 'Peer'} joined the call`);
                setParticipants(p => {
                    const exists = p.find(x => x.role === peerRole);
                    if (exists) return p;
                    return [...p, { id: 'peer', name: peerName || peerRole, role: peerRole, micOn: true, handRaised: false }];
                });
            }
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                setStatus('connecting'); setRemoteOn(false);
                toast(`${peerName || 'Peer'} disconnected`, 'warn');
            }
        };

        pc.ontrack = e => {
            if (remoteRef.current) {
                remoteRef.current.srcObject = e.streams[0];
                // Ensure video plays
                remoteRef.current.play().catch(() => { });
            }
            setRemoteOn(true);
            setStatus('connected');
        };

        // Add all local tracks
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => pc.addTrack(t, streamRef.current!));
        }
        return pc;
    }

    async function makeOffer() {
        if (!pcRef.current) return;
        const offer = await pcRef.current.createOffer();
        await pcRef.current.setLocalDescription(offer);
        socket.emit('webrtc-offer', { sessionId, offer });
    }

    function stopMedia() {
        // Stop all tracks — this turns off the camera/mic light
        streamRef.current?.getTracks().forEach(t => t.stop());
        screenTrackRef.current?.stop();
        screenTrackRef.current = null;
        // Clear video elements
        if (localRef.current) { localRef.current.srcObject = null; }
        if (remoteRef.current) { remoteRef.current.srcObject = null; }
        if (previewRef.current) { previewRef.current.srcObject = null; }
        // Close peer connection
        pcRef.current?.close();
        pcRef.current = null;
        streamRef.current = null;
    }

    function toggleMic() {
        streamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
        setMicOn(p => !p);
        setParticipants(p => p.map(x => x.id === user.id ? { ...x, micOn: !x.micOn } : x));
    }
    function toggleCam() {
        streamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
        setCamOn(p => !p);
    }
    function toggleHand() {
        const next = !handUp;
        setHandUp(next);
        if (next) { socket.emit('raise-hand', { sessionId, name: user.name }); toast('✋ You raised your hand'); }
        else { socket.emit('lower-hand', { sessionId }); }
    }
    async function toggleScreenShare() {
        if (screenSharing) {
            // Stop screen share, revert to camera
            screenTrackRef.current?.stop();
            screenTrackRef.current = null;
            const camTrack = streamRef.current?.getVideoTracks()[0];
            if (camTrack && pcRef.current) {
                const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
                if (sender) await sender.replaceTrack(camTrack);
            }
            setScreenSharing(false);
            toast('Screen share stopped');
        } else {
            try {
                const screen = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
                const screenTrack: MediaStreamTrack = screen.getVideoTracks()[0];
                screenTrackRef.current = screenTrack;
                if (pcRef.current) {
                    const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
                    if (sender) await sender.replaceTrack(screenTrack);
                }
                screenTrack.onended = () => { screenTrackRef.current = null; setScreenSharing(false); };
                setScreenSharing(true);
                toast('📺 Screen sharing started');
            } catch { toast('Screen share cancelled', 'warn'); }
        }
    }
    function toggleFullscreen() {
        if (!document.fullscreenElement) { containerRef.current?.requestFullscreen(); setFullscreen(true); }
        else { document.exitFullscreen(); setFullscreen(false); }
    }

    // Host controls
    function mutePeer() { socket.emit('mute-participant', { sessionId }); toast('Muted participant'); }
    function removePeer() { socket.emit('remove-participant', { sessionId }); toast('Removed participant', 'warn'); }

    function handleLeave() { stopMedia(); onLeave(); }

    // End call only — both go back to editor, session stays alive
    function handleEndCallOnly() {
        socket.emit('end-call', { sessionId });
        stopMedia();
        setShowEndModal(false);
        onLeave();
    }

    // End call + close session — marks session ended in DB, redirects everyone
    function handleEndCallAndSession() {
        socket.emit('end-session', sessionId);
        stopMedia();
        setShowEndModal(false);
        onEndSession?.();
    }

    // PiP drag
    function onPipMouseDown(e: React.MouseEvent) {
        e.preventDefault();
        dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, startR: pip.right, startB: pip.bottom };
        window.addEventListener('mousemove', onPipMove); window.addEventListener('mouseup', onPipUp);
    }
    function onPipMove(e: MouseEvent) {
        if (!dragRef.current.active) return;
        const w = containerRef.current?.clientWidth ?? window.innerWidth;
        const h = containerRef.current?.clientHeight ?? window.innerHeight;
        setPip({
            right: Math.max(8, Math.min(w - 168, dragRef.current.startR - (e.clientX - dragRef.current.startX))),
            bottom: Math.max(80, Math.min(h - 110, dragRef.current.startB - (e.clientY - dragRef.current.startY))),
        });
    }
    function onPipUp() { dragRef.current.active = false; window.removeEventListener('mousemove', onPipMove); window.removeEventListener('mouseup', onPipUp); }

    const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const myInitial = user.name.charAt(0).toUpperCase();
    const peerInitial = peerName ? peerName.charAt(0).toUpperCase() : (peerRole === 'mentor' ? 'M' : 'S');
    const displayPeer = peerName || (peerRole === 'mentor' ? 'Mentor' : 'Student');

    // ── SESSION ENDED BY HOST ─────────────────────────────────────────────
    if (sessionEndedByHost) return (
        <div className="flex flex-col items-center justify-center h-full gap-5" style={{ background: '#111827' }}>
            <div className="text-5xl">🏁</div>
            <h2 className="text-white text-2xl font-bold">Session Ended</h2>
            <p className="text-white/40 text-sm">The host ended the session for everyone.</p>
            <button onClick={onLeave}
                className="px-6 py-2.5 rounded-xl font-semibold text-[14px] text-white transition-all hover:scale-105"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
                Back to Editor
            </button>
        </div>
    );

    // ── LOBBY ─────────────────────────────────────────────────────────────
    if (phase === 'lobby') return (
        <div className="flex items-center justify-center h-full" style={{ background: '#111827' }}>
            <div className="flex flex-col lg:flex-row items-center gap-10 px-6 max-w-4xl w-full">
                {/* Preview */}
                <div className="relative rounded-2xl overflow-hidden flex-1 w-full max-w-md"
                    style={{ aspectRatio: '16/9', background: '#1f2937' }}>
                    <video ref={previewRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                    {!lobbyCam && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: '#1f2937' }}>
                            <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-black"
                                style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>{myInitial}</div>
                            <p className="text-white/60 text-sm">Camera is off</p>
                        </div>
                    )}
                    {/* Preview controls */}
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
                        <button onClick={() => {
                            const next = !lobbyMic;
                            setLobbyMic(next);
                            lobbyStream?.getAudioTracks().forEach(t => { t.enabled = next; });
                        }} className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
                            style={{ background: lobbyMic ? 'rgba(255,255,255,0.15)' : '#ea4335', backdropFilter: 'blur(8px)' }}>
                            {lobbyMic ? <MicIcon /> : <MicOffIcon size={16} />}
                        </button>
                        <button onClick={() => {
                            const next = !lobbyCam;
                            setLobbyCam(next);
                            lobbyStream?.getVideoTracks().forEach(t => { t.enabled = next; });
                        }} className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
                            style={{ background: lobbyCam ? 'rgba(255,255,255,0.15)' : '#ea4335', backdropFilter: 'blur(8px)' }}>
                            {lobbyCam ? <CamIcon /> : <CamOffIcon />}
                        </button>
                    </div>
                </div>
                {/* Info + join */}
                <div className="flex flex-col gap-5 flex-1 w-full max-w-xs">
                    <div>
                        <p className="text-white/50 text-sm mb-1">Ready to join?</p>
                        <h2 className="text-white text-2xl font-bold">{sessionTitle}</h2>
                        <p className="text-white/40 text-sm mt-1 capitalize">{user.role}</p>
                    </div>
                    {error && <p className="text-red-400 text-sm">{error}</p>}
                    <div className="flex flex-col gap-2 text-sm text-white/50">
                        <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ background: lobbyMic ? '#10b981' : '#ef4444' }} />
                            Microphone {lobbyMic ? 'on' : 'off'}
                        </span>
                        <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ background: lobbyCam ? '#10b981' : '#ef4444' }} />
                            Camera {lobbyCam ? 'on' : 'off'}
                        </span>
                    </div>
                    <button onClick={joinCall}
                        className="w-full py-3 rounded-xl font-semibold text-[15px] text-white transition-all hover:scale-[1.02] active:scale-95"
                        style={{ background: 'linear-gradient(135deg,#1a73e8,#1557b0)', boxShadow: '0 4px 20px rgba(26,115,232,0.4)' }}>
                        Join now
                    </button>
                    <button onClick={onLeave} className="text-sm text-white/40 hover:text-white/70 transition-colors text-center">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );

    // ── CALL ──────────────────────────────────────────────────────────────
    return (
        <div ref={containerRef} className="relative flex h-full overflow-hidden select-none"
            style={{ background: '#111827' }}
            onMouseMove={resetHide} onClick={() => { resetHide(); setShowEndMenu(false); }}>

            {/* ── Main video area ── */}
            <div className="relative flex-1 flex items-center justify-center overflow-hidden">
                {/* Remote — full bg */}
                {remoteOn ? (
                    <video ref={remoteRef} autoPlay playsInline className="w-full h-full object-cover" />
                ) : (
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-28 h-28 rounded-full flex items-center justify-center text-5xl font-black"
                            style={{
                                background: peerRole === 'mentor' ? 'linear-gradient(135deg,#7c3aed,#4f46e5)' : 'linear-gradient(135deg,#0891b2,#0e7490)',
                                boxShadow: '0 0 60px rgba(124,58,237,0.3)',
                            }}>{peerInitial}</div>
                        <p className="text-white font-semibold text-xl">{displayPeer}</p>
                        <p className="text-white/40 text-sm">
                            {status === 'connecting' ? 'Waiting to join...' : 'Camera is off'}
                        </p>
                        {status === 'connecting' && (
                            <div className="flex gap-1.5 mt-1">
                                {[0, 1, 2].map(i => (
                                    <div key={i} className="w-2 h-2 rounded-full bg-white/30 animate-bounce"
                                        style={{ animationDelay: `${i * 0.15}s` }} />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Remote name tag */}
                {remoteOn && (
                    <div className="absolute bottom-24 left-4 flex items-center gap-2 px-3 py-1.5 rounded-xl"
                        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)' }}>
                        <span className="text-white text-[13px] font-medium">{displayPeer}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full capitalize font-semibold"
                            style={{ background: peerRole === 'mentor' ? 'rgba(124,58,237,0.5)' : 'rgba(8,145,178,0.5)', color: 'white' }}>
                            {peerRole}
                        </span>
                        {peerHandUp && <span className="text-base animate-bounce">✋</span>}
                    </div>
                )}

                {/* Top bar — title + timer + status */}
                <div className="absolute top-0 inset-x-0 flex items-center justify-between px-4 py-3 transition-all duration-300"
                    style={{
                        background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)',
                        opacity: showCtrl ? 1 : 0, pointerEvents: showCtrl ? 'auto' : 'none',
                    }}>
                    <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-xs font-black">M</div>
                        <div>
                            <p className="text-white text-[13px] font-semibold leading-none">{sessionTitle}</p>
                            <p className="text-white/40 text-[11px] mt-0.5">{fmt(elapsed)}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full"
                            style={{ background: 'rgba(0,0,0,0.5)', color: status === 'connected' ? '#6ee7b7' : '#fcd34d' }}>
                            <span className="w-1.5 h-1.5 rounded-full animate-pulse"
                                style={{ background: status === 'connected' ? '#10b981' : '#f59e0b' }} />
                            {status === 'connected' ? 'Connected' : 'Connecting...'}
                        </span>
                        <button onClick={toggleFullscreen}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors"
                            style={{ background: 'rgba(0,0,0,0.4)' }}>
                            {fullscreen ? <ExitFsIcon /> : <FsIcon />}
                        </button>
                    </div>
                </div>

                {/* PiP — local video */}
                <div className="absolute rounded-2xl overflow-hidden cursor-grab active:cursor-grabbing"
                    style={{
                        width: 160, aspectRatio: '16/9', right: pip.right, bottom: pip.bottom,
                        background: '#0a0d14', border: '2px solid rgba(255,255,255,0.15)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.7)', zIndex: 20
                    }}
                    onMouseDown={onPipMouseDown}>
                    <video ref={localRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                    {!camOn && (
                        <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#0a0d14' }}>
                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-black"
                                style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>{myInitial}</div>
                        </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 px-2 py-1.5 flex items-center justify-between"
                        style={{ background: 'linear-gradient(to top,rgba(0,0,0,0.8),transparent)' }}>
                        <span className="text-[10px] text-white font-medium">You {handUp ? '✋' : ''}</span>
                        {!micOn && <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: 'rgba(234,67,53,0.9)' }}><MicOffIcon size={8} /></div>}
                    </div>
                    <div className="absolute top-1.5 right-1.5 opacity-40"><DragIcon /></div>
                </div>

                {/* Error */}
                {error && (
                    <div className="absolute top-16 left-1/2 -translate-x-1/2 w-[90%] max-w-sm flex items-start gap-2 px-4 py-3 rounded-2xl text-[13px] text-red-300"
                        style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', backdropFilter: 'blur(12px)' }}>
                        <span className="shrink-0 mt-0.5">⚠</span><span>{error}</span>
                    </div>
                )}

                {/* ── Bottom control bar ── */}
                <div className="absolute bottom-0 inset-x-0 flex items-center justify-between px-6 py-4 transition-all duration-300"
                    style={{
                        background: 'linear-gradient(to top,rgba(0,0,0,0.9),transparent)',
                        opacity: showCtrl ? 1 : 0, pointerEvents: showCtrl ? 'auto' : 'none',
                        transform: showCtrl ? 'translateY(0)' : 'translateY(8px)',
                    }}>
                    {/* Left — session info */}
                    <div className="hidden sm:flex items-center gap-2 text-white/50 text-[12px]">
                        <span>{fmt(elapsed)}</span>
                        <span>·</span>
                        <span className="capitalize">{user.role}</span>
                    </div>

                    {/* Center — main controls */}
                    <div className="flex items-center gap-3 mx-auto">
                        <MeetBtn on={micOn} onClick={toggleMic} onIcon={<MicIcon />} offIcon={<MicOffIcon size={18} />} label={micOn ? 'Mute' : 'Unmute'} />
                        <MeetBtn on={camOn} onClick={toggleCam} onIcon={<CamIcon />} offIcon={<CamOffIcon />} label={camOn ? 'Stop video' : 'Start video'} />
                        <MeetBtn on={!handUp} onClick={toggleHand} onIcon={<HandIcon />} offIcon={<HandIcon />} label={handUp ? 'Lower hand' : 'Raise hand'}
                            activeColor={handUp ? '#f59e0b' : undefined} />
                        <MeetBtn on={!screenSharing} onClick={toggleScreenShare} onIcon={<ScreenShareIcon />} offIcon={<ScreenShareIcon />} label={screenSharing ? 'Stop share' : 'Share screen'}
                            activeColor={screenSharing ? '#10b981' : undefined} />

                        {/* End / Leave */}
                        <div className="relative">
                            <button
                                onClick={e => {
                                    e.stopPropagation();
                                    if (user.role === 'mentor') setShowEndModal(true);
                                    else handleLeave();
                                }}
                                className="flex items-center gap-2 px-5 py-3 rounded-full font-semibold text-[14px] text-white transition-all hover:scale-105 active:scale-95"
                                style={{ background: '#ea4335', boxShadow: '0 4px 20px rgba(234,67,53,0.5)' }}>
                                <HangupIcon />
                                {user.role === 'mentor' ? 'End' : 'Leave'}
                            </button>
                        </div>
                    </div>

                    {/* Right — panel toggles */}
                    <div className="hidden sm:flex items-center gap-2">
                        <PanelBtn active={sidePanel === 'participants'} onClick={() => setSidePanel(p => p === 'participants' ? null : 'participants')} icon={<PeopleIcon />} label="People" />
                        <PanelBtn active={sidePanel === 'chat'} onClick={() => setSidePanel(p => p === 'chat' ? null : 'chat')} icon={<ChatBubbleIcon />} label="Chat" />
                    </div>
                </div>
            </div>

            {/* ── Side panel ── */}
            {sidePanel && (
                <div className="w-72 shrink-0 flex flex-col" style={{ background: '#1f2937', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
                    {/* Panel header */}
                    <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <span className="text-white font-semibold text-[14px]">{sidePanel === 'participants' ? 'People' : 'In-call messages'}</span>
                        <button onClick={() => setSidePanel(null)} className="text-white/40 hover:text-white transition-colors text-lg leading-none">✕</button>
                    </div>

                    {sidePanel === 'participants' && (
                        <div className="flex-1 overflow-y-auto p-3 space-y-1">
                            {participants.map(p => (
                                <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl group"
                                    style={{ background: 'rgba(255,255,255,0.04)' }}>
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                                        style={{ background: p.role === 'mentor' ? 'linear-gradient(135deg,#7c3aed,#4f46e5)' : 'linear-gradient(135deg,#0891b2,#0e7490)' }}>
                                        {p.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white text-[13px] font-medium truncate">{p.name} {p.id === user.id ? '(You)' : ''}</p>
                                        <p className="text-white/40 text-[11px] capitalize">{p.role}</p>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {p.handRaised && <span className="text-sm">✋</span>}
                                        {!p.micOn && <span className="text-red-400 text-xs">🔇</span>}
                                        {/* Host controls */}
                                        {user.role === 'mentor' && p.id !== user.id && (
                                            <div className="hidden group-hover:flex items-center gap-1">
                                                <button onClick={mutePeer} title="Mute"
                                                    className="w-6 h-6 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all">
                                                    <MicOffIcon size={11} />
                                                </button>
                                                <button onClick={removePeer} title="Remove"
                                                    className="w-6 h-6 rounded-full flex items-center justify-center text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-all text-xs">
                                                    ✕
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {participants.length === 0 && (
                                <p className="text-white/30 text-[13px] text-center py-8">No participants yet</p>
                            )}
                        </div>
                    )}

                    {sidePanel === 'chat' && (
                        <InCallChat socket={socket} sessionId={sessionId} userName={user.name} />
                    )}
                </div>
            )}

            {/* ── End call modal (mentor only) ── */}
            {showEndModal && (
                <div className="absolute inset-0 z-50 flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
                    onClick={() => setShowEndModal(false)}>
                    <div className="w-full max-w-sm mx-4 rounded-2xl overflow-hidden shadow-2xl"
                        style={{ background: '#1a2030', border: '1px solid rgba(255,255,255,0.1)' }}
                        onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="px-6 pt-6 pb-4">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                                style={{ background: 'rgba(234,67,53,0.15)', border: '1px solid rgba(234,67,53,0.3)' }}>
                                <HangupIcon />
                            </div>
                            <h3 className="text-white text-[17px] font-bold text-center">End the call?</h3>
                            <p className="text-white/40 text-[13px] text-center mt-1.5 leading-relaxed">
                                Choose how you want to end — you can keep the session open for code review.
                            </p>
                        </div>
                        {/* Options */}
                        <div className="px-4 pb-4 flex flex-col gap-2">
                            <button onClick={handleEndCallOnly}
                                className="w-full flex items-start gap-3 px-4 py-3.5 rounded-xl text-left transition-all hover:scale-[1.01]"
                                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <span className="text-xl mt-0.5">📞</span>
                                <div>
                                    <p className="text-white text-[14px] font-semibold">End call only</p>
                                    <p className="text-white/40 text-[12px] mt-0.5">Both return to the editor. Session stays open — student can still review the code.</p>
                                </div>
                            </button>
                            <button onClick={handleEndCallAndSession}
                                className="w-full flex items-start gap-3 px-4 py-3.5 rounded-xl text-left transition-all hover:scale-[1.01]"
                                style={{ background: 'rgba(234,67,53,0.08)', border: '1px solid rgba(234,67,53,0.25)' }}>
                                <span className="text-xl mt-0.5">⛔</span>
                                <div>
                                    <p className="text-red-400 text-[14px] font-semibold">End call & close session</p>
                                    <p className="text-white/40 text-[12px] mt-0.5">Ends the call and permanently closes the session for everyone.</p>
                                </div>
                            </button>
                            <button onClick={() => setShowEndModal(false)}
                                className="w-full py-2.5 rounded-xl text-[13px] text-white/40 hover:text-white/70 transition-colors mt-1">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Toasts ── */}
            <div className="absolute top-4 right-4 flex flex-col gap-2 z-50 pointer-events-none">
                {toasts.map(t => (
                    <div key={t.id} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] text-white shadow-xl"
                        style={{ background: t.type === 'warn' ? 'rgba(234,67,53,0.9)' : 'rgba(31,41,55,0.95)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                        {t.msg}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── In-call chat (lightweight, no DB) ─────────────────────────────────────────
function InCallChat({ socket, sessionId, userName }: { socket: Socket; sessionId: string; userName: string }) {
    const [msgs, setMsgs] = useState<{ name: string; text: string; mine: boolean }[]>([]);
    const [input, setInput] = useState('');
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        socket.on('incall-message', ({ name, text }: { name: string; text: string }) => {
            setMsgs(p => [...p, { name, text, mine: false }]);
        });
        return () => { socket.off('incall-message'); };
    }, [socket]);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

    function send(e: React.FormEvent) {
        e.preventDefault();
        if (!input.trim()) return;
        socket.emit('incall-message', { sessionId, name: userName, text: input.trim() });
        setMsgs(p => [...p, { name: userName, text: input.trim(), mine: true }]);
        setInput('');
    }

    return (
        <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {msgs.length === 0 && <p className="text-white/30 text-[13px] text-center py-8">No messages yet</p>}
                {msgs.map((m, i) => (
                    <div key={i} className={`flex flex-col ${m.mine ? 'items-end' : 'items-start'}`}>
                        <span className="text-[10px] text-white/30 mb-1">{m.name}</span>
                        <div className="px-3 py-2 rounded-2xl text-[13px] max-w-[88%] break-words"
                            style={{
                                background: m.mine ? '#1a73e8' : 'rgba(255,255,255,0.08)', color: 'white',
                                borderRadius: m.mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px'
                            }}>
                            {m.text}
                        </div>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>
            <form onSubmit={send} className="p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <input value={input} onChange={e => setInput(e.target.value)} placeholder="Send a message..."
                        className="flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/30" />
                    <button type="submit" disabled={!input.trim()} className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30 transition-all"
                        style={{ background: '#1a73e8' }}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 10V2M2 6l4-4 4 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                </div>
            </form>
        </div>
    );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function MeetBtn({ on, onClick, onIcon, offIcon, label, activeColor }: {
    on: boolean; onClick: () => void; onIcon: React.ReactNode; offIcon: React.ReactNode; label: string; activeColor?: string;
}) {
    return (
        <div className="flex flex-col items-center gap-1.5">
            <button onClick={onClick}
                className="w-12 h-12 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                style={{ background: activeColor ? activeColor : on ? 'rgba(255,255,255,0.15)' : '#ea4335', backdropFilter: 'blur(8px)', border: on && !activeColor ? '1px solid rgba(255,255,255,0.2)' : 'none' }}>
                <span className="text-white">{on ? onIcon : offIcon}</span>
            </button>
            <span className="text-[10px] text-white/50">{label}</span>
        </div>
    );
}
function PanelBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
    return (
        <div className="flex flex-col items-center gap-1.5">
            <button onClick={onClick}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110"
                style={{ background: active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)', border: active ? '1px solid rgba(255,255,255,0.3)' : '1px solid transparent' }}>
                <span className="text-white">{icon}</span>
            </button>
            <span className="text-[10px] text-white/50">{label}</span>
        </div>
    );
}

// ── Icons ──────────────────────────────────────────────────────────────────────
function MicIcon() { return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="6" y="1" width="6" height="9" rx="3" stroke="white" strokeWidth="1.6" /><path d="M3 9a6 6 0 0 0 12 0M9 15v2" stroke="white" strokeWidth="1.6" strokeLinecap="round" /></svg>; }
function MicOffIcon({ size = 18 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 18 18" fill="none"><rect x="6" y="1" width="6" height="9" rx="3" stroke="white" strokeWidth="1.6" /><path d="M3 9a6 6 0 0 0 12 0M9 15v2M2 2l14 14" stroke="white" strokeWidth="1.6" strokeLinecap="round" /></svg>; }
function CamIcon() { return <svg width="20" height="18" viewBox="0 0 20 18" fill="none"><rect x="1" y="4" width="12" height="10" rx="2" stroke="white" strokeWidth="1.6" /><path d="M13 8l6-3v8l-6-3V8z" stroke="white" strokeWidth="1.6" strokeLinejoin="round" /></svg>; }
function CamOffIcon() { return <svg width="20" height="18" viewBox="0 0 20 18" fill="none"><rect x="1" y="4" width="12" height="10" rx="2" stroke="white" strokeWidth="1.6" /><path d="M13 8l6-3v8l-6-3V8zM1 1l18 16" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function HangupIcon() { return <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M2 13c0-5.523 3.582-10 8-10s8 4.477 8 10" stroke="white" strokeWidth="1.8" strokeLinecap="round" /><rect x="6" y="12" width="8" height="4" rx="2" fill="white" /></svg>; }
function HandIcon() { return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 1v8M6 3v6M3 5v4a6 6 0 0 0 12 0V5M12 3v6" stroke="white" strokeWidth="1.6" strokeLinecap="round" /></svg>; }
function PeopleIcon() { return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="7" cy="6" r="3" stroke="white" strokeWidth="1.5" /><path d="M1 16c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" /><path d="M13 8a3 3 0 1 0 0-6M17 16c0-2.761-1.79-5.1-4.25-5.83" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>; }
function ChatBubbleIcon() { return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6l-4 3V3z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" /></svg>; }
function FsIcon() { return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function ExitFsIcon() { return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 1v4H1M13 5H9V1M9 13v-4h4M1 9h4v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function DragIcon() { return <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="3" cy="3" r="1" fill="white" /><circle cx="7" cy="3" r="1" fill="white" /><circle cx="3" cy="7" r="1" fill="white" /><circle cx="7" cy="7" r="1" fill="white" /></svg>; }
function ScreenShareIcon() { return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="1" y="2" width="16" height="11" rx="2" stroke="white" strokeWidth="1.6" /><path d="M6 16h6M9 13v3" stroke="white" strokeWidth="1.6" strokeLinecap="round" /><path d="M6 9l3-3 3 3M9 6v5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
