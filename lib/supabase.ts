import { createClient } from "@supabase/supabase-js";

// Both values are public by design. Access is controlled in the database:
// tables are read-only (row level security) and every write goes through
// validated functions (see supabase/migrations/0002_functions.sql).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://vvxfjhpbjlofjkscjyud.supabase.co";
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2eGZqaHBiamxvZmprc2NqeXVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM3NjU2MjQsImV4cCI6MjEwOTM0MTYyNH0.LxFqAG6-T3VPip0gZtKkN1wqdQdDJqjQvd2YTSuw1fE";

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false },
});
