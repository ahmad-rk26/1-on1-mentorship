'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Footer from '@/components/Footer';

export default function ResetPasswordPage() {
    const router = useRouter();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [showCf, setShowCf] = useState(false);
    const [ready, setReady] = useState(false);

    // Supabase sends the user back with a session via the URL hash.
    // We need to wait for onAuthStateChange to pick up the RECOVERY event.
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') setReady(true);
        });
        // Also check if already in a session (user refreshed the page)
        supabase.auth.getSession().then(({ data }) => {
            if (data.session) setReady(true);
        });
        return () => subscription.unsubscribe();
    }, []);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');

        if (password.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        if (password !== confirm) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            setDone(true);
            // Auto-redirect to dashboard after 2.5s
            setTimeout(() => router.push('/dashboard'), 2500);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    const strength = getStrength(password);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-4 relative">
            <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(124,58,237,0.15) 0%, transparent 70%)' }} />

            <div className="w-full max-w-[380px] relative z-10 flex-1 flex flex-col justify-center py-12">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-2 justify-center mb-10">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-sm font-black">M</div>
                    <span className="font-bold text-[16px]">MentorSpace</span>
                </Link>

                <div className="rounded-2xl p-8" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

                    {done ? (
                        /* ── Success ── */
                        <div className="text-center py-2">
                            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
                                style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)' }}>
                                <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
                                    <path d="M5 13l5 5 11-11" stroke="#6ee7b7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </div>
                            <h1 className="text-xl font-bold mb-2">Password updated</h1>
                            <p className="text-[13px]" style={{ color: 'var(--muted)' }}>
                                Your password has been changed successfully. Redirecting to dashboard...
                            </p>
                            <div className="mt-4 h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                                <div className="h-full rounded-full bg-emerald-500 animate-[shrink_2.5s_linear_forwards]"
                                    style={{ width: '100%', animation: 'progress 2.5s linear forwards' }} />
                            </div>
                        </div>
                    ) : !ready ? (
                        /* ── Invalid / expired link ── */
                        <div className="text-center py-2">
                            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
                                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                    <path d="M12 9v4M12 17h.01" stroke="#fca5a5" strokeWidth="2" strokeLinecap="round" />
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="#fca5a5" strokeWidth="1.6" />
                                </svg>
                            </div>
                            <h1 className="text-xl font-bold mb-2">Invalid or expired link</h1>
                            <p className="text-[13px] mb-6" style={{ color: 'var(--muted)' }}>
                                This reset link is invalid or has expired. Please request a new one.
                            </p>
                            <Link href="/auth/forgot-password"
                                className="inline-block px-5 py-2.5 rounded-xl font-semibold text-[14px] transition-all"
                                style={{ background: 'var(--violet)' }}>
                                Request new link
                            </Link>
                        </div>
                    ) : (
                        /* ── Reset form ── */
                        <>
                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
                                style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)' }}>
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                    <rect x="3" y="9" width="14" height="10" rx="2" stroke="#a78bfa" strokeWidth="1.5" />
                                    <path d="M6 9V6a4 4 0 0 1 8 0v3" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" />
                                    <circle cx="10" cy="14" r="1.5" fill="#a78bfa" />
                                </svg>
                            </div>
                            <h1 className="text-xl font-bold mb-1">Set new password</h1>
                            <p className="text-[13px] mb-7" style={{ color: 'var(--muted)' }}>
                                Choose a strong password for your account.
                            </p>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                {/* New password */}
                                <div>
                                    <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--muted)' }}>
                                        New password
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showPw ? 'text' : 'password'}
                                            placeholder="Min. 6 characters"
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            className="w-full px-3.5 py-2.5 pr-10 rounded-xl text-[14px] outline-none transition-all"
                                            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                                            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.6)')}
                                            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                                            required
                                        />
                                        <button type="button" onClick={() => setShowPw(p => !p)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                                            style={{ color: 'var(--muted)' }}>
                                            {showPw ? <EyeOffIcon /> : <EyeIcon />}
                                        </button>
                                    </div>
                                    {/* Strength bar */}
                                    {password && (
                                        <div className="mt-2 space-y-1">
                                            <div className="flex gap-1">
                                                {[1, 2, 3, 4].map(i => (
                                                    <div key={i} className="flex-1 h-1 rounded-full transition-all duration-300"
                                                        style={{ background: i <= strength.score ? strength.color : 'var(--surface-2)' }} />
                                                ))}
                                            </div>
                                            <p className="text-[11px]" style={{ color: strength.color }}>{strength.label}</p>
                                        </div>
                                    )}
                                </div>

                                {/* Confirm password */}
                                <div>
                                    <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--muted)' }}>
                                        Confirm password
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showCf ? 'text' : 'password'}
                                            placeholder="Repeat your password"
                                            value={confirm}
                                            onChange={e => setConfirm(e.target.value)}
                                            className="w-full px-3.5 py-2.5 pr-10 rounded-xl text-[14px] outline-none transition-all"
                                            style={{
                                                background: 'var(--surface-2)',
                                                border: `1px solid ${confirm && confirm !== password ? 'rgba(239,68,68,0.5)' : confirm && confirm === password ? 'rgba(16,185,129,0.5)' : 'var(--border)'}`,
                                                color: 'var(--text)',
                                            }}
                                            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.6)')}
                                            onBlur={e => {
                                                if (confirm && confirm !== password) e.currentTarget.style.borderColor = 'rgba(239,68,68,0.5)';
                                                else if (confirm && confirm === password) e.currentTarget.style.borderColor = 'rgba(16,185,129,0.5)';
                                                else e.currentTarget.style.borderColor = 'var(--border)';
                                            }}
                                            required
                                        />
                                        <button type="button" onClick={() => setShowCf(p => !p)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                                            style={{ color: 'var(--muted)' }}>
                                            {showCf ? <EyeOffIcon /> : <EyeIcon />}
                                        </button>
                                    </div>
                                    {confirm && confirm === password && (
                                        <p className="text-[11px] mt-1.5 text-emerald-400 flex items-center gap-1">
                                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                            Passwords match
                                        </p>
                                    )}
                                </div>

                                {error && (
                                    <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl text-[13px] text-red-300"
                                        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                                        <span className="mt-0.5">⚠</span>
                                        <span>{error}</span>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full py-2.5 rounded-xl font-semibold text-[14px] transition-all disabled:opacity-50"
                                    style={{ background: 'var(--violet)', boxShadow: '0 0 0 1px rgba(124,58,237,0.4)' }}
                                    onMouseEnter={e => !loading && (e.currentTarget.style.background = '#6d28d9')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--violet)')}>
                                    {loading ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                                                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                                            </svg>
                                            Updating...
                                        </span>
                                    ) : 'Update password'}
                                </button>
                            </form>
                        </>
                    )}
                </div>

                {!done && (
                    <p className="text-center text-[13px] mt-5" style={{ color: 'var(--muted)' }}>
                        <Link href="/auth/login" className="text-violet-400 hover:text-violet-300 transition-colors font-medium">
                            ← Back to sign in
                        </Link>
                    </p>
                )}
            </div>
            <Footer />
        </div>
    );
}

// ── Password strength helper ───────────────────────────────────────────────────
function getStrength(pw: string): { score: number; label: string; color: string } {
    let score = 0;
    if (pw.length >= 6) score++;
    if (pw.length >= 10) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
    const map = [
        { label: 'Too weak', color: '#ef4444' },
        { label: 'Weak', color: '#f97316' },
        { label: 'Fair', color: '#eab308' },
        { label: 'Strong', color: '#22c55e' },
        { label: 'Very strong', color: '#10b981' },
    ];
    return { score, ...map[score] };
}

// ── Icons ──────────────────────────────────────────────────────────────────────
function EyeIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
        </svg>
    );
}
function EyeOffIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5zM1 1l14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
        </svg>
    );
}
