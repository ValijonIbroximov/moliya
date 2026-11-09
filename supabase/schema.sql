-- Moliya AI — Supabase sxemasi
-- Supabase Dashboard → SQL Editor → shu faylni to'liq yopishtirib "Run" bosing.
-- Bir marta bajariladi; qayta bajarsa ham xato bermaydi (if not exists).
-- Jadvallar "moliya_" prefiksi bilan — MAVJUD loyihangizga (boshqa ilova bilan birga) xavfsiz qo'shiladi.

create extension if not exists pgcrypto;

-- ---------- Hisoblar ----------
create table if not exists public.moliya_accounts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  name text not null default '',
  type text not null default 'cash' check (type in ('cash','card','home','person','other','report')),
  currency text not null default 'UZS',
  aliases text[] not null default '{}',
  color text not null default '#e8ecef',
  sort int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists moliya_accounts_user_idx on public.moliya_accounts(user_id, updated_at);

-- Avvalroq o'rnatganlar uchun migratsiya (xatosiz qayta bajariladi):
alter table public.moliya_accounts drop constraint if exists moliya_accounts_type_check;
alter table public.moliya_accounts add constraint moliya_accounts_type_check check (type in ('cash','card','home','person','other','report'));

-- ---------- Yozuvlar (xom matn — o'zgarmas manba) ----------
create table if not exists public.moliya_notes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  raw text not null default '',
  note_date date not null,
  unit int not null default 1000 check (unit in (1, 1000)),
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists moliya_notes_user_idx on public.moliya_notes(user_id, updated_at);
create index if not exists moliya_notes_user_date_idx on public.moliya_notes(user_id, note_date);

-- ---------- Sozlamalar (limit, maqsad, tasdiqlangan juftliklar, oxirgi AI natija) ----------
create table if not exists public.moliya_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- Xavfsizlik: har kim faqat o'z qatorlarini ko'radi ----------
alter table public.moliya_accounts enable row level security;
alter table public.moliya_notes enable row level security;
alter table public.moliya_settings enable row level security;

drop policy if exists "moliya_accounts_own" on public.moliya_accounts;
create policy "moliya_accounts_own" on public.moliya_accounts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "moliya_notes_own" on public.moliya_notes;
create policy "moliya_notes_own" on public.moliya_notes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "moliya_settings_own" on public.moliya_settings;
create policy "moliya_settings_own" on public.moliya_settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Realtime (telefon ↔ kompyuter jonli sinxronizatsiya) ----------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'moliya_notes') then
    alter publication supabase_realtime add table public.moliya_notes;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'moliya_accounts') then
    alter publication supabase_realtime add table public.moliya_accounts;
  end if;
end $$;

-- Realtime filtrlari uchun to'liq qator ma'lumoti
alter table public.moliya_notes replica identity full;
alter table public.moliya_accounts replica identity full;
