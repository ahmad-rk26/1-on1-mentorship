'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Footer from '@/components/Footer';

export default function LoginPage() {
    const router = useRouter();
    const [form, setForm] = useState({ email: '', password: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const { error } = await supabase.auth.signInWithPassword(form);
            if (error) throw error;
            router.push('/dashboard');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-4 relative">
            {/* Background glow */}
            <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(124,58,237,0.15) 0%, transparent 70%)' }} />

            <div className="w-full max-w-[380px] relative z-10 flex-1 flex flex-col justify-center py-12">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-2 justify-center mb-10">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-sm font-black">M</div>
                    <span className="font-bold text-[16px]">MentorSpace</span>
                </Link>

                {/* Card */}
                <div className="rounded-2xl p-8" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <h1 className="text-xl font-bold mb-1">Welcome back</h1>
                    <p className="text-[var(--muted)] text-[13px] mb-7">Sign in to your account to continue.</p>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-[12px] font-medium text-[var(--muted)] mb-1.5">Email</label>
                            <input
                                type="email"
                                placeholder="you@example.com"
                                value={form.email}
                                onChange={e => setForm({ ...form, email: e.target.value })}
                                className="w-full px-3.5 py-2.5 rounded-xl text-[14px] outline-none transition-all duration-150"
                                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.6)')}
                                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                                required
                            />
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <label className="block text-[12px] font-medium text-[var(--muted)]">Password</label>
                                <Link href="/auth/forgot-password"
                                    className="text-[12px] text-violet-400 hover:text-violet-300 transition-colors">
                                    Forgot password?
                                </Link>
                            </div>
                            <input
                                type="password"
                                placeholder="••••••••"
                                value={form.password}
                                onChange={e => setForm({ ...form, password: e.target.value })}
                                className="w-full px-3.5 py-2.5 rounded-xl text-[14px] outline-none transition-all duration-150"
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
                            className="w-full py-2.5 rounded-xl font-semibold text-[14px] transition-all duration-150 disabled:opacity-50 mt-2"
                            style={{ background: 'var(--violet)', boxShadow: '0 0 0 1px rgba(124,58,237,0.4)' }}
                            onMouseEnter={e => !loading && (e.currentTarget.style.background = '#6d28d9')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'var(--violet)')}>
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                                    </svg>
                                    Signing in...
                                </span>
                            ) : 'Sign in'}
                        </button>
                    </form>
                </div>

                <p className="text-center text-[var(--muted)] text-[13px] mt-5">
                    Don&apos;t have an account?{' '}
                    <Link href="/auth/signup" className="text-violet-400 hover:text-violet-300 transition-colors font-medium">
                        Sign up
                    </Link>
                </p>
            </div>
            <Footer minimal />
        </div>
    );
}
