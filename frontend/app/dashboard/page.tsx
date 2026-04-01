'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, logout, User } from '@/lib/auth';
import { api } from '@/lib/api';
import Link from 'next/link';
import Footer from '@/components/Footer';

interface Session {
    id: string;
    title: string;
    status: 'waiting' | 'active' | 'ended';
    language: string;
    mentor_name: string;
    student_name: string;
    created_at: string;
}

const LANGUAGES = ['javascript', 'typescript', 'python', 'java', 'cpp', 'go', 'rust'];

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
    active: { bg: 'rgba(16,185,129,0.1)', text: '#6ee7b7', dot: '#10b981' },
    waiting: { bg: 'rgba(245,158,11,0.1)', text: '#fcd34d', dot: '#f59e0b' },
    ended: { bg: 'rgba(107,114,128,0.1)', text: '#9ca3af', dot: '#6b7280' },
};

const LANG_ICONS: Record<string, string> = {
    javascript: 'JS', typescript: 'TS', python: 'PY',
    java: 'JV', cpp: 'C++', go: 'GO', rust: 'RS',
};

export default function Dashboard() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [title, setTitle] = useState('');
    const [language, setLanguage] = useState('javascript');
    const [joinId, setJoinId] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        getUser().then(u => {
            if (!u) { router.push('/auth/login'); return; }
            setUser(u);
            api.getMySessions().then(setSessions).catch(() => { });
        });
    }, [router]);

    async function createSession() {
        if (!title.trim()) return;
        setLoading(true); setError('');
        try {
            const session = await api.createSession({ title, language });
            router.push(`/session/${session.id}`);
        } catch (err: any) {
            setError(err.message);
        } finally { setLoading(false); }
    }

    async function joinSession() {
        const id = joinId.trim().replace(/.*\/session\//, '');
        if (!id) return;
        setLoading(true); setError('');
        try {
            await api.joinSession(id);
            router.push(`/session/${id}`);
        } catch (err: any) {
            setError(err.message);
        } finally { setLoading(false); }
    }

    if (!user) return (
        <div className="min-h-screen flex items-center justify-center">
            <svg className="animate-spin w-6 h-6 text-violet-400" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
        </div>
    );

    const activeSessions = sessions.filter(s => s.status !== 'ended');
    const pastSessions = sessions.filter(s => s.status === 'ended');

    return (
        <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
            {/* Topbar */}
            <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-xs font-black">M</div>
                        <span className="font-bold text-[15px]">MentorSpace</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-[11px] font-bold">
                                {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="hidden sm:block">
                                <p className="text-[13px] font-medium leading-none">{user.name}</p>
                                <p className="text-[11px] text-[var(--muted)] capitalize mt-0.5">{user.role}</p>
                            </div>
                        </div>
                        <button onClick={async () => { await logout(); router.push('/'); }}
                            className="text-[13px] text-[var(--muted)] hover:text-white transition-colors px-3 py-1.5 rounded-lg"
                            style={{ border: '1px solid var(--border)' }}>
                            Sign out
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-6 py-8">
                {/* Welcome */}
                <div className="mb-8">
                    <h1 className="text-2xl font-bold">
                        Good day, {user.name.split(' ')[0]} 👋
                    </h1>
                    <p className="text-[var(--muted)] text-[14px] mt-1">
                        {user.role === 'mentor'
                            ? 'Create a session and share the link with your student.'
                            : 'Paste a session link from your mentor to join.'}
                    </p>
                </div>

                {/* Action card */}
                <div className="grid md:grid-cols-2 gap-4 mb-10">
                    {user.role === 'mentor' ? (
                        <div className="rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                            <div className="flex items-center gap-2 mb-5">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                                    style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)' }}>
                                    ✦
                                </div>
                                <h2 className="font-semibold text-[15px]">New Session</h2>
                            </div>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[12px] text-[var(--muted)] mb-1.5">Session title</label>
                                    <input
                                        placeholder="e.g. React Hooks Deep Dive"
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && createSession()}
                                        className="w-full px-3.5 py-2.5 rounded-xl text-[14px] outline-none transition-all"
                                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                                        onFocus={e => (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.6)')}
                                        onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[12px] text-[var(--muted)] mb-1.5">Language</label>
                                    <select
                                        value={language}
                                        onChange={e => setLanguage(e.target.value)}
                                        className="w-full px-3.5 py-2.5 rounded-xl text-[14px] outline-none transition-all"
                                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                                        {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                </div>
                                {error && <p className="text-red-400 text-[13px]">{error}</p>}
                                <button onClick={createSession} disabled={loading || !title.trim()}
                                    className="w-full py-2.5 rounded-xl font-semibold text-[14px] transition-all disabled:opacity-40"
                                    style={{ background: 'var(--violet)' }}
                                    onMouseEnter={e => (e.currentTarget.style.background = '#6d28d9')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--violet)')}>
                                    {loading ? 'Creating...' : 'Create Session →'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                            <div className="flex items-center gap-2 mb-5">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                                    style={{ background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.3)' }}>
                                    🎓
                                </div>
                                <div>
                                    <h2 className="font-semibold text-[15px]">Join a Session</h2>
                                    <p className="text-[11px] text-[var(--muted)]">Paste a link from your mentor</p>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[12px] text-[var(--muted)] mb-1.5">Session link or ID</label>
                                    <input
                                        placeholder="https://... or session ID"
                                        value={joinId}
                                        onChange={e => setJoinId(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && joinSession()}
                                        className="w-full px-3.5 py-2.5 rounded-xl text-[14px] outline-none transition-all"
                                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                                        onFocus={e => (e.currentTarget.style.borderColor = 'rgba(6,182,212,0.6)')}
                                        onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                                    />
                                </div>
                                {error && <p className="text-red-400 text-[13px]">{error}</p>}
                                <button onClick={joinSession} disabled={loading || !joinId.trim()}
                                    className="w-full py-2.5 rounded-xl font-semibold text-[14px] transition-all disabled:opacity-40"
                                    style={{ background: '#0891b2' }}
                                    onMouseEnter={e => (e.currentTarget.style.background = '#0e7490')}
                                    onMouseLeave={e => (e.currentTarget.style.background = '#0891b2')}>
                                    {loading ? 'Joining...' : 'Join Session →'}
                                </button>
                            </div>
                            {/* Active sessions student can rejoin */}
                            {activeSessions.length > 0 && (
                                <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
                                    <p className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">Your active sessions</p>
                                    <div className="space-y-2">
                                        {activeSessions.map(s => (
                                            <button key={s.id} onClick={() => router.push(`/session/${s.id}`)}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
                                                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                                                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(6,182,212,0.4)')}
                                                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                                                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0"
                                                    style={{ background: 'rgba(6,182,212,0.1)', color: '#67e8f9', border: '1px solid rgba(6,182,212,0.2)' }}>
                                                    {LANG_ICONS[s.language] || s.language.slice(0, 2).toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[13px] font-medium truncate">{s.title}</p>
                                                    <p className="text-[11px] text-[var(--muted)]">with {s.mentor_name}</p>
                                                </div>
                                                <span className="text-[11px] text-cyan-400">Rejoin →</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Quick stats */}
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { label: 'Total sessions', value: sessions.length, icon: '📋' },
                            { label: 'Active now', value: activeSessions.filter(s => s.status === 'active').length, icon: '🟢' },
                            { label: 'Waiting', value: activeSessions.filter(s => s.status === 'waiting').length, icon: '⏳' },
                            { label: 'Completed', value: pastSessions.length, icon: '✅' },
                        ].map(stat => (
                            <div key={stat.label} className="rounded-2xl p-4 flex flex-col justify-between"
                                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                                <span className="text-xl mb-2">{stat.icon}</span>
                                <div>
                                    <p className="text-2xl font-black">{stat.value}</p>
                                    <p className="text-[12px] text-[var(--muted)] mt-0.5">{stat.label}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Sessions list */}
                <div>
                    <h2 className="text-[15px] font-semibold mb-4 flex items-center gap-2">
                        My Sessions
                        {sessions.length > 0 && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full text-[var(--muted)]"
                                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                                {sessions.length}
                            </span>
                        )}
                    </h2>

                    {sessions.length === 0 ? (
                        <div className="rounded-2xl py-16 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                            <p className="text-3xl mb-3">📭</p>
                            <p className="text-[var(--muted)] text-[14px]">No sessions yet. {user.role === 'mentor' ? 'Create one above.' : 'Join one above.'}</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {sessions.map(s => {
                                const st = STATUS_STYLES[s.status] || STATUS_STYLES.ended;
                                return (
                                    <Link key={s.id} href={`/session/${s.id}`}
                                        className="flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-150 group"
                                        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                                        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-hover)')}
                                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                                        {/* Lang badge */}
                                        <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-[11px] font-black"
                                            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                                            {LANG_ICONS[s.language] || s.language.slice(0, 2).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-[14px] truncate">{s.title}</p>
                                            <p className="text-[12px] text-[var(--muted)] mt-0.5 truncate">
                                                {s.mentor_name} → {s.student_name || 'waiting for student'}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <span className="flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full"
                                                style={{ background: st.bg, color: st.text }}>
                                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />
                                                {s.status}
                                            </span>
                                            <svg className="w-4 h-4 text-[var(--muted)] group-hover:text-white transition-colors" viewBox="0 0 16 16" fill="none">
                                                <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>
            </main>
            <Footer />
        </div>
    );
}
