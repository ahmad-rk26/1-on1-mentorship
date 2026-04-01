import { supabase } from './supabase';

export interface User {
    id: string;
    email: string;
    name: string;
    role: 'mentor' | 'student';
}

export async function getUser(): Promise<User | null> {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    const meta = data.user.user_metadata as { name?: string; role?: string };
    return {
        id: data.user.id,
        email: data.user.email!,
        name: meta.name || '',
        role: (meta.role as User['role']) || 'student',
    };
}

export async function getToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
}

export async function logout() {
    await supabase.auth.signOut();
}
