import { supabase } from './supabase';

// Verify tables exist — Supabase Postgres handles schema via migrations/dashboard.
// Run schema.sql in your Supabase SQL editor to create tables.
export async function initDB() {
  const { error } = await supabase.from('sessions').select('id').limit(1);
  if (error && error.code !== 'PGRST116') {
    throw new Error(`DB check failed: ${error.message}. Did you run schema.sql in Supabase?`);
  }
  console.log('Supabase DB connection OK');
}
