import { Request, Response, NextFunction } from 'express';
import { supabase } from '../supabase';

export interface AuthRequest extends Request {
    user?: { id: string; email: string; role: string; name: string };
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    // Verify token with Supabase — returns the authenticated user
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: 'Invalid token' });

    const meta = data.user.user_metadata as { name?: string; role?: string };
    req.user = {
        id: data.user.id,
        email: data.user.email!,
        name: meta.name || '',
        role: meta.role || 'student',
    };
    next();
}

export function requireRole(role: string) {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (req.user?.role !== role) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        next();
    };
}
