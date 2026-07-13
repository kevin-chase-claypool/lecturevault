create table if not exists public.lecturevault_onenote_tokens (
  id text primary key,
  token_ciphertext text not null,
  token_iv text not null,
  token_tag text not null,
  expires_at timestamptz,
  account_label text,
  updated_at timestamptz not null default now()
);

alter table public.lecturevault_onenote_tokens enable row level security;
