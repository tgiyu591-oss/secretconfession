create table if not exists public.confessions (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{43}$'),
  message text not null check (char_length(message) between 1 and 2000),
  sender_name text check (sender_name is null or char_length(sender_name) <= 60),
  created_at timestamptz not null default now()
);

alter table public.confessions enable row level security;

grant select, insert on table public.confessions to service_role;
