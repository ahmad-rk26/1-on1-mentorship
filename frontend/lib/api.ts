import { getToken } from './auth';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function request(path: string, options: RequestInit = {}) {
    const token = await getToken();
    const res = await fetch(`${BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...options.headers,
        },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}

export const api = {
    createSession: (body: { title: string; language: string }) =>
        request('/api/sessions', { method: 'POST', body: JSON.stringify(body) }),

    joinSession: (id: string) =>
        request(`/api/sessions/${id}/join`, { method: 'POST' }),

    endSession: (id: string) =>
        request(`/api/sessions/${id}/end`, { method: 'POST' }),

    getSession: (id: string) => request(`/api/sessions/${id}`),

    getMySessions: () => request('/api/sessions'),

    getMessages: (id: string) => request(`/api/sessions/${id}/messages`),
};
