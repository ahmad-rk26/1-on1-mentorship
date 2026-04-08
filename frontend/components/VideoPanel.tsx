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

interface Participant { id: string; name: string; role: string; micOn: boolean; camOn: boolean; }
interface WaitingEntry { userId: string; name: string; socketId: string; }
type Toast = { id: number; msg: string; type: 'info' | 'warn' | 'success'; };
// lobby  = camera preview (both roles)
// knock  = student sent request, waiting for admit
// call   = in the meeting
type Phase = 'lobby' | 'knock' | 'call';

const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

export default function VideoPanel({ sessionId, socket, user, peerName, peerRole, sessionTitle, onLeave, onEndSession }: Props) {
    // ── Refs ──────────────────────────────────────────────────────────────
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const previewRef = useRef<HTMLVideoElement>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const localStream = useRef<MediaStream | null>(null);
    const remoteStream = useRef<MediaStream | null>(null);
    const iceBuf = useRef<RTCIceCandidateInit[]>([]);
    const remoteReady = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const toastCounter = useRef(0);
    const pipRef = useRef({ active: false, startX: 0, startY: 0, startR: 16, startB: 80 });

    // ── State ─────────────────────────────────────────────────────────────
    const [phase, setPhase] = useState<Phase>('lobby');
    const [micOn, setMicOn] = useState(true);
    const [camOn, setCamOn] = useState(true);
    const [previewMic, setPreviewMic] = useState(true);
    const [previewCam, setPreviewCam] = useState(true);
    const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
    const [remoteOn, setRemoteOn] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [showCtrl, setShowCtrl] = useState(true);
    const [fullscreen, setFullscreen] = useState(false);
    const [handUp, setHandUp] = useState(false);
    const [peerHandUp, setPeerHandUp] = useState(false);
    const [screenShare, setScreenShare] = useState(false);
    const [sidePanel, setSidePanel] = useState<'people' | 'chat' | null>(null);
    const [showEndModal, setShowEndModal] = useState(false);
    const [ended, setEnded] = useState(false);
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [waiting, setWaiting] = useState<WaitingEntry[]>([]);
    const [mentorLive, setMentorLive] = useState(false);
    const [peerDisplayName, setPeerDisplayName] = useState(peerName);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [pip, setPip] = useState({ right: 16, bottom: 80 });
    const [error, setError] = useState('');
    const [connStatus, setConnStatus] = useState<'connecting' | 'connected'>('connecting');
    const [micAllowed, setMicAllowed] = useState(true);
    const [camAllowed, setCamAllowed] = useState(true);
    const [screenAllowed, setScreenAllowed] = useState(false);

    // ── Toast ─────────────────────────────────────────────────────────────
    const addToast = useCallback((msg: string, type: Toast['type'] = 'info') => {
        const id = ++toastCounter.current;
        setToasts(p => [...p, { id, msg, type }]);
        setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
    }, []);

    // ── Auto-hide controls ────────────────────────────────────────────────
    const resetHide = useCallback(() => {
        setShowCtrl(true);
        if (hideRef.current) clearTimeout(hideRef.current);
        hideRef.current = setTimeout(() => setShowCtrl(false), 4000);
    }, []);

    // ── Preview camera on lobby/knock ─────────────────────────────────────
    useEffect(() => {
        if (phase === 'call') return;
        let s: MediaStream;
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(stream => {
                s = stream;
                setPreviewStream(stream);
                if (previewRef.current) previewRef.current.srcObject = stream;
            })
            .catch(() => setError('Camera/mic permission denied'));
        return () => {
            // Only stop tracks when unmounting, not on every phase change
            // enterCall will reuse this stream
        };
    }, []); // run once on mount only

    // ── Cleanup on unmount ────────────────────────────────────────────────
    useEffect(() => {
        return () => {
            localStream.current?.getTracks().forEach(t => t.stop());
            pcRef.current?.close();
        };
    }, []);
    useEffect(() => {
        if (phase !== 'call') return;
        resetHide();
        timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (hideRef.current) clearTimeout(hideRef.current);
        };
    }, [phase]);

    // ── Apply remote stream when element mounts ───────────────────────────
    useEffect(() => {
        if (remoteOn && remoteVideoRef.current && remoteStream.current) {
            remoteVideoRef.current.srcObject = remoteStream.current;
            remoteVideoRef.current.play().catch(() => { });
        }
    }, [remoteOn]);

    // ── Apply local stream when call renders ──────────────────────────────
    useEffect(() => {
        if (phase === 'call' && localVideoRef.current && localStream.current) {
            localVideoRef.current.srcObject = localStream.current;
        }
    }, [phase]);

    // ── WebRTC helpers ────────────────────────────────────────────────────
    const createPC = useCallback(() => {
        if (pcRef.current) return pcRef.current;
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 10 });
        pcRef.current = pc;

        pc.onicecandidate = ({ candidate }) => {
            if (candidate) socket.emit('webrtc-ice-candidate', { sessionId, candidate });
        };
        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'failed') pc.restartIce();
        };
        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'connected') {
                setConnStatus('connected');
                addToast(`📞 Connected`, 'success');
                setParticipants(prev =>
                    prev.find(p => p.role === peerRole) ? prev :
                        [...prev, { id: 'peer', name: displayName, role: peerRole, micOn: true, camOn: true }]
                );
            }
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                setConnStatus('connecting');
                setRemoteOn(false);
                setParticipants(prev => prev.filter(p => p.role !== peerRole));
                addToast(`${displayName} left the call`, 'warn');
            }
        };
        pc.ontrack = ({ streams }) => {
            const stream = streams[0];
            remoteStream.current = stream;
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = stream;
                remoteVideoRef.current.play().catch(() => { });
            }
            setRemoteOn(true);
            setConnStatus('connected');
        };
        // Tracks are added explicitly after this call — do NOT add here
        return pc;
    }, [socket, sessionId, peerName, peerRole, addToast]);

    const sendOffer = useCallback(async () => {
        const pc = pcRef.current;
        if (!pc) return;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc-offer', { sessionId, offer });
    }, [socket, sessionId]);

    const flushICE = useCallback(async (pc: RTCPeerConnection) => {
        for (const c of iceBuf.current) {
            try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { }
        }
        iceBuf.current = [];
    }, []);

    // ── Keep phase ref current for socket handlers ────────────────────────
    const phaseRef = useRef<Phase>('lobby');
    useEffect(() => { phaseRef.current = phase; }, [phase]);

    const previewMicRef = useRef(true);
    const previewCamRef = useRef(true);
    useEffect(() => { previewMicRef.current = previewMic; }, [previewMic]);
    useEffect(() => { previewCamRef.current = previewCam; }, [previewCam]);

    // ── Enter the call ────────────────────────────────────────────────────
    const enterCall = useCallback(async (perms?: { mic: boolean; cam: boolean }) => {
        const mic = perms ? perms.mic : true;
        const cam = perms ? perms.cam : true;
        const curMic = previewMicRef.current;
        const curCam = previewCamRef.current;

        // Reuse the preview stream — don't stop it and request again
        // This avoids "camera in use" / permission denied errors
        let stream = previewStream;

        if (!stream) {
            // No preview stream (e.g. permission was denied earlier, retry)
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 1280 }, height: { ideal: 720 } },
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                });
            } catch (e: any) {
                setError(`Camera/mic error: ${e.message}`);
                return;
            }
        }

        // Detach from preview element
        if (previewRef.current) previewRef.current.srcObject = null;
        setPreviewStream(null);

        // Apply toggle + permission state to existing tracks
        stream.getAudioTracks().forEach(t => { t.enabled = curMic && mic; });
        stream.getVideoTracks().forEach(t => { t.enabled = curCam && cam; });
        setMicOn(curMic && mic);
        setCamOn(curCam && cam);

        // Store stream BEFORE creating PC so tracks can be added
        localStream.current = stream;
        iceBuf.current = [];
        remoteReady.current = false;

        // Create PC then explicitly add all tracks
        const pc = createPC();
        stream.getTracks().forEach(t => {
            if (!pc.getSenders().find(s => s.track === t)) {
                pc.addTrack(t, stream!);
            }
        });

        // Show call UI
        setPhase('call');
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        if (user.role === 'mentor') {
            socket.emit('mentor-joined-call', { sessionId });
            // Do NOT send offer here — wait for student to signal peer-ready
            // This ensures student's PC is ready to receive the offer
        } else {
            socket.emit('peer-ready', { sessionId });
        }
        setParticipants([{ id: user.id, name: user.name, role: user.role, micOn: curMic && mic, camOn: curCam && cam }]);
    }, [previewStream, createPC, sendOffer, socket, sessionId, user]);

    // ── Keep enterCall ref current so socket handler always calls latest ──
    const enterCallRef = useRef(enterCall);
    useEffect(() => { enterCallRef.current = enterCall; }, [enterCall]);

    // ── Socket events ─────────────────────────────────────────────────────
    useEffect(() => {
        // Mentor auto-announces when VideoPanel opens
        if (user.role === 'mentor') socket.emit('meeting-start', { sessionId });

        socket.on('mentor-in-call', () => { setMentorLive(true); addToast('Host started the meeting', 'success'); });
        socket.on('mentor-left-call', () => { setMentorLive(false); if (phaseRef.current === 'knock') { setPhase('lobby'); addToast('Host left', 'warn'); } });
        socket.on('meeting-not-started', () => { setPhase('lobby'); addToast('Host has not started yet', 'warn'); });

        socket.on('meeting-admitted', ({ permissions: p }: { permissions: { mic: boolean; cam: boolean; screen: boolean } }) => {
            setMicAllowed(p.mic); setCamAllowed(p.cam); setScreenAllowed(p.screen);
            addToast('✅ Admitted to the meeting', 'success');
            enterCallRef.current({ mic: p.mic, cam: p.cam });
        });
        socket.on('meeting-denied', () => { setPhase('lobby'); addToast('❌ Request denied', 'warn'); });

        socket.on('participant-waiting', (p: WaitingEntry) => {
            setWaiting(prev => [...prev.filter(x => x.userId !== p.userId), p]);
            // Store name so we can show it when they join
            setPeerDisplayName(p.name);
            addToast(`🔔 Someone is asking to join`, 'info');
        });

        socket.on('permission-changed', ({ permission, value, by }: { permission: string; value: boolean; by: string }) => {
            if (permission === 'mic') {
                setMicAllowed(value);
                localStream.current?.getAudioTracks().forEach(t => { t.enabled = value; });
                setMicOn(value);
                addToast(value ? `🎙️ ${by} unmuted you` : `🔇 ${by} muted you`, 'warn');
            }
            if (permission === 'cam') {
                setCamAllowed(value);
                localStream.current?.getVideoTracks().forEach(t => { t.enabled = value; });
                setCamOn(value);
                addToast(value ? `📷 ${by} enabled your camera` : `📷 ${by} disabled your camera`, 'warn');
            }
            if (permission === 'screen' && !value && screenShare) {
                stopScreenShare();
                addToast(`🖥️ ${by} stopped your screen share`, 'warn');
            }
            if (permission === 'screen') setScreenAllowed(value);
        });

        socket.on('call-ended', () => { addToast('📞 Host ended the call', 'warn'); cleanup(); setTimeout(onLeave, 1200); });
        socket.on('session-ended', () => { cleanup(); setEnded(true); });
        socket.on('host-remove-me', () => { addToast('You were removed', 'warn'); cleanup(); setTimeout(onLeave, 1500); });

        socket.on('hand-raised', ({ name }: { name: string }) => {
            setPeerHandUp(true);
            addToast(`✋ ${name} raised their hand`);
            setTimeout(() => setPeerHandUp(false), 8000);
        });
        socket.on('hand-lowered', () => setPeerHandUp(false));

        // WebRTC
        socket.on('webrtc-offer', async ({ offer }: { offer: RTCSessionDescriptionInit }) => {
            const pc = createPC();
            // Ensure student's local tracks are added before answering
            if (localStream.current) {
                const existingTracks = pc.getSenders().map(s => s.track).filter(Boolean);
                localStream.current.getTracks().forEach(t => {
                    if (!existingTracks.includes(t)) pc.addTrack(t, localStream.current!);
                });
            }
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            remoteReady.current = true;
            await flushICE(pc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('webrtc-answer', { sessionId, answer });
        });
        socket.on('webrtc-answer', async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
            const pc = pcRef.current;
            if (!pc) return;
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            remoteReady.current = true;
            await flushICE(pc);
        });
        socket.on('webrtc-ice-candidate', async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
            if (!remoteReady.current || !pcRef.current) { iceBuf.current.push(candidate); return; }
            try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch { }
        });
        socket.on('peer-ready', async () => {
            if (user.role !== 'mentor') return;
            // Reset negotiation state for fresh offer
            iceBuf.current = [];
            remoteReady.current = false;
            const pc = createPC();
            // Add local tracks if not already added
            if (localStream.current) {
                const existingTracks = pc.getSenders().map(s => s.track).filter(Boolean);
                localStream.current.getTracks().forEach(t => {
                    if (!existingTracks.includes(t)) pc.addTrack(t, localStream.current!);
                });
            }
            await sendOffer();
        });

        return () => {
            ['mentor-in-call', 'mentor-left-call', 'meeting-not-started', 'meeting-admitted',
                'meeting-denied', 'participant-waiting', 'permission-changed', 'call-ended',
                'session-ended', 'host-remove-me', 'hand-raised', 'hand-lowered',
                'webrtc-offer', 'webrtc-answer', 'webrtc-ice-candidate', 'peer-ready',
            ].forEach(e => socket.off(e));
        };
    }, [socket, sessionId, createPC, sendOffer, flushICE, enterCall, addToast]);

    // ── Cleanup ───────────────────────────────────────────────────────────
    function cleanup() {
        localStream.current?.getTracks().forEach(t => t.stop());
        previewStream?.getTracks().forEach(t => t.stop());
        pcRef.current?.close();
        pcRef.current = null;
        localStream.current = null;
        remoteStream.current = null;
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        if (previewRef.current) previewRef.current.srcObject = null;
    }

    // ── Controls ──────────────────────────────────────────────────────────
    function toggleMic() {
        if (!micAllowed) { addToast('🔇 Host has muted you', 'warn'); return; }
        localStream.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
        setMicOn(p => !p);
    }
    function toggleCam() {
        if (!camAllowed) { addToast('📷 Host disabled your camera', 'warn'); return; }
        localStream.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
        setCamOn(p => !p);
    }
    function toggleHand() {
        const next = !handUp; setHandUp(next);
        if (next) { socket.emit('raise-hand', { sessionId, name: user.name }); addToast('✋ Hand raised'); }
        else socket.emit('lower-hand', { sessionId });
    }
    async function toggleScreenShare() {
        if (!screenAllowed && user.role !== 'mentor') { addToast('🖥️ Host has not allowed screen sharing', 'warn'); return; }
        if (screenShare) { stopScreenShare(); return; }
        try {
            const screen = await (navigator.mediaDevices as any).getDisplayMedia({ video: { cursor: 'always' }, audio: true });
            const vTrack: MediaStreamTrack = screen.getVideoTracks()[0];
            const aTrack: MediaStreamTrack | undefined = screen.getAudioTracks()[0];
            const pc = pcRef.current;
            if (pc) {
                const vSender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (vSender) await vSender.replaceTrack(vTrack);
                else { pc.addTrack(vTrack, screen); await sendOffer(); }
                if (aTrack) { pc.addTrack(aTrack, screen); await sendOffer(); }
            }
            vTrack.onended = () => stopScreenShare();
            setScreenShare(true);
            addToast('📺 Screen sharing' + (aTrack ? ' with audio' : ''));
        } catch (e: any) { if (e.name !== 'NotAllowedError') addToast('Screen share failed', 'warn'); }
    }
    function stopScreenShare() {
        const camTrack = localStream.current?.getVideoTracks()[0];
        const pc = pcRef.current;
        if (pc && camTrack) {
            const vSender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (vSender) vSender.replaceTrack(camTrack);
        }
        setScreenShare(false);
    }
    function toggleFullscreen() {
        if (!document.fullscreenElement) { containerRef.current?.requestFullscreen(); setFullscreen(true); }
        else { document.exitFullscreen(); setFullscreen(false); }
    }
    function handleLeave() {
        if (user.role === 'mentor') socket.emit('mentor-left-call', { sessionId });
        cleanup(); onLeave();
    }
    function handleEndCallOnly() {
        socket.emit('meeting-end-call', { sessionId });
        cleanup(); setShowEndModal(false); onLeave();
    }
    function handleEndSession() {
        socket.emit('end-session', sessionId);
        cleanup(); setShowEndModal(false); onEndSession?.();
    }
    function admitUser(socketId: string, userId: string) {
        socket.emit('meeting-admit', { sessionId, socketId, userId });
        setWaiting(p => p.filter(x => x.socketId !== socketId));
        addToast('✅ Admitted', 'success');
    }
    function denyUser(socketId: string) {
        socket.emit('meeting-deny', { sessionId, socketId });
        setWaiting(p => p.filter(x => x.socketId !== socketId));
    }
    function setPermission(targetUserId: string, permission: string, value: boolean) {
        socket.emit('host-set-permission', { sessionId, targetUserId, permission, value });
    }
    function removeUser(targetUserId: string) {
        socket.emit('meeting-remove', { sessionId, targetUserId });
    }

    // ── PiP drag ──────────────────────────────────────────────────────────
    function onPipDown(e: React.MouseEvent) {
        e.preventDefault();
        pipRef.current = { active: true, startX: e.clientX, startY: e.clientY, startR: pip.right, startB: pip.bottom };
        window.addEventListener('mousemove', onPipMove);
        window.addEventListener('mouseup', onPipUp);
    }
    function onPipMove(e: MouseEvent) {
        if (!pipRef.current.active) return;
        const w = containerRef.current?.clientWidth ?? window.innerWidth;
        const h = containerRef.current?.clientHeight ?? window.innerHeight;
        setPip({
            right: Math.max(8, Math.min(w - 168, pipRef.current.startR - (e.clientX - pipRef.current.startX))),
            bottom: Math.max(80, Math.min(h - 110, pipRef.current.startB - (e.clientY - pipRef.current.startY))),
        });
    }
    function onPipUp() { pipRef.current.active = false; window.removeEventListener('mousemove', onPipMove); window.removeEventListener('mouseup', onPipUp); }

    const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const myInitial = user.name.charAt(0).toUpperCase();
    const displayName = peerDisplayName || peerName || peerRole;
    const peerInitial = displayName.charAt(0).toUpperCase();

    // ── SESSION ENDED ─────────────────────────────────────────────────────
    if (ended) return (
        <div className="flex flex-col items-center justify-center h-full gap-5" style={{ background: '#111827' }}>
            <div className="text-5xl">🏁</div>
            <h2 className="text-white text-2xl font-bold">Session Ended</h2>
            <p className="text-white/40 text-sm">The host ended the session.</p>
            <button onClick={onLeave} className="px-6 py-2.5 rounded-xl font-semibold text-white text-[14px]" style={{ background: '#7c3aed' }}>Back to Editor</button>
        </div>
    );

    // ── LOBBY / KNOCK — Google Meet pre-join screen ───────────────────────
    if (phase === 'lobby' || phase === 'knock') return (
        <div className="flex items-center justify-center h-full" style={{ background: '#202124' }}>
            <div className="flex flex-col lg:flex-row items-center gap-12 px-6 max-w-4xl w-full">

                {/* Camera preview */}
                <div className="relative rounded-2xl overflow-hidden w-full max-w-lg flex-1" style={{ aspectRatio: '16/9', background: '#3c4043' }}>
                    <video ref={previewRef} autoPlay muted playsInline className="w-full h-full object-cover" />

                    {/* Camera off avatar */}
                    {!previewCam && (
                        <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#3c4043' }}>
                            <div className="w-24 h-24 rounded-full flex items-center justify-center text-4xl font-bold text-white" style={{ background: '#5f6368' }}>{myInitial}</div>
                        </div>
                    )}

                    {/* Waiting for host overlay (student only) */}
                    {user.role === 'student' && !mentorLive && phase === 'lobby' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
                            <p className="text-white font-medium text-[15px]">Waiting for host to start</p>
                            <div className="flex gap-1.5">{[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />)}</div>
                        </div>
                    )}

                    {/* Knocking overlay */}
                    {phase === 'knock' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}>
                            <p className="text-white font-medium text-[15px]">Asking to be let in...</p>
                            <div className="flex gap-1.5">{[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-amber-400/70 animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />)}</div>
                        </div>
                    )}

                    {/* Preview mic/cam toggles */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3">
                        <button onClick={() => { const n = !previewMic; setPreviewMic(n); previewStream?.getAudioTracks().forEach(t => { t.enabled = n; }); }}
                            className="w-12 h-12 rounded-full flex items-center justify-center transition-all"
                            style={{ background: previewMic ? 'rgba(255,255,255,0.15)' : '#ea4335', backdropFilter: 'blur(8px)' }}>
                            {previewMic ? <MicIcon /> : <MicOffIcon />}
                        </button>
                        <button onClick={() => { const n = !previewCam; setPreviewCam(n); previewStream?.getVideoTracks().forEach(t => { t.enabled = n; }); }}
                            className="w-12 h-12 rounded-full flex items-center justify-center transition-all"
                            style={{ background: previewCam ? 'rgba(255,255,255,0.15)' : '#ea4335', backdropFilter: 'blur(8px)' }}>
                            {previewCam ? <CamIcon /> : <CamOffIcon />}
                        </button>
                    </div>
                </div>

                {/* Right panel */}
                <div className="flex flex-col gap-5 w-full max-w-xs">
                    <div>
                        <h2 className="text-white text-2xl font-semibold">{sessionTitle}</h2>
                        <p className="text-white/50 text-sm mt-1 capitalize">{user.role}</p>
                    </div>
                    <div className="flex flex-col gap-2 text-[13px] text-white/50">
                        <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: previewMic ? '#34a853' : '#ea4335' }} />Microphone {previewMic ? 'on' : 'off'}</span>
                        <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: previewCam ? '#34a853' : '#ea4335' }} />Camera {previewCam ? 'on' : 'off'}</span>
                    </div>
                    {error && <p className="text-red-400 text-[13px]">{error}</p>}

                    {user.role === 'mentor' ? (
                        <button onClick={() => enterCall()}
                            className="w-full py-3 rounded-full font-medium text-[15px] text-white transition-all hover:opacity-90"
                            style={{ background: '#1a73e8' }}>
                            Join now
                        </button>
                    ) : phase === 'knock' ? (
                        <button onClick={() => setPhase('lobby')}
                            className="w-full py-3 rounded-full font-medium text-[15px] text-white/70 transition-all hover:text-white"
                            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
                            Cancel request
                        </button>
                    ) : mentorLive ? (
                        <button onClick={() => { socket.emit('meeting-request-join', { sessionId }); setPhase('knock'); }}
                            className="w-full py-3 rounded-full font-medium text-[15px] text-white transition-all hover:opacity-90"
                            style={{ background: '#1a73e8' }}>
                            Ask to join
                        </button>
                    ) : (
                        <button disabled className="w-full py-3 rounded-full font-medium text-[15px] text-white/30 cursor-not-allowed" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            Waiting for host...
                        </button>
                    )}
                    <button onClick={onLeave} className="text-sm text-white/30 hover:text-white/60 transition-colors text-center">← Back to editor</button>
                </div>
            </div>
        </div>
    );

    // ── CALL — Google Meet-style ───────────────────────────────────────────
    return (
        <div ref={containerRef} className="relative flex h-full overflow-hidden select-none"
            style={{ background: '#202124' }}
            onMouseMove={resetHide}
            onClick={() => { resetHide(); setShowEndModal(false); }}>

            {/* Remote video — always mounted */}
            <div className="relative flex-1 flex items-center justify-center overflow-hidden">
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover"
                    style={{ display: remoteOn ? 'block' : 'none' }} />

                {/* No remote yet */}
                {!remoteOn && (
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-32 h-32 rounded-full flex items-center justify-center text-5xl font-bold text-white"
                            style={{ background: peerRole === 'mentor' ? '#7c3aed' : '#0891b2' }}>
                            {peerInitial}
                        </div>
                        <p className="text-white text-xl font-medium">{displayName}</p>
                        <p className="text-white/40 text-sm">
                            {connStatus === 'connecting' ? 'Waiting to join...' : 'Camera is off'}
                        </p>
                        {connStatus === 'connecting' && (
                            <div className="flex gap-1.5 mt-1">{[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
                        )}
                    </div>
                )}

                {/* Remote name tag */}
                {remoteOn && (
                    <div className="absolute bottom-24 left-4 flex items-center gap-2 px-3 py-1.5 rounded-lg"
                        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
                        <span className="text-white text-[13px]">{displayName}</span>
                        {peerHandUp && <span className="animate-bounce">✋</span>}
                    </div>
                )}

                {/* Top bar */}
                <div className="absolute top-0 inset-x-0 flex items-center justify-between px-5 py-3 transition-all duration-300"
                    style={{ background: 'linear-gradient(to bottom,rgba(0,0,0,0.6),transparent)', opacity: showCtrl ? 1 : 0, pointerEvents: showCtrl ? 'auto' : 'none' }}>
                    <div>
                        <p className="text-white font-medium text-[14px]">{sessionTitle}</p>
                        <p className="text-white/50 text-[12px]">{fmt(elapsed)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1.5 text-[12px] px-3 py-1 rounded-full"
                            style={{ background: 'rgba(0,0,0,0.5)', color: connStatus === 'connected' ? '#34a853' : '#fbbc04' }}>
                            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: connStatus === 'connected' ? '#34a853' : '#fbbc04' }} />
                            {connStatus === 'connected' ? 'Connected' : 'Connecting...'}
                        </span>
                        <button onClick={toggleFullscreen} className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white" style={{ background: 'rgba(0,0,0,0.4)' }}>
                            {fullscreen ? <ExitFsIcon /> : <FsIcon />}
                        </button>
                    </div>
                </div>

                {/* PiP local video */}
                <div className="absolute rounded-xl overflow-hidden cursor-grab active:cursor-grabbing"
                    style={{ width: 160, aspectRatio: '16/9', right: pip.right, bottom: pip.bottom, background: '#3c4043', border: '2px solid rgba(255,255,255,0.15)', boxShadow: '0 4px 20px rgba(0,0,0,0.6)', zIndex: 20 }}
                    onMouseDown={onPipDown}>
                    <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                    {!camOn && (
                        <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#3c4043' }}>
                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold text-white" style={{ background: '#5f6368' }}>{myInitial}</div>
                        </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 px-2 py-1 flex items-center justify-between" style={{ background: 'linear-gradient(to top,rgba(0,0,0,0.7),transparent)' }}>
                        <span className="text-[10px] text-white">You {handUp ? '✋' : ''}</span>
                        {!micOn && <span className="text-red-400 text-[10px]">🔇</span>}
                    </div>
                </div>

                {/* Bottom control bar */}
                <div className="absolute bottom-0 inset-x-0 flex items-center justify-between px-6 py-4 transition-all duration-300"
                    style={{ background: 'linear-gradient(to top,rgba(0,0,0,0.8),transparent)', opacity: showCtrl ? 1 : 0, pointerEvents: showCtrl ? 'auto' : 'none', transform: showCtrl ? 'translateY(0)' : 'translateY(8px)' }}>

                    {/* Left — time + role */}
                    <div className="hidden sm:flex items-center gap-2 text-white/50 text-[12px] min-w-[100px]">
                        <span>{fmt(elapsed)}</span><span>·</span><span className="capitalize">{user.role}</span>
                    </div>

                    {/* Center — controls */}
                    <div className="flex items-center gap-2 mx-auto">
                        <CtrlBtn active={micOn && micAllowed} onClick={toggleMic} locked={!micAllowed}
                            icon={micOn && micAllowed ? <MicIcon /> : <MicOffIcon />}
                            label={micOn ? 'Mute' : 'Unmute'} />
                        <CtrlBtn active={camOn && camAllowed} onClick={toggleCam} locked={!camAllowed}
                            icon={camOn && camAllowed ? <CamIcon /> : <CamOffIcon />}
                            label={camOn ? 'Stop video' : 'Start video'} />
                        <CtrlBtn active={!handUp} onClick={toggleHand}
                            icon={<HandIcon />} label={handUp ? 'Lower hand' : 'Raise hand'}
                            activeColor={handUp ? '#fbbc04' : undefined} />
                        <CtrlBtn active={!screenShare} onClick={toggleScreenShare}
                            icon={<ScreenIcon />} label={screenShare ? 'Stop share' : 'Present'}
                            activeColor={screenShare ? '#34a853' : undefined}
                            locked={!screenAllowed && user.role !== 'mentor'} />

                        {/* End / Leave */}
                        <button onClick={e => { e.stopPropagation(); user.role === 'mentor' ? setShowEndModal(true) : handleLeave(); }}
                            className="flex items-center gap-2 px-6 py-3 rounded-full font-medium text-[14px] text-white transition-all hover:opacity-90"
                            style={{ background: '#ea4335' }}>
                            <HangupIcon />
                            {user.role === 'mentor' ? 'End call' : 'Leave call'}
                        </button>
                    </div>

                    {/* Right — panels */}
                    <div className="hidden sm:flex items-center gap-2 min-w-[100px] justify-end">
                        <PanelBtn active={sidePanel === 'people'} onClick={() => setSidePanel(p => p === 'people' ? null : 'people')}
                            icon={<PeopleIcon />} label="People" badge={waiting.length} />
                        <PanelBtn active={sidePanel === 'chat'} onClick={() => setSidePanel(p => p === 'chat' ? null : 'chat')}
                            icon={<ChatIcon />} label="Chat" />
                    </div>
                </div>
            </div>

            {/* Side panel */}
            {sidePanel && (
                <div className="w-80 shrink-0 flex flex-col" style={{ background: '#292b2f', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <span className="text-white font-medium text-[15px]">{sidePanel === 'people' ? 'People' : 'In-call messages'}</span>
                        <button onClick={() => setSidePanel(null)} className="text-white/40 hover:text-white text-xl leading-none">✕</button>
                    </div>

                    {sidePanel === 'people' && (
                        <div className="flex-1 overflow-y-auto p-3">
                            {/* Waiting room — mentor only */}
                            {user.role === 'mentor' && waiting.length > 0 && (
                                <div className="mb-4">
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400 mb-2 px-1">Waiting to join ({waiting.length})</p>
                                    {waiting.map(w => (
                                        <div key={w.socketId} className="flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1" style={{ background: 'rgba(251,188,4,0.08)', border: '1px solid rgba(251,188,4,0.2)' }}>
                                            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ background: '#0891b2' }}>{w.name.charAt(0).toUpperCase()}</div>
                                            <span className="flex-1 text-white text-[13px] truncate">{w.name}</span>
                                            <button onClick={() => admitUser(w.socketId, w.userId)} className="text-[12px] px-3 py-1 rounded-full text-white font-medium transition-all" style={{ background: '#1a73e8' }}>Admit</button>
                                            <button onClick={() => denyUser(w.socketId)} className="text-[12px] px-2 py-1 rounded-full text-red-400 hover:bg-red-500/10 transition-all">✕</button>
                                        </div>
                                    ))}
                                    <div className="my-3" style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
                                </div>
                            )}
                            {/* In-call */}
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/30 mb-2 px-1">In call ({participants.length})</p>
                            {participants.length === 0 && <p className="text-white/30 text-[13px] text-center py-6">No one else in the call</p>}
                            {participants.map(p => (
                                <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl group mb-1" style={{ background: 'rgba(255,255,255,0.04)' }}>
                                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                                        style={{ background: p.role === 'mentor' ? '#7c3aed' : '#0891b2' }}>
                                        {p.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white text-[13px] truncate">{p.name}{p.id === user.id ? ' (You)' : ''}</p>
                                        <p className="text-white/40 text-[11px] capitalize">{p.role}</p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {!p.micOn && <span className="text-red-400 text-xs">🔇</span>}
                                        {user.role === 'mentor' && p.id !== user.id && (
                                            <div className="hidden group-hover:flex items-center gap-1">
                                                <button onClick={() => setPermission(p.id, 'mic', !p.micOn)} title="Toggle mic" className="w-7 h-7 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10"><MicOffIcon /></button>
                                                <button onClick={() => setPermission(p.id, 'screen', true)} title="Allow screen" className="w-7 h-7 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10"><ScreenIcon /></button>
                                                <button onClick={() => removeUser(p.id)} title="Remove" className="w-7 h-7 rounded-full flex items-center justify-center text-red-400/70 hover:text-red-400 hover:bg-red-500/10 text-xs">✕</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {sidePanel === 'chat' && <InCallChat socket={socket} sessionId={sessionId} userName={user.name} />}
                </div>
            )}

            {/* End call modal */}
            {showEndModal && (
                <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }} onClick={() => setShowEndModal(false)}>
                    <div className="w-full max-w-sm mx-4 rounded-2xl overflow-hidden" style={{ background: '#292b2f', border: '1px solid rgba(255,255,255,0.1)' }} onClick={e => e.stopPropagation()}>
                        <div className="px-6 pt-6 pb-4 text-center">
                            <h3 className="text-white text-[17px] font-semibold">Leave or end the call?</h3>
                            <p className="text-white/40 text-[13px] mt-2">You can leave and keep the session open, or end it for everyone.</p>
                        </div>
                        <div className="px-4 pb-4 flex flex-col gap-2">
                            <button onClick={handleEndCallOnly} className="w-full py-3 rounded-full text-[14px] font-medium text-white transition-all hover:opacity-90" style={{ background: '#1a73e8' }}>
                                Leave call (keep session open)
                            </button>
                            <button onClick={handleEndSession} className="w-full py-3 rounded-full text-[14px] font-medium text-red-400 transition-all hover:bg-red-500/10" style={{ border: '1px solid rgba(234,67,53,0.4)' }}>
                                End session for everyone
                            </button>
                            <button onClick={() => setShowEndModal(false)} className="w-full py-2.5 text-[13px] text-white/40 hover:text-white/70 transition-colors">Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toasts */}
            <div className="absolute top-4 right-4 flex flex-col gap-2 z-50 pointer-events-none">
                {toasts.map(t => (
                    <div key={t.id} className="px-4 py-2.5 rounded-xl text-[13px] text-white shadow-xl"
                        style={{ background: t.type === 'warn' ? 'rgba(234,67,53,0.9)' : t.type === 'success' ? 'rgba(52,168,83,0.9)' : 'rgba(41,43,47,0.95)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                        {t.msg}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── In-call chat ──────────────────────────────────────────────────────────────
function InCallChat({ socket, sessionId, userName }: { socket: Socket; sessionId: string; userName: string }) {
    const [msgs, setMsgs] = useState<{ name: string; text: string; mine: boolean }[]>([]);
    const [input, setInput] = useState('');
    const bottomRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        socket.on('incall-message', ({ name, text }: { name: string; text: string }) => setMsgs(p => [...p, { name, text, mine: false }]));
        return () => { socket.off('incall-message'); };
    }, [socket]);
    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);
    function send(e: React.FormEvent) {
        e.preventDefault(); if (!input.trim()) return;
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
                        <div className="px-3 py-2 rounded-2xl text-[13px] max-w-[88%] break-words text-white"
                            style={{ background: m.mine ? '#1a73e8' : 'rgba(255,255,255,0.08)', borderRadius: m.mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px' }}>
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
                    <button type="submit" disabled={!input.trim()} className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30" style={{ background: '#1a73e8' }}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 10V2M2 6l4-4 4 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                </div>
            </form>
        </div>
    );
}

// ── UI Components ─────────────────────────────────────────────────────────────
function CtrlBtn({ active, onClick, icon, label, activeColor, locked }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; activeColor?: string; locked?: boolean; }) {
    return (
        <div className="flex flex-col items-center gap-1.5">
            <button onClick={onClick} className="w-12 h-12 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 relative"
                style={{ background: activeColor ?? (active ? 'rgba(255,255,255,0.15)' : '#ea4335'), opacity: locked ? 0.5 : 1 }}>
                <span className="text-white">{icon}</span>
                {locked && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-[8px] text-white">🔒</span>}
            </button>
            <span className="text-[10px] text-white/50">{label}</span>
        </div>
    );
}
function PanelBtn({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: number }) {
    return (
        <div className="flex flex-col items-center gap-1.5 relative">
            <button onClick={onClick} className="w-11 h-11 rounded-full flex items-center justify-center transition-all hover:scale-110"
                style={{ background: active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)' }}>
                <span className="text-white">{icon}</span>
            </button>
            {badge && badge > 0 ? <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 text-[9px] font-bold text-black flex items-center justify-center">{badge}</span> : null}
            <span className="text-[10px] text-white/50">{label}</span>
        </div>
    );
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function MicIcon() { return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="6" y="1" width="6" height="9" rx="3" stroke="white" strokeWidth="1.6" /><path d="M3 9a6 6 0 0 0 12 0M9 15v2" stroke="white" strokeWidth="1.6" strokeLinecap="round" /></svg>; }
function MicOffIcon() { return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="6" y="1" width="6" height="9" rx="3" stroke="white" strokeWidth="1.6" /><path d="M3 9a6 6 0 0 0 12 0M9 15v2M2 2l14 14" stroke="white" strokeWidth="1.6" strokeLinecap="round" /></svg>; }
function CamIcon() { return <svg width="20" height="18" viewBox="0 0 20 18" fill="none"><rect x="1" y="4" width="12" height="10" rx="2" stroke="white" strokeWidth="1.6" /><path d="M13 8l6-3v8l-6-3V8z" stroke="white" strokeWidth="1.6" strokeLinejoin="round" /></svg>; }
function CamOffIcon() { return <svg width="20" height="18" viewBox="0 0 20 18" fill="none"><rect x="1" y="4" width="12" height="10" rx="2" stroke="white" strokeWidth="1.6" /><path d="M13 8l6-3v8l-6-3V8zM1 1l18 16" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function HangupIcon() { return <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M2 13c0-5.523 3.582-10 8-10s8 4.477 8 10" stroke="white" strokeWidth="1.8" strokeLinecap="round" /><rect x="6" y="12" width="8" height="4" rx="2" fill="white" /></svg>; }
function HandIcon() { return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 1v8M6 3v6M3 5v4a6 6 0 0 0 12 0V5M12 3v6" stroke="white" strokeWidth="1.6" strokeLinecap="round" /></svg>; }
function PeopleIcon() { return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="7" cy="6" r="3" stroke="white" strokeWidth="1.5" /><path d="M1 16c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" /><path d="M13 8a3 3 0 1 0 0-6M17 16c0-2.761-1.79-5.1-4.25-5.83" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>; }
function ChatIcon() { return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6l-4 3V3z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" /></svg>; }
function ScreenIcon() { return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="1" y="2" width="16" height="11" rx="2" stroke="white" strokeWidth="1.6" /><path d="M6 16h6M9 13v3" stroke="white" strokeWidth="1.6" strokeLinecap="round" /><path d="M6 9l3-3 3 3M9 6v5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function FsIcon() { return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function ExitFsIcon() { return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 1v4H1M13 5H9V1M9 13v-4h4M1 9h4v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>; }


