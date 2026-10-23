-- Somatic Abundance: sign-ups and workshop interest.
-- Run once in the Supabase SQL editor (or with `supabase db push`).

-- One row per person who signs in. Filled automatically from Supabase Auth,
-- so a database webhook can pass new sign-ups to MailerLite.
create table if not exists public.signups (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
alter table public.signups enable row level security;  -- no client access needed

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.signups (user_id, email) values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- "Notify me" while the workshop is hibernating.
create table if not exists public.workshop_notify (
  email text primary key,
  created_at timestamptz not null default now()
);
alter table public.workshop_notify enable row level security;
drop policy if exists "people add themselves" on public.workshop_notify;
create policy "people add themselves" on public.workshop_notify
  for insert to authenticated
  with check (email = auth.jwt() ->> 'email');
