export default function Footer() {
    const year = new Date().getFullYear();

    return (
        <footer style={{ borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)' }}>
            <div className="max-w-6xl mx-auto px-6 py-10">

                {/* Top section */}
                <div className="flex flex-col md:flex-row justify-between gap-10 mb-8">

                    {/* Brand */}
                    <div className="flex flex-col gap-3 max-w-xs">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-sm font-black text-white">M</div>
                            <span className="font-bold text-[16px]">MentorSpace</span>
                        </div>
                        <p className="text-[13px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                            A real-time 1-on-1 mentorship platform with collaborative code editor, video calling, and live chat — built for developers.
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-[12px]" style={{ color: 'var(--muted)' }}>Live & open for sessions</span>
                        </div>
                    </div>

                    {/* Contact */}
                    <div className="flex flex-col gap-3">
                        <p className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>Contact</p>
                        <div className="flex flex-col gap-2.5">
                            <div className="flex items-center gap-2.5 text-[13px]" style={{ color: 'var(--muted)' }}>
                                <PersonIcon />
                                <span>Ahmad Raza Khan</span>
                            </div>
                            <a href="mailto:razakhanahmad68@gmail.com"
                                className="flex items-center gap-2.5 text-[13px] transition-colors hover:text-white"
                                style={{ color: 'var(--muted)' }}>
                                <MailIcon />
                                razakhanahmad68@gmail.com
                            </a>
                            <a href="tel:+918767887220"
                                className="flex items-center gap-2.5 text-[13px] transition-colors hover:text-white"
                                style={{ color: 'var(--muted)' }}>
                                <PhoneIcon />
                                +91 87678 87220
                            </a>
                            <div className="flex items-center gap-2.5 text-[13px]" style={{ color: 'var(--muted)' }}>
                                <LocationIcon />
                                Begusarai, Bihar — 851211
                            </div>
                        </div>
                    </div>

                    {/* Tech stack */}
                    <div className="flex flex-col gap-3">
                        <p className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>Built with</p>
                        <div className="flex flex-col gap-2">
                            {['Next.js 15', 'Supabase', 'Socket.io', 'WebRTC', 'Monaco Editor', 'TypeScript'].map(tech => (
                                <div key={tech} className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--muted)' }}>
                                    <span className="w-1 h-1 rounded-full bg-violet-400" />
                                    {tech}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Bottom bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 text-[12px]"
                    style={{ borderTop: '1px solid var(--border)', color: 'var(--muted)' }}>
                    <span>© {year} MentorSpace. All rights reserved.</span>
                    <span>Designed & developed by Ahmad Raza Khan</span>
                </div>
            </div>
        </footer>
    );
}

function PersonIcon() {
    return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}><circle cx="7" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.3" /><path d="M2 12c0-2.761 2.239-5 5-5s5 2.239 5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>;
}
function MailIcon() {
    return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}><rect x="1" y="3" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" /><path d="M1 4l6 4 6-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>;
}
function PhoneIcon() {
    return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}><path d="M4.5 1.5h-2A1 1 0 0 0 1.5 2.5c0 5.523 4.477 10 10 10a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1l-2-.5a1 1 0 0 0-1 .3l-.8.8A8.02 8.02 0 0 1 4.4 6L5.2 5.2a1 1 0 0 0 .3-1L5 2.5a1 1 0 0 0-1-1z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function LocationIcon() {
    return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}><path d="M7 1.5A4 4 0 0 1 11 5.5c0 3-4 7-4 7s-4-4-4-7a4 4 0 0 1 4-4z" stroke="currentColor" strokeWidth="1.3" /><circle cx="7" cy="5.5" r="1.2" stroke="currentColor" strokeWidth="1.3" /></svg>;
}
