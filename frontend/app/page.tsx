'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Footer from '@/components/Footer';

const SLIDES = [
  {
    tag: 'Real-time Collaboration',
    headline: ['Code Together,', 'Grow Together.'],
    sub: 'Pair with your mentor in a live coding environment — no setup, no friction, no limits.',
    cta: 'Start for free',
    bg: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(124,58,237,0.35) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 80% 80%, rgba(6,182,212,0.2) 0%, transparent 60%)',
    accent: 'from-violet-400 to-cyan-400',
  },
  {
    tag: 'Video + Chat',
    headline: ['See, Hear &', 'Understand More.'],
    sub: 'Built-in WebRTC video calling and session chat keep every conversation in one place.',
    cta: 'Try it now',
    bg: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(6,182,212,0.3) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 20% 80%, rgba(16,185,129,0.2) 0%, transparent 60%)',
    accent: 'from-cyan-400 to-emerald-400',
  },
  {
    tag: 'Monaco Editor',
    headline: ['VS Code Power,', 'Right in the Browser.'],
    sub: 'Full syntax highlighting, multi-language support, and real-time cursor sync — all in one tab.',
    cta: 'Get started',
    bg: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(236,72,153,0.25) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 80% 80%, rgba(124,58,237,0.2) 0%, transparent 60%)',
    accent: 'from-pink-400 to-violet-400',
  },
];

const FEATURES = [
  { icon: '⌨️', title: 'Shared Code Editor', desc: 'Monaco-powered editor with real-time sync. Every keystroke is mirrored instantly between mentor and student.', accent: 'group-hover:text-violet-400' },
  { icon: '📹', title: 'WebRTC Video Call', desc: '1-on-1 video calling with mic and camera controls. No third-party apps, no plugins needed.', accent: 'group-hover:text-cyan-400' },
  { icon: '💬', title: 'Session Chat', desc: 'Persistent chat tied to each session. Share links, snippets, and feedback in real time.', accent: 'group-hover:text-emerald-400' },
  { icon: '🔐', title: 'Secure Auth', desc: 'Supabase-powered authentication with mentor and student roles. Private sessions by default.', accent: 'group-hover:text-rose-400' },
  { icon: '🌐', title: 'Multi-Language', desc: 'JavaScript, TypeScript, Python, Java, Go, Rust, C++ — switch languages mid-session.', accent: 'group-hover:text-amber-400' },
  { icon: '🔗', title: 'Shareable Links', desc: 'Mentors create a session and share a single link. Students join in one click, no account needed.', accent: 'group-hover:text-pink-400' },
];

const STEPS = [
  { n: '01', label: 'Mentor', color: 'bg-violet-500/15 text-violet-300 border-violet-500/30', dot: 'bg-violet-500', action: 'Sign up and create a session with a title and language.' },
  { n: '02', label: 'Mentor', color: 'bg-violet-500/15 text-violet-300 border-violet-500/30', dot: 'bg-violet-500', action: 'Share the session link with your student.' },
  { n: '03', label: 'Student', color: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30', dot: 'bg-cyan-500', action: 'Click the link and join the session instantly.' },
  { n: '04', label: 'Both', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-500', action: 'Code, chat, and video call — all in one tab.' },
];

const STATS = [
  { value: '<150ms', label: 'Code sync latency' },
  { value: '7+', label: 'Languages' },
  { value: '1-on-1', label: 'Private sessions' },
  { value: '100%', label: 'Browser-based' },
];

export default function Home() {
  const router = useRouter();
  const [slide, setSlide] = useState(0);
  const [fading, setFading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.push('/dashboard');
    });
  }, [router]);

  const resetTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => goTo((s: number) => (s + 1) % SLIDES.length), 5500);
  };

  useEffect(() => {
    resetTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function goTo(next: number | ((s: number) => number)) {
    setFading(true);
    setTimeout(() => {
      setSlide(typeof next === 'function' ? next : () => next);
      setFading(false);
    }, 280);
    resetTimer();
  }

  const s = SLIDES[slide];

  return (
    <div className="min-h-screen text-white overflow-x-hidden" style={{ background: 'var(--bg)' }}>

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 h-16 flex items-center px-4 md:px-10"
        style={{ background: 'rgba(8,11,20,0.8)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2.5 mr-auto">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-xs font-black">M</div>
          <span className="font-bold text-[15px] tracking-tight">MentorSpace</span>
        </div>
        <div className="hidden md:flex items-center gap-7 text-[13px] text-[var(--muted)] mr-8">
          {['Features', 'How it works', 'Why us'].map((item, i) => (
            <a key={item} href={['#features', '#how', '#stats'][i]}
              className="hover:text-white transition-colors duration-150">{item}</a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/auth/login"
            className="text-[13px] text-[var(--muted)] hover:text-white transition-colors px-3 py-1.5">
            Sign in
          </Link>
          <Link href="/auth/signup"
            className="text-[13px] font-medium px-4 py-1.5 rounded-lg transition-all duration-150"
            style={{ background: 'var(--violet)', boxShadow: '0 0 0 1px rgba(124,58,237,0.5)' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#6d28d9')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--violet)')}>
            Get started
          </Link>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 transition-all duration-700" style={{ background: s.bg }} />
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }} />
        {/* Glow orbs */}
        <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] rounded-full opacity-20 blur-[120px]"
          style={{ background: 'radial-gradient(circle, #7c3aed, transparent)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full opacity-15 blur-[100px]"
          style={{ background: 'radial-gradient(circle, #06b6d4, transparent)' }} />

        {/* Content */}
        <div className={`relative z-10 text-center px-6 max-w-4xl mx-auto transition-all duration-280 ${fading ? 'opacity-0 translate-y-3' : 'opacity-100 translate-y-0'}`}>
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[12px] font-medium text-[var(--muted)] mb-8"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {s.tag}
          </div>

          <h1 className={`text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black leading-[1.05] tracking-tight mb-6 bg-gradient-to-r ${s.accent} bg-clip-text text-transparent`}>
            {s.headline[0]}<br />{s.headline[1]}
          </h1>

          <p className="text-[var(--muted)] text-lg md:text-xl max-w-xl mx-auto leading-relaxed mb-10">
            {s.sub}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/auth/signup"
              className="px-7 py-3.5 rounded-xl font-semibold text-[15px] transition-all duration-150 hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)', boxShadow: '0 0 30px rgba(124,58,237,0.4)' }}>
              {s.cta} →
            </Link>
            <Link href="/auth/login"
              className="px-7 py-3.5 rounded-xl font-semibold text-[15px] text-[var(--muted)] hover:text-white transition-all duration-150"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}>
              Sign in
            </Link>
          </div>
        </div>

        {/* Slide controls */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-3 z-10">
          {SLIDES.map((_, i) => (
            <button key={i} onClick={() => goTo(i)}
              className={`rounded-full transition-all duration-300 ${i === slide ? 'w-6 h-2 bg-white' : 'w-2 h-2 bg-white/25 hover:bg-white/50'}`} />
          ))}
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-10 right-8 flex flex-col items-center gap-1.5 text-[var(--muted)] text-[11px] animate-bounce">
          <span>scroll</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M2 7l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
      </section>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <section id="stats" style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.015)' }}>
        <div className="max-w-5xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {STATS.map(stat => (
            <div key={stat.label}>
              <div className="text-3xl md:text-4xl font-black bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent mb-1.5">
                {stat.value}
              </div>
              <div className="text-[13px] text-[var(--muted)]">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section id="features" className="py-28 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[12px] font-semibold tracking-[0.15em] uppercase text-violet-400 mb-3">Features</p>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-4">Everything you need</h2>
            <p className="text-[var(--muted)] text-lg max-w-md mx-auto">Built for real mentorship sessions — not just screen sharing.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(f => (
              <div key={f.title} className="group p-6 rounded-2xl cursor-default transition-all duration-200 hover:-translate-y-0.5"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-hover)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                <div className={`text-2xl mb-4 transition-all duration-200 ${f.accent}`}>{f.icon}</div>
                <h3 className="font-semibold text-[15px] mb-2">{f.title}</h3>
                <p className="text-[var(--muted)] text-[13px] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <section id="how" className="py-28 px-6" style={{ background: 'rgba(255,255,255,0.015)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[12px] font-semibold tracking-[0.15em] uppercase text-cyan-400 mb-3">Process</p>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-4">How it works</h2>
            <p className="text-[var(--muted)] text-lg">From signup to live session in under a minute.</p>
          </div>

          <div className="relative space-y-4">
            {STEPS.map((step, i) => (
              <div key={i} className="flex items-start gap-5 p-5 rounded-2xl transition-all duration-200 hover:-translate-x-0.5"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  {step.n}
                </div>
                <div className="flex-1 pt-0.5">
                  <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full border mb-2 ${step.color}`}>
                    {step.label}
                  </span>
                  <p className="text-[var(--text)] text-[15px]">{step.action}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Editor mockup ──────────────────────────────────────────────────── */}
      <section className="py-28 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[12px] font-semibold tracking-[0.15em] uppercase text-emerald-400 mb-3">Live Preview</p>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight">The session experience</h2>
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid var(--border)', boxShadow: '0 40px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)' }}>
            {/* Title bar */}
            <div className="flex items-center gap-2 px-4 py-3" style={{ background: '#080b14', borderBottom: '1px solid var(--border)' }}>
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                <div className="w-3 h-3 rounded-full bg-[#28c840]" />
              </div>
              <div className="flex gap-1 ml-4">
                {['Editor', 'Video'].map((t, i) => (
                  <span key={t} className={`text-[12px] px-3 py-1 rounded-md ${i === 0 ? 'text-white' : 'text-[var(--muted)]'}`}
                    style={i === 0 ? { background: 'rgba(255,255,255,0.08)' } : {}}>
                    {t}
                  </span>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-[12px] text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  2 connected
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded text-[var(--muted)]"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}>
                  python
                </span>
              </div>
            </div>

            <div className="flex">
              {/* Line numbers + code */}
              <div className="flex flex-1 overflow-hidden">
                <div className="select-none text-right pr-4 pt-5 text-[var(--muted)] text-[13px] font-mono leading-7 opacity-40 pl-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(n => <div key={n}>{n}</div>)}
                </div>
                <div className="flex-1 p-5 font-mono text-[13px] leading-7 overflow-hidden">
                  <div><span className="text-[#ff7b72]">def</span> <span className="text-[#d2a8ff]">fibonacci</span><span className="text-white">(n: </span><span className="text-[#79c0ff]">int</span><span className="text-white">) -&gt; </span><span className="text-[#79c0ff]">int</span><span className="text-white">:</span></div>
                  <div className="pl-6"><span className="text-[#8b949e]">"""Return nth Fibonacci number."""</span></div>
                  <div className="pl-6"><span className="text-[#ff7b72]">if</span> <span className="text-white">n &lt;= </span><span className="text-[#79c0ff]">1</span><span className="text-white">:</span></div>
                  <div className="pl-12"><span className="text-[#ff7b72]">return</span> <span className="text-white">n</span></div>
                  <div className="pl-6"><span className="text-[#ff7b72]">return</span> <span className="text-[#d2a8ff]">fibonacci</span><span className="text-white">(n - </span><span className="text-[#79c0ff]">1</span><span className="text-white">) + </span><span className="text-[#d2a8ff]">fibonacci</span><span className="text-white">(n - </span><span className="text-[#79c0ff]">2</span><span className="text-white">)</span></div>
                  <div className="mt-2"><span className="text-[#8b949e]"># Mentor is typing ↓</span></div>
                  <div><span className="text-white">result = [</span><span className="text-[#d2a8ff]">fibonacci</span><span className="text-white">(i) </span><span className="text-[#ff7b72]">for</span><span className="text-white"> i </span><span className="text-[#ff7b72]">in</span><span className="text-white"> </span><span className="text-[#d2a8ff]">range</span><span className="text-white">(</span><span className="text-[#79c0ff]">10</span><span className="text-white">)]</span><span className="inline-block w-[2px] h-[14px] bg-violet-400 ml-0.5 animate-pulse align-middle" /></div>
                  <div><span className="text-[#d2a8ff]">print</span><span className="text-white">(result)</span></div>
                </div>
              </div>

              {/* Chat sidebar */}
              <div className="hidden sm:flex w-44 lg:w-52 shrink-0 flex-col" style={{ borderLeft: '1px solid var(--border)' }}>
                <div className="px-4 py-3 text-[11px] font-semibold tracking-widest uppercase text-[var(--muted)]"
                  style={{ borderBottom: '1px solid var(--border)' }}>
                  Chat
                </div>
                <div className="flex-1 p-3 space-y-3 text-[12px]">
                  {[
                    { who: 'Mentor', msg: 'Try memoization here 👆', mine: false },
                    { who: 'Student', msg: 'Like caching results?', mine: true },
                    { who: 'Mentor', msg: 'Exactly — use a dict.', mine: false },
                  ].map((m, i) => (
                    <div key={i} className={`flex flex-col ${m.mine ? 'items-end' : 'items-start'}`}>
                      <span className="text-[10px] text-[var(--muted)] mb-1">{m.who}</span>
                      <div className={`px-3 py-1.5 rounded-xl max-w-[90%] leading-relaxed ${m.mine ? 'text-white' : 'text-[var(--text)]'}`}
                        style={{ background: m.mine ? 'var(--violet)' : 'var(--surface-2)' }}>
                        {m.msg}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="px-3 py-2 rounded-lg text-[12px] text-[var(--muted)]"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    Message...
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────────── */}
      <section className="py-28 px-6 relative overflow-hidden" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(124,58,237,0.12) 0%, transparent 70%)' }} />
        <div className="relative z-10 max-w-2xl mx-auto text-center">
          <h2 className="text-4xl md:text-6xl font-black tracking-tight mb-5 bg-gradient-to-r from-violet-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
            Ready to mentor?
          </h2>
          <p className="text-[var(--muted)] text-lg mb-10">
            Create your first session in seconds. No credit card, no setup.
          </p>
          <Link href="/auth/signup"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl font-bold text-lg transition-all duration-150 hover:scale-[1.02]"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)', boxShadow: '0 0 40px rgba(124,58,237,0.35)' }}>
            Get started free
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <Footer />
    </div>
  );
}
