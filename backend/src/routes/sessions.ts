import { Router, Response } from 'express';
import { supabase } from '../supabase';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// Mentor creates a session
router.post('/', requireRole('mentor'), async (req: AuthRequest, res: Response) => {
    const { title, language = 'javascript' } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });

    const { data, error } = await supabase
        .from('sessions')
        .insert({ title, mentor_id: req.user!.id, language })
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// Student joins a session
router.post('/:id/join', requireRole('student'), async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const { data: session, error: fetchErr } = await supabase
        .from('sessions')
        .select()
        .eq('id', id)
        .single();

    if (fetchErr || !session) return res.status(404).json({ error: 'Session not found' });
    if (session.status === 'ended') return res.status(400).json({ error: 'Session ended' });

    if (session.status === 'waiting') {
        const { data, error } = await supabase
            .from('sessions')
            .update({ student_id: req.user!.id, status: 'active' })
            .eq('id', id)
            .select()
            .single();
        if (error) return res.status(500).json({ error: error.message });
        return res.json(data);
    }

    res.json(session);
});

// End session (mentor only)
router.post('/:id/end', requireRole('mentor'), async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const { data, error } = await supabase
        .from('sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', id)
        .eq('mentor_id', req.user!.id)
        .select()
        .single();

    if (error || !data) return res.status(404).json({ error: 'Session not found' });
    res.json(data);
});

// Get session by id (with mentor/student names via profiles)
router.get('/:id', async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const { data, error } = await supabase
        .from('sessions')
        .select(`
      *,
      mentor:profiles!sessions_mentor_id_fkey(name, email),
      student:profiles!sessions_student_id_fkey(name, email)
    `)
        .eq('id', id)
        .single();

    if (error || !data) return res.status(404).json({ error: 'Session not found' });

    res.json({
        ...data,
        mentor_name: (data.mentor as any)?.name,
        student_name: (data.student as any)?.name,
    });
});

// Get my sessions
router.get('/', async (req: AuthRequest, res: Response) => {
    const col = req.user!.role === 'mentor' ? 'mentor_id' : 'student_id';

    const { data, error } = await supabase
        .from('sessions')
        .select(`
      *,
      mentor:profiles!sessions_mentor_id_fkey(name),
      student:profiles!sessions_student_id_fkey(name)
    `)
        .eq(col, req.user!.id)
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    res.json((data || []).map((s: any) => ({
        ...s,
        mentor_name: s.mentor?.name,
        student_name: s.student?.name,
    })));
});

// Get messages for a session
router.get('/:id/messages', async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const { data, error } = await supabase
        .from('messages')
        .select(`*, profile:profiles!messages_user_id_fkey(name, role)`)
        .eq('session_id', id)
        .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    res.json((data || []).map((m: any) => ({
        ...m,
        user_name: m.profile?.name,
        user_role: m.profile?.role,
    })));
});

export default router;
