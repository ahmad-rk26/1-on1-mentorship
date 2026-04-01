-- ─────────────────────────────────────────────────────────────────────────────
-- Run this ENTIRE script in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Drop old trigger and function if they exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- 2. Drop tables in correct order (messages → sessions → profiles)
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- 3. Create profiles (no FK to auth.users — avoids trigger permission issues)
CREATE TABLE profiles (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('mentor', 'student')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  mentor_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'ended')),
  language TEXT NOT NULL DEFAULT 'javascript',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- 5. Create messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Indexes
CREATE INDEX idx_sessions_mentor  ON sessions(mentor_id);
CREATE INDEX idx_sessions_student ON sessions(student_id);
CREATE INDEX idx_messages_session ON messages(session_id);

-- 7. Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 8. RLS policies — profiles
CREATE POLICY "profiles_select_all"   ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own"   ON profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "profiles_update_own"   ON profiles FOR UPDATE USING (auth.uid() = id);

-- 9. RLS policies — sessions
CREATE POLICY "sessions_select_auth"  ON sessions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "sessions_insert_auth"  ON sessions FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "sessions_update_auth"  ON sessions FOR UPDATE USING (auth.role() = 'authenticated');

-- 10. RLS policies — messages
CREATE POLICY "messages_select_auth"  ON messages FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "messages_insert_auth"  ON messages FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 11. Trigger function — creates profile row on every new signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student')
  )
  ON CONFLICT (id) DO UPDATE SET
    name  = EXCLUDED.name,
    role  = EXCLUDED.role,
    email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

-- 12. Attach trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
