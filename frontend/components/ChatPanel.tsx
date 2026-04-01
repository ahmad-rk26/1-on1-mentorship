'use client';
import { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { User } from '@/lib/auth';

interface Message {
    id: string;
    content: string;
    user_name: string;
    user_role: string;
    user_id: string;
    created_at: string;
}

interface Props {
    sessionId: string;
    messages: Message[];
    user: User;
    socket: Socket;
}

function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ChatPanel({ sessionId, messages, user, socket }: Props) {
    const [input, setInput] = useState('');
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    function sendMessage(e: React.FormEvent) {
        e.preventDefault();
        if (!input.trim()) return;
        socket.emit('send-message', { sessionId, content: input.trim() });
        setInput('');
        inputRef.current?.focus();
    }

    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--surface)' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 h-9 shrink-0"
                style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="text-[11px] font-semibold tracking-widest uppercase text-[var(--muted)]">Chat</span>
                <span className="text-[11px] text-[var(--muted)]">{messages.length} msgs</span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-center py-8">
                        <span className="text-2xl">💬</span>
                        <p className="text-[12px] text-[var(--muted)]">No messages yet.<br />Start the conversation.</p>
                    </div>
                )}
                {messages.map((msg, i) => {
                    const isMe = msg.user_id === user.id;
                    const showName = i === 0 || messages[i - 1].user_id !== msg.user_id;
                    return (
                        <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            {showName && (
                                <span className="text-[10px] text-[var(--muted)] mb-1 px-1">
                                    {isMe ? 'You' : msg.user_name}
                                </span>
                            )}
                            <div className={`group relative max-w-[88%]`}>
                                <div className="px-3 py-2 rounded-2xl text-[13px] leading-relaxed break-words"
                                    style={{
                                        background: isMe ? 'var(--violet)' : 'var(--surface-2)',
                                        color: isMe ? '#fff' : 'var(--text)',
                                        borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                    }}>
                                    {msg.content}
                                </div>
                                <span className="text-[10px] text-[var(--muted)] mt-0.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity block">
                                    {formatTime(msg.created_at)}
                                </span>
                            </div>
                        </div>
                    );
                })}
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <form onSubmit={sendMessage} className="p-3 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <input
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder="Message..."
                        className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--muted)]"
                        style={{ color: 'var(--text)' }}
                    />
                    <button type="submit" disabled={!input.trim()}
                        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
                        style={{ background: 'var(--violet)' }}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M6 10V2M2 6l4-4 4 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                </div>
            </form>
        </div>
    );
}
