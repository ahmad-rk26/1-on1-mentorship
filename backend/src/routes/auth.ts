import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db';

const router = Router();

router.post('/signup', async (req: Request, res: Response) => {
    const { email, password, name, role } = req.body;
    if (!email || !password || !name || !role) {
        return res.status(400).json({ error: 'All fields required' });
    }
    if (!['mentor', 'student'].includes(role)) {
        return res.status(400).json({ error: 'Role must be mentor or student' });
    }
    try {
        const hashed = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role',
            [email, hashed, name, role]
        );
        const user = result.rows[0];
        const token = jwt.sign(user, process.env.JWT_SECRET!, { expiresIn: '7d' });
        res.json({ token, user });
    } catch (err: any) {
        if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/login', async (req: Request, res: Response) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

        const { password: _, ...safeUser } = user;
        const token = jwt.sign(safeUser, process.env.JWT_SECRET!, { expiresIn: '7d' });
        res.json({ token, user: safeUser });
    } catch {
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
