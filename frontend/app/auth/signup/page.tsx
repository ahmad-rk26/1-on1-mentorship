'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Footer from '@/components/Footer';

export default function SignupPage() {
    const router = useRouter();
    const [form, setForm] = useState({ name: '', email: '', password: '', role: 'student' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const { data, error } = await supabase.auth.signUp({
                email: form.email,
                password: form.password,
                options: { data: { name: form.name, role: form.role } },
            });
            if (error) throw error;

            if (data.user && data.session) {
                const { error: profileErr } = await supabase.from('profiles').upsert({
                    id: data.user.id,
                    email: form.email,
                    name: form.name,
                    role: form.role,
                });
                if (profileErr) console.warn('Profile upsert warning:', profileErr.message);
            }

            router.push('/dashboard');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    const inputStyle = {
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        color: 'var(--text)',
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-4 relative py-12">
            <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(124,58,237,0.15) 0%, transparent 70%)' }} />

            <div className="w-full max-w-[400px] relative z-10 flex-1 flex flex-col justify-center">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-2 justify-center mb-10">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-sm font-black">M</div>
                    <span className="font-bold text-[16px]">MentorSpace</span>
                </Link>

                {/* Card */}
                <div className="rounded-2xl p-8" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <h1 className="text-xl font-bold mb-1">Create your account</h1>
                    <p className="text-[var(--muted)] text-[13px] mb-7">Join MentorSpace and start learning or teaching.</p>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-[12px] font-medium text-[var(--muted)] mb-1.5">Full name</label>
                            <input
                                type="text"
                                placeholder="John Doe"
                                value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                                className="w-full px-3.5 py-2.5 rounded-xl text-[14px] outline-none transition-all duration-150"
                                style={inputStyle}
                                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.6)')}
                                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-[12px] font-medium text-[var(--muted)] mb-1.5">Email</label>
                            <input
                                type="email"
                                placeholder="you@example.com"
                                value={form.email}
                                onChange={e => setForm({ ...form, email: e.target.value })}
                                className="w-full px-3.5 py-2.5 rounded-xl text-[14px] outline-none transition-all duration-150"
                                style={inputStyle}
                                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.6)')}
                                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-[12px] font-medium text-[var(--muted)] mb-1.5">Password</label>
                            <input
                                type="password"
                                placeholder="Min. 6 characters"
                                value={form.password}
                                onChange={e => setForm({ ...form, password: e.target.value })}
                                className="w-full px-3.5 py-2.5 rounded-xl text-[14px] outline-none transition-all duration-150"
                                style={inputStyle}
                                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.6)')}
                                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                                minLength={6}
                                required
                            />
                        </div>

                        {/* Role selector */}
                        <div>
                            <label className="block text-[12px] font-medium text-[var(--muted)] mb-1.5">I am a</label>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { value: 'student', label: 'Student', icon: '🎓', desc: 'I want to learn' },
                                    { value: 'mentor', label: 'Mentor', icon: '👨‍🏫', desc: 'I want to teach' },
                                ].map(r => (
                                    <button
                                        key={r.value}
                                        type="button"
                                        onClick={() => setForm({ ...form, role: r.value })}
                                        className="flex flex-col items-center gap-1 py-3.5 px-3 rounded-xl text-center transition-all duration-150"
                                        style={{
                                            background: form.role === r.value ? 'rgba(124,58,237,0.15)' : 'var(--surface-2)',
                                            border: `1px solid ${form.role === r.value ? 'rgba(124,58,237,0.5)' : 'var(--border)'}`,
                                        }}>
                                        <span className="text-xl">{r.icon}</span>
                                        <span className={`text-[13px] font-semibold ${form.role === r.value ? 'text-violet-300' : 'text-[var(--text)]'}`}>{r.label}</span>
                                        <span className="text-[11px] text-[var(--muted)]">{r.desc}</span>
                                    </button>
                                ))}
                            </div>
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
                            className="w-full py-2.5 rounded-xl font-semibold text-[14px] transition-all duration-150 disabled:opacity-50 mt-1"
                            style={{ background: 'var(--violet)', boxShadow: '0 0 0 1px rgba(124,58,237,0.4)' }}
                            onMouseEnter={e => !loading && (e.currentTarget.style.background = '#6d28d9')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'var(--violet)')}>
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                                    </svg>
                                    Creating account...
                                </span>
                            ) : 'Create account'}
                        </button>
                    </form>
                </div>

                <p className="text-center text-[var(--muted)] text-[13px] mt-5">
                    Already have an account?{' '}
                    <Link href="/auth/login" className="text-violet-400 hover:text-violet-300 transition-colors font-medium">
                        Sign in
                    </Link>
                </p>
            </div>
            <Footer minimal />
        </div>
    );
}
