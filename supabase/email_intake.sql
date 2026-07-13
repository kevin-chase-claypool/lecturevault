create table if not exists public.lecturevault_email_intake (
  id text primary key,
  email_token text not null unique,
  course_id text not null,
  reconstruction_title text not null,
  class_date date,
  status text not null default 'awaiting_email',
  attachments jsonb not null default '[]'::jsonb,
  received_email_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lecturevault_email_intake enable row level security;
