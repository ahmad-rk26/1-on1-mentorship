'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Footer from '@/components/Footer';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            // Always call resetPasswordForEmail — Supabase intentionally doesn't
            // reveal whether an email exists (security best practice).
            // We always show the success screen regardless.
            await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/auth/reset-password`,
            });
            setSent(true);
        } catch {
            // Still show success to avoid email enumeration
            setSent(true);
        } finally {
            setLoading(false);
        }
    }

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
                    {sent ? (
                        /* ── Success state ── */
                        <div className="text-center py-2">
                            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
                                style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                    <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" stroke="#6ee7b7" strokeWidth="1.6" />
                                    <path d="M2 6l10 7 10-7" stroke="#6ee7b7" strokeWidth="1.6" strokeLinecap="round" />
                                </svg>
                            </div>
                            <h1 className="text-xl font-bold mb-2">Check your email</h1>
                            <p className="text-[13px] mb-1" style={{ color: 'var(--muted)' }}>
                                We sent a reset link to
                            </p>
                            <p className="text-[14px] font-semibold text-violet-400 mb-5">{email}</p>
                            <p className="text-[12px]" style={{ color: 'var(--muted)' }}>
                                Click the link in the email to reset your password. Check your spam folder if you don&apos;t see it.
                            </p>
                            <button
                                onClick={() => { setSent(false); setEmail(''); }}
                                className="mt-6 text-[13px] text-violet-400 hover:text-violet-300 transition-colors">
                                Try a different email
                            </button>
                        </div>
                    ) : (
                        /* ── Form state ── */
                        <>
                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
                                style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)' }}>
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                    <rect x="3" y="9" width="14" height="10" rx="2" stroke="#a78bfa" strokeWidth="1.5" />
                                    <path d="M6 9V6a4 4 0 0 1 8 0v3" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" />
                                    <circle cx="10" cy="14" r="1.5" fill="#a78bfa" />
                                </svg>
                            </div>
                            <h1 className="text-xl font-bold mb-1">Forgot password?</h1>
                            <p className="text-[13px] mb-7" style={{ color: 'var(--muted)' }}>
                                Enter your email and we&apos;ll send you a reset link.
                            </p>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--muted)' }}>
                                        Email address
                                    </label>
                                    <input
                                        type="email"
                                        placeholder="you@example.com"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        className="w-full px-3.5 py-2.5 rounded-xl text-[14px] outline-none transition-all"
                                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                                        onFocus={e => (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.6)')}
                                        onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                                        required
                                    />
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
                                            Sending...
                                        </span>
                                    ) : 'Send reset link'}
                                </button>
                            </form>
                        </>
                    )}
                </div>

                <p className="text-center text-[13px] mt-5" style={{ color: 'var(--muted)' }}>
                    Remember your password?{' '}
                    <Link href="/auth/login" className="text-violet-400 hover:text-violet-300 transition-colors font-medium">
                        Sign in
                    </Link>
                </p>
            </div>
            <Footer />
        </div>
    );
}
