create table if not exists public.lecturevault_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.lecturevault_state enable row level security;

-- The app reads and writes this table only from Next.js server routes using
-- SUPABASE_SERVICE_ROLE_KEY, so no browser-facing RLS policy is required.
