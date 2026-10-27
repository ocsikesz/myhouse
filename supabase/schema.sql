-- CasaMea — sincronizare de familie.
-- Rulează o singură dată în Supabase: Dashboard → SQL Editor → New query → lipește tot → Run.
-- Toată familia folosește același cont (email + parolă), deci fiecare rând aparține acelui cont.

create table if not exists public.records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null,          -- reading | assoc | setting | credentials | provider
  uid        text        not null,          -- id-ul înregistrării în aplicație
  data       jsonb,                         -- conținutul; null când e șters
  deleted    boolean     not null default false,
  server_ts  timestamptz not null default now(),
  primary key (user_id, kind, uid)
);

create index if not exists records_pull on public.records (user_id, server_ts);

-- server_ts e mereu ora serverului, ca telefoanele să poată cere „ce s-a schimbat de la ...”
create or replace function public.records_touch() returns trigger
language plpgsql as $$
begin
  new.server_ts := clock_timestamp();
  return new;
end $$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
for each row execute function public.records_touch();

alter table public.records enable row level security;

drop policy if exists "records_own" on public.records;
create policy "records_own" on public.records
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Pozele contoarelor: bucket privat, fiecare cont vede doar folderul lui (<user_id>/...)
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "photos_own_select" on storage.objects;
drop policy if exists "photos_own_insert" on storage.objects;
drop policy if exists "photos_own_update" on storage.objects;
drop policy if exists "photos_own_delete" on storage.objects;

create policy "photos_own_select" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos_own_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos_own_update" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos_own_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
