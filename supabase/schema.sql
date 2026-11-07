-- Moliya AI — Supabase sxemasi
-- Supabase Dashboard → SQL Editor → shu faylni to'liq yopishtirib "Run" bosing.
-- Bir marta bajariladi; qayta bajarsa ham xato bermaydi (if not exists).

create extension if not exists pgcrypto;

-- ---------- Hisoblar ----------
create table if not exists public.accounts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  name text not null default '',
  type text not null default 'cash' check (type in ('cash','card','home','person','other')),
  currency text not null default 'UZS',
  aliases text[] not null default '{}',
  color text not null default '#e8ecef',
  sort int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists accounts_user_idx on public.accounts(user_id, updated_at);

-- ---------- Yozuvlar (xom matn — o'zgarmas manba) ----------
create table if not exists public.notes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  raw text not null default '',
  note_date date not null,
  unit int not null default 1000 check (unit in (1, 1000)),
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_user_idx on public.notes(user_id, updated_at);
create index if not exists notes_user_date_idx on public.notes(user_id, note_date);

-- ---------- Sozlamalar (limit, maqsad, tasdiqlangan juftliklar, oxirgi AI natija) ----------
create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- Xavfsizlik: har kim faqat o'z qatorlarini ko'radi ----------
alter table public.accounts enable row level security;
alter table public.notes enable row level security;
alter table public.settings enable row level security;

drop policy if exists "accounts_own" on public.accounts;
create policy "accounts_own" on public.accounts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "notes_own" on public.notes;
create policy "notes_own" on public.notes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "settings_own" on public.settings;
create policy "settings_own" on public.settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Realtime (telefon ↔ kompyuter jonli sinxronizatsiya) ----------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notes') then
    alter publication supabase_realtime add table public.notes;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'accounts') then
    alter publication supabase_realtime add table public.accounts;
  end if;
end $$;

-- Realtime filtrlari uchun to'liq qator ma'lumoti
alter table public.notes replica identity full;
alter table public.accounts replica identity full;
