'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getUser, User } from '@/lib/auth';
import { api } from '@/lib/api';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { Socket } from 'socket.io-client';
import ChatPanel from '@/components/ChatPanel';
import VideoPanel from '@/components/VideoPanel';
import FileExplorer, { FileNode } from '@/components/FileExplorer';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

// ── Language detection from file extension ────────────────────────────────────
const EXT_LANG: Record<string, string> = {
    js: 'javascript', ts: 'typescript', tsx: 'typescript', jsx: 'javascript',
    py: 'python', java: 'java', cpp: 'cpp', c: 'c', go: 'go', rs: 'rust',
    html: 'html', css: 'css', json: 'json', md: 'markdown', txt: 'plaintext',
};
function langFromName(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    return EXT_LANG[ext] ?? 'plaintext';
}

// ── Default starter files ─────────────────────────────────────────────────────
const DEFAULT_CONTENT: Record<string, string> = {
    javascript: '// Write your code here\nconsole.log("Hello, World!");',
    typescript: 'const greet = (name: string): string => `Hello, ${name}!`;\nconsole.log(greet("World"));',
    python: '# Write your code here\nprint("Hello, World!")',
    java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}',
    cpp: '#include <iostream>\nusing namespace std;\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}',
    go: 'package main\nimport "fmt"\nfunc main() {\n    fmt.Println("Hello, World!")\n}',
    rust: 'fn main() {\n    println!("Hello, World!");\n}',
};

function makeId() { return Math.random().toString(36).slice(2, 10); }

// ── localStorage persistence ──────────────────────────────────────────────────
function saveTree(sessionId: string, tree: FileNode[]) {
    try { localStorage.setItem(`fs_tree_${sessionId}`, JSON.stringify(tree)); } catch { }
}
function loadTree(sessionId: string): FileNode[] | null {
    try {
        const raw = localStorage.getItem(`fs_tree_${sessionId}`);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function buildDefaultTree(language: string): FileNode[] {
    const ext = Object.entries(EXT_LANG).find(([, v]) => v === language)?.[0] ?? 'js';
    return [{
        id: makeId(), name: 'main.' + ext, type: 'file',
        language, content: DEFAULT_CONTENT[language] ?? '// start coding',
        parentId: null,
    }];
}

// ── Flatten tree helpers ──────────────────────────────────────────────────────
function findNode(tree: FileNode[], id: string): FileNode | null {
    for (const n of tree) {
        if (n.id === id) return n;
        if (n.children) { const f = findNode(n.children, id); if (f) return f; }
    }
    return null;
}
function updateNode(tree: FileNode[], id: string, patch: Partial<FileNode>): FileNode[] {
    return tree.map(n => {
        if (n.id === id) return { ...n, ...patch };
        if (n.children) return { ...n, children: updateNode(n.children, id, patch) };
        return n;
    });
}
function deleteNode(tree: FileNode[], id: string): FileNode[] {
    return tree.filter(n => n.id !== id).map(n =>
        n.children ? { ...n, children: deleteNode(n.children, id) } : n
    );
}
function insertNode(tree: FileNode[], parentId: string | null, node: FileNode): FileNode[] {
    if (!parentId) return [...tree, node];
    return tree.map(n => {
        if (n.id === parentId) return { ...n, children: [...(n.children ?? []), node] };
        if (n.children) return { ...n, children: insertNode(n.children, parentId, node) };
        return n;
    });
}
function findFirstFile(tree: FileNode[]): FileNode | null {
    for (const n of tree) {
        if (n.type === 'file') return n;
        if (n.children) { const f = findFirstFile(n.children); if (f) return f; }
    }
    return null;
}

interface Message { id: string; content: string; user_name: string; user_role: string; created_at: string; user_id: string; }
interface Session { id: string; title: string; status: string; language: string; mentor_id: string; student_id: string; mentor_name: string; student_name: string; }
type RunStatus = 'idle' | 'running' | 'done' | 'error';

export default function SessionPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [activeTab, setActiveTab] = useState<'editor' | 'video'>('editor');
    const [peerJoined, setPeerJoined] = useState(false);
    const [sessionEnded, setSessionEnded] = useState(false);
    const [copied, setCopied] = useState(false);
    const [peerInfo, setPeerInfo] = useState<{ name: string; role: string }>({ name: '', role: '' });
    const [mentorInCall, setMentorInCall] = useState(false);

    // ── File system state ─────────────────────────────────────────────────
    const [tree, setTree] = useState<FileNode[]>([]);
    const [openTabs, setOpenTabs] = useState<FileNode[]>([]);
    const [activeFileId, setActiveFileId] = useState<string | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileChatOpen, setMobileChatOpen] = useState(false);

    // ── Run code state ────────────────────────────────────────────────────
    const [output, setOutput] = useState('');
    const [runStatus, setRunStatus] = useState<RunStatus>('idle');
    const [outputOpen, setOutputOpen] = useState(false);

    const socketRef = useRef<Socket | null>(null);
    const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const activeFileIdRef = useRef<string | null>(null);

    // Keep ref in sync so throttle closure never captures stale activeFileId
    useEffect(() => { activeFileIdRef.current = activeFileId; }, [activeFileId]);

    const activeFile = activeFileId ? findNode(tree, activeFileId) ?? openTabs.find(t => t.id === activeFileId) ?? null : null;
    const language = activeFile?.language ?? 'plaintext';
    // Always read content from tree (source of truth), not openTabs
    const code = (activeFileId ? findNode(tree, activeFileId)?.content : undefined) ?? '';

    useEffect(() => {
        let mounted = true;
        async function init() {
            const u = await getUser();
            if (!u) { router.push('/auth/login'); return; }
            if (!mounted) return;
            setUser(u);
            try {
                const [s, msgs] = await Promise.all([api.getSession(id), api.getMessages(id)]);
                if (!mounted) return;
                setSession(s);
                setMessages(msgs);
                if (s.status === 'ended') setSessionEnded(true);
                // Load persisted tree or build default
                const saved = loadTree(id);
                const initialTree = saved ?? buildDefaultTree(s.language);
                if (!saved) saveTree(id, initialTree);
                setTree(initialTree);
                // Restore open tabs — reopen first file
                const firstFile = initialTree.find(n => n.type === 'file') ?? findFirstFile(initialTree);
                if (firstFile) { setOpenTabs([firstFile]); setActiveFileId(firstFile.id); }
            } catch { router.push('/dashboard'); return; }

            const socket = await getSocket();
            if (!mounted) return;
            socketRef.current = socket;
            socket.connect();
            socket.emit('join-session', id);

            socket.on('fs-tree', ({ tree: t }: { tree: FileNode[] }) => {
                setTree(t);
                saveTree(id, t);
                // Auto-open first file for student
                const first = findFirstFile(t);
                if (first) {
                    setOpenTabs([first]);
                    setActiveFileId(first.id);
                }
            });
            socket.on('fs-file-update', ({ fileId, content }: { fileId: string; content: string }) => {
                setTree(prev => {
                    const next = updateNode(prev, fileId, { content });
                    saveTree(id, next);
                    return next;
                });
                // Also update openTabs so the tab reflects latest content
                setOpenTabs(prev => prev.map(f => f.id === fileId ? { ...f, content } : f));
                // Force re-render of editor if this is the active file
                setActiveFileId(prev => prev === fileId ? fileId : prev);
            });
            socket.on('fs-create', ({ parentId, node }: { parentId: string | null; node: FileNode }) => {
                setTree(prev => {
                    const next = insertNode(prev, parentId, node);
                    saveTree(id, next);
                    return next;
                });
            });
            socket.on('fs-rename', ({ id: nid, name }: { id: string; name: string }) => {
                setTree(prev => {
                    const next = updateNode(prev, nid, { name, language: langFromName(name) });
                    saveTree(id, next);
                    return next;
                });
                setOpenTabs(prev => prev.map(f => f.id === nid ? { ...f, name, language: langFromName(name) } : f));
            });
            socket.on('fs-delete', ({ id: nid }: { id: string }) => {
                setTree(prev => {
                    const next = deleteNode(prev, nid);
                    saveTree(id, next);
                    return next;
                });
                setOpenTabs(prev => prev.filter(f => f.id !== nid));
                setActiveFileId(prev => prev === nid ? null : prev);
            });
            socket.on('fs-open-file', ({ fileId }: { fileId: string }) => {
                setTree(prev => {
                    const node = findNode(prev, fileId);
                    if (node) {
                        setOpenTabs(tabs => tabs.find(t => t.id === fileId) ? tabs : [...tabs, node]);
                        setActiveFileId(fileId);
                    }
                    return prev;
                });
            });

            socket.on('new-message', (msg: Message) => setMessages(prev => [...prev, msg]));
            socket.on('user-joined', ({ name, role }: { userId: string; name: string; role: string }) => {
                setPeerJoined(true); setPeerInfo({ name, role });
                // Send current tree to new joiner
                if (u.role === 'mentor') {
                    setTree(prev => { socket.emit('fs-sync', { sessionId: id, tree: prev }); return prev; });
                }
            });
            socket.on('user-left', () => { setPeerJoined(false); setPeerInfo({ name: '', role: '' }); });
            socket.on('session-ended', () => setSessionEnded(true));
            socket.on('mentor-in-call', () => setMentorInCall(true));
            socket.on('mentor-left-call', () => setMentorInCall(false));
        }
        init();
        return () => {
            mounted = false;
            ['fs-tree', 'fs-file-update', 'fs-create', 'fs-rename', 'fs-delete', 'fs-open-file',
                'new-message', 'user-joined', 'user-left', 'session-ended',
                'mentor-in-call', 'mentor-left-call'].forEach(e => socketRef.current?.off(e));
            disconnectSocket();
        };
    }, [id, router]);

    // ── Code change (mentor only) ─────────────────────────────────────────
    const handleCodeChange = useCallback((value: string | undefined) => {
        const v = value ?? '';
        const fid = activeFileIdRef.current;
        if (!fid) return;
        setTree(prev => {
            const next = updateNode(prev, fid, { content: v });
            saveTree(id, next);
            return next;
        });
        setOpenTabs(prev => prev.map(f => f.id === fid ? { ...f, content: v } : f));
        if (throttleRef.current) clearTimeout(throttleRef.current);
        throttleRef.current = setTimeout(() => {
            socketRef.current?.emit('fs-file-update', { sessionId: id, fileId: fid, content: v });
        }, 120);
    }, [id]);

    // ── File explorer operations (mentor only) ────────────────────────────
    function handleFileSelect(file: FileNode) {
        setActiveFileId(file.id);
        if (!openTabs.find(t => t.id === file.id)) setOpenTabs(prev => [...prev, file]);
        // Tell student which file is open
        socketRef.current?.emit('fs-open-file', { sessionId: id, fileId: file.id });
    }

    function handleCreateFile(parentId: string | null, name: string) {
        const lang = langFromName(name);
        // New files start empty — no boilerplate
        const node: FileNode = { id: makeId(), name, type: 'file', language: lang, content: '', parentId };
        setTree(prev => {
            const next = insertNode(prev, parentId, node);
            saveTree(id, next);
            return next;
        });
        setOpenTabs(prev => [...prev, node]);
        setActiveFileId(node.id);
        socketRef.current?.emit('fs-create', { sessionId: id, parentId, node });
    }

    function handleCreateFolder(parentId: string | null, name: string) {
        const node: FileNode = { id: makeId(), name, type: 'folder', children: [], parentId };
        setTree(prev => {
            const next = insertNode(prev, parentId, node);
            saveTree(id, next);
            return next;
        });
        socketRef.current?.emit('fs-create', { sessionId: id, parentId, node });
    }

    function handleRename(nodeId: string, newName: string) {
        const lang = langFromName(newName);
        setTree(prev => {
            const next = updateNode(prev, nodeId, { name: newName, language: lang });
            saveTree(id, next);
            return next;
        });
        setOpenTabs(prev => prev.map(f => f.id === nodeId ? { ...f, name: newName, language: lang } : f));
        socketRef.current?.emit('fs-rename', { sessionId: id, id: nodeId, name: newName });
    }

    function handleDelete(nodeId: string) {
        setTree(prev => {
            const next = deleteNode(prev, nodeId);
            saveTree(id, next);
            return next;
        });
        setOpenTabs(prev => prev.filter(f => f.id !== nodeId));
        if (activeFileId === nodeId) setActiveFileId(openTabs.find(f => f.id !== nodeId)?.id ?? null);
        socketRef.current?.emit('fs-delete', { sessionId: id, id: nodeId });
    }

    function closeTab(fileId: string, e: React.MouseEvent) {
        e.stopPropagation();
        const remaining = openTabs.filter(f => f.id !== fileId);
        setOpenTabs(remaining);
        if (activeFileId === fileId) setActiveFileId(remaining[remaining.length - 1]?.id ?? null);
    }

    const handleEndSession = async () => {
        await api.endSession(id);
        socketRef.current?.emit('end-session', id);
        setSessionEnded(true);
    };

    const copyLink = () => {
        navigator.clipboard.writeText(`${window.location.origin}/session/${id}`);
        setCopied(true); setTimeout(() => setCopied(false), 2000);
    };

    const runCode = async () => {
        if (!activeFile) return;
        setRunStatus('running'); setOutputOpen(true); setOutput('');
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/run`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ language: activeFile.language, code: activeFile.content }),
            });
            const result = await res.json();
            if (!res.ok) { setOutput(result.error ?? 'Unknown error'); setRunStatus('error'); return; }
            if (result.stderr) { setOutput(result.stderr); setRunStatus('error'); }
            else { setOutput(result.stdout || '(no output)'); setRunStatus('done'); }
        } catch (err: any) { setOutput(`Network error: ${err.message}`); setRunStatus('error'); }
    };

    if (!user || !session) return (
        <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--bg)' }}>
            <svg className="animate-spin w-5 h-5 text-violet-400" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
        </div>
    );

    if (sessionEnded) return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-5" style={{ background: 'var(--bg)' }}>
            <div className="text-5xl">🏁</div>
            <h2 className="text-2xl font-bold">Session Ended</h2>
            <p className="text-[14px]" style={{ color: 'var(--muted)' }}>
                {user?.role === 'mentor' ? 'You ended this session.' : 'This session has been closed by the mentor.'}
            </p>
            <button onClick={() => router.push('/dashboard')} className="px-6 py-2.5 rounded-xl font-semibold text-[14px]" style={{ background: 'var(--violet)' }}>
                Back to Dashboard
            </button>
        </div>
    );

    return (
        <div className="flex flex-col h-screen relative" style={{ background: '#0d1117' }}>

            {/* ── Title bar (VS Code style) ─────────────────────────────── */}
            <div className="flex items-center justify-between px-3 h-10 shrink-0"
                style={{ background: '#161b22', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {/* Left */}
                <div className="flex items-center gap-2 min-w-0">
                    <button onClick={() => router.push('/dashboard')}
                        className="w-6 h-6 rounded flex items-center justify-center transition-colors shrink-0"
                        style={{ color: '#7d8590' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'white')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#7d8590')}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M7 1L3 5l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                    <button onClick={() => setSidebarOpen(p => !p)}
                        className="w-6 h-6 rounded flex items-center justify-center transition-colors shrink-0"
                        style={{ color: sidebarOpen ? '#a78bfa' : '#7d8590' }}
                        title="Toggle Explorer">
                        <ExplorerIcon />
                    </button>
                    <span className="text-[13px] font-semibold truncate" style={{ color: '#c9d1d9' }}>{session.title}</span>
                    <span className="shrink-0 hidden sm:flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full"
                        style={{ background: peerJoined ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', color: peerJoined ? '#6ee7b7' : '#fcd34d', border: `1px solid ${peerJoined ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}` }}>
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: peerJoined ? '#10b981' : '#f59e0b' }} />
                        {peerJoined ? 'Connected' : 'Waiting'}
                    </span>
                </div>
                {/* Center — view tabs */}
                <div className="flex items-center gap-1">
                    {([{ key: 'editor', label: 'Editor' }, { key: 'video', label: 'Video' }] as const).map(tab => (
                        <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                            className="px-3 py-1 rounded text-[12px] font-medium transition-all"
                            style={{ background: activeTab === tab.key ? 'rgba(124,58,237,0.2)' : 'transparent', color: activeTab === tab.key ? '#a78bfa' : '#7d8590', border: activeTab === tab.key ? '1px solid rgba(124,58,237,0.35)' : '1px solid transparent' }}>
                            {tab.label}
                        </button>
                    ))}
                </div>
                {/* Right */}
                <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={copyLink}
                        className="flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-lg transition-all"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: copied ? '#6ee7b7' : '#7d8590' }}>
                        {copied ? '✓' : '⎘'} <span className="hidden sm:inline">{copied ? 'Copied' : 'Share'}</span>
                    </button>
                    {/* Mobile chat toggle */}
                    <button onClick={() => setMobileChatOpen(p => !p)}
                        className="md:hidden w-7 h-7 rounded flex items-center justify-center transition-colors"
                        style={{ color: mobileChatOpen ? '#a78bfa' : '#7d8590', background: mobileChatOpen ? 'rgba(124,58,237,0.15)' : 'transparent' }}
                        title="Toggle Chat">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 2h12v8H8l-3 2V10H1V2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
                    </button>
                    {user.role === 'mentor' && (
                        <button onClick={handleEndSession}
                            className="text-[12px] px-2.5 py-1 rounded-lg transition-all"
                            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.18)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}>
                            <span className="hidden sm:inline">End Session</span>
                            <span className="sm:hidden">End</span>
                        </button>
                    )}
                </div>
            </div>

            {/* ── Body ─────────────────────────────────────────────────── */}
            <div className="flex flex-1 overflow-hidden">

                {/* ── File Explorer sidebar ── */}
                {activeTab === 'editor' && sidebarOpen && (
                    <div className="w-44 sm:w-52 shrink-0 flex flex-col" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                        <FileExplorer
                            tree={tree}
                            activeFileId={activeFileId}
                            onFileSelect={handleFileSelect}
                            onCreateFile={handleCreateFile}
                            onCreateFolder={handleCreateFolder}
                            onRename={handleRename}
                            onDelete={handleDelete}
                            readOnly={user.role === 'student'}
                            sessionTitle={session.title}
                        />
                    </div>
                )}

                {/* ── Main editor area ── */}
                <div className="flex flex-col flex-1 overflow-hidden">
                    {activeTab === 'editor' ? (
                        <>
                            {/* Tab bar */}
                            <div className="flex items-center overflow-x-auto shrink-0"
                                style={{ background: '#0d1117', borderBottom: '1px solid rgba(255,255,255,0.06)', height: '35px' }}>
                                {openTabs.map(tab => {
                                    const isActive = tab.id === activeFileId;
                                    return (
                                        <div key={tab.id}
                                            className="flex items-center gap-1 px-3 h-full cursor-pointer shrink-0 group relative"
                                            style={{ background: isActive ? '#1e2430' : 'transparent', borderRight: '1px solid rgba(255,255,255,0.05)', borderBottom: isActive ? '1px solid #7c3aed' : '1px solid transparent', minWidth: 80, maxWidth: 160 }}
                                            onClick={() => { setActiveFileId(tab.id); socketRef.current?.emit('fs-open-file', { sessionId: id, fileId: tab.id }); }}>
                                            <span className="text-[11px] truncate flex-1" style={{ color: isActive ? '#c9d1d9' : '#7d8590' }}>{tab.name}</span>
                                            <button
                                                onClick={e => closeTab(tab.id, e)}
                                                className="w-4 h-4 rounded flex items-center justify-center shrink-0 transition-all text-[11px] leading-none"
                                                style={{ color: isActive ? '#7d8590' : 'transparent' }}
                                                onMouseEnter={e => { e.currentTarget.style.color = 'white'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                                                onMouseLeave={e => { e.currentTarget.style.color = isActive ? '#7d8590' : 'transparent'; e.currentTarget.style.background = 'transparent'; }}>
                                                ✕
                                            </button>
                                        </div>
                                    );
                                })}
                                {/* Run button in tab bar */}
                                <div className="ml-auto flex items-center gap-2 px-3 shrink-0">
                                    {(runStatus === 'done' || runStatus === 'error') && (
                                        <button onClick={() => setOutputOpen(o => !o)}
                                            className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded transition-all"
                                            style={{ color: runStatus === 'error' ? '#fca5a5' : '#6ee7b7', border: '1px solid rgba(255,255,255,0.08)' }}>
                                            ▸ Output
                                        </button>
                                    )}
                                    <button onClick={runCode} disabled={runStatus === 'running' || !activeFile}
                                        className="flex items-center gap-1.5 px-3 py-1 rounded text-[12px] font-semibold transition-all disabled:opacity-50"
                                        style={{ background: runStatus === 'running' ? 'rgba(124,58,237,0.3)' : 'linear-gradient(135deg,#7c3aed,#6d28d9)', color: 'white', boxShadow: runStatus !== 'running' ? '0 0 10px rgba(124,58,237,0.35)' : 'none' }}>
                                        {runStatus === 'running'
                                            ? <><svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" /><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg> Running</>
                                            : <>▶ Run</>}
                                    </button>
                                </div>
                            </div>

                            {/* Student read-only banner */}
                            {user.role === 'student' && (
                                <div className="flex items-center gap-2 px-4 py-1 text-[11px] shrink-0"
                                    style={{ background: 'rgba(6,182,212,0.06)', borderBottom: '1px solid rgba(6,182,212,0.12)', color: '#67e8f9' }}>
                                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="2" y="5" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.1" /><path d="M3 5V3.5a2 2 0 0 1 4 0V5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" /></svg>
                                    Read-only — mentor is driving
                                </div>
                            )}

                            {/* Monaco editor */}
                            <div className={`overflow-hidden ${outputOpen ? 'flex-[1_1_60%]' : 'flex-1'}`}>
                                {activeFile ? (
                                    <MonacoEditor
                                        key={activeFileId}
                                        height="100%"
                                        language={language}
                                        value={code}
                                        onChange={user.role === 'mentor' ? handleCodeChange : undefined}
                                        theme="vs-dark"
                                        options={{
                                            fontSize: 14,
                                            fontFamily: "'JetBrains Mono','Fira Code','Cascadia Code',monospace",
                                            fontLigatures: true,
                                            minimap: { enabled: false },
                                            scrollBeyondLastLine: false,
                                            wordWrap: 'on',
                                            padding: { top: 12, bottom: 12 },
                                            lineHeight: 1.75,
                                            renderLineHighlight: 'gutter',
                                            smoothScrolling: true,
                                            cursorBlinking: 'smooth',
                                            cursorSmoothCaretAnimation: 'on',
                                            bracketPairColorization: { enabled: true },
                                            guides: { bracketPairs: true },
                                            readOnly: user.role === 'student',
                                            domReadOnly: user.role === 'student',
                                        }}
                                    />
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: '#7d8590' }}>
                                        <svg width="48" height="48" viewBox="0 0 48 48" fill="none"><rect x="8" y="4" width="24" height="32" rx="3" stroke="currentColor" strokeWidth="2" /><path d="M32 4l8 8v28a3 3 0 0 1-3 3H11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M32 4v8h8" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
                                        <p className="text-[13px]">{user.role === 'mentor' ? 'Create or open a file to start' : 'Waiting for mentor to open a file'}</p>
                                    </div>
                                )}
                            </div>

                            {/* Output panel */}
                            {outputOpen && (
                                <div className="flex flex-col shrink-0" style={{ height: 200, background: '#0a0d14', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div className="flex items-center justify-between px-4 h-8 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: runStatus === 'error' ? '#fca5a5' : '#6ee7b7' }}>
                                                {runStatus === 'error' ? '✕ Error' : '✓ Output'}
                                            </span>
                                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: '#7d8590' }}>{language}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button onClick={() => { setOutput(''); setRunStatus('idle'); setOutputOpen(false); }} className="text-[11px] transition-colors" style={{ color: '#7d8590' }} onMouseEnter={e => (e.currentTarget.style.color = 'white')} onMouseLeave={e => (e.currentTarget.style.color = '#7d8590')}>Clear</button>
                                            <button onClick={() => setOutputOpen(false)} className="text-[13px] transition-colors" style={{ color: '#7d8590' }} onMouseEnter={e => (e.currentTarget.style.color = 'white')} onMouseLeave={e => (e.currentTarget.style.color = '#7d8590')}>✕</button>
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-auto p-4">
                                        <pre className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words" style={{ color: runStatus === 'error' ? '#fca5a5' : '#e6edf3' }}>
                                            {output || (runStatus === 'running' ? 'Running...' : '')}
                                        </pre>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        socketRef.current && (
                            <VideoPanel
                                sessionId={id} socket={socketRef.current} user={user}
                                peerName={peerInfo.name || (user.role === 'mentor' ? session.student_name : session.mentor_name) || ''}
                                peerRole={peerInfo.role || (user.role === 'mentor' ? 'student' : 'mentor')}
                                sessionTitle={session.title}
                                onLeave={() => setActiveTab('editor')}
                                onEndSession={handleEndSession}
                            />
                        )
                    )}
                </div>

                {/* ── Chat sidebar — hidden on mobile, visible md+ ── */}
                <div className="hidden md:flex w-56 lg:w-64 shrink-0 flex-col" style={{ borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
                    {socketRef.current && (
                        <ChatPanel sessionId={id} messages={messages} user={user} socket={socketRef.current} />
                    )}
                </div>
            </div>

            {/* ── Mobile chat overlay ── */}
            {mobileChatOpen && socketRef.current && (
                <div className="md:hidden absolute inset-x-0 bottom-6 z-40 flex flex-col" style={{ top: 40, background: 'var(--surface)' }}>
                    <ChatPanel sessionId={id} messages={messages} user={user} socket={socketRef.current} />
                </div>
            )}

            {/* ── Status bar (VS Code style) ─────────────────────────────── */}
            <div className="flex items-center justify-between px-4 h-6 shrink-0 text-[11px]"
                style={{ background: '#7c3aed', color: 'rgba(255,255,255,0.85)' }}>
                <div className="flex items-center gap-4">
                    <span className="capitalize">{user.role}</span>
                    {activeFile && <span>{activeFile.name}</span>}
                </div>
                <div className="flex items-center gap-4">
                    {activeFile && <span>{language}</span>}
                    <span>{peerJoined ? `● ${peerInfo.name || 'Peer'} connected` : '○ Waiting for peer'}</span>
                </div>
            </div>
        </div>
    );
}

function ExplorerIcon() {
    return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" /><rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" /><rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" /><rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" /></svg>;
}
