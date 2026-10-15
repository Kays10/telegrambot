create table if not exists public.messages (
  id bigint generated always as identity primary key,
  telegram_user_id text,
  question text,
  answer text,
  created_at timestamptz default now()
);

alter table public.messages enable row level security;

grant insert on public.messages to anon;

drop policy if exists "Allow anonymous message inserts" on public.messages;

create policy "Allow anonymous message inserts"
  on public.messages
  for insert
  to anon
  with check (true);

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.cybersecurity_documents (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_object_name text unique,
  uploaded_at timestamptz not null default now()
);

alter table public.cybersecurity_documents
  add column if not exists storage_object_name text unique;

create table if not exists public.cybersecurity_document_chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.cybersecurity_documents(id) on delete cascade,
  content text not null,
  search_vector tsvector generated always as (
    to_tsvector('english'::regconfig, content)
  ) stored
);

create index if not exists cybersecurity_document_chunks_search_idx
  on public.cybersecurity_document_chunks using gin (search_vector);

create table if not exists public.cybersecurity_document_config (
  singleton boolean primary key default true check (singleton),
  upload_password_sha256 text not null
);

create table if not exists public.cybersecurity_upload_reservations (
  object_name text primary key,
  filename text not null,
  expires_at timestamptz not null default (now() + interval '1 day')
);

alter table public.cybersecurity_upload_reservations enable row level security;

revoke all on public.cybersecurity_upload_reservations from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cybersecurity-pdfs',
  'cybersecurity-pdfs',
  false,
  52428800,
  array['application/pdf']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into public.cybersecurity_document_config (singleton, upload_password_sha256)
values (true, '9a3aa0269deaa016fc56f39302fb4ef072ca5777f6f2ffbb51660fbc9090a890')
on conflict (singleton) do update
set upload_password_sha256 = excluded.upload_password_sha256;

alter table public.cybersecurity_documents enable row level security;
alter table public.cybersecurity_document_chunks enable row level security;
alter table public.cybersecurity_document_config enable row level security;

revoke all on public.cybersecurity_documents from anon, authenticated;
revoke all on public.cybersecurity_document_chunks from anon, authenticated;
revoke all on public.cybersecurity_document_config from anon, authenticated;

create or replace function public.is_reserved_cybersecurity_pdf(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cybersecurity_upload_reservations
    where object_name = p_object_name
      and expires_at > now()
  );
$$;

revoke all on function public.is_reserved_cybersecurity_pdf(text) from public;
grant execute on function public.is_reserved_cybersecurity_pdf(text) to anon, authenticated;

drop policy if exists "Allow reserved cybersecurity PDF uploads" on storage.objects;
create policy "Allow reserved cybersecurity PDF uploads"
  on storage.objects
  for insert
  to anon
  with check (
    bucket_id = 'cybersecurity-pdfs'
    and public.is_reserved_cybersecurity_pdf(name)
  );

drop policy if exists "Allow reserved cybersecurity PDF downloads" on storage.objects;
create policy "Allow reserved cybersecurity PDF downloads"
  on storage.objects
  for select
  to anon
  using (
    bucket_id = 'cybersecurity-pdfs'
    and public.is_reserved_cybersecurity_pdf(name)
  );

drop policy if exists "Allow reserved cybersecurity PDF updates" on storage.objects;
create policy "Allow reserved cybersecurity PDF updates"
  on storage.objects
  for update
  to anon
  using (
    bucket_id = 'cybersecurity-pdfs'
    and public.is_reserved_cybersecurity_pdf(name)
  )
  with check (
    bucket_id = 'cybersecurity-pdfs'
    and public.is_reserved_cybersecurity_pdf(name)
  );

drop policy if exists "Allow reserved cybersecurity PDF cleanup" on storage.objects;
create policy "Allow reserved cybersecurity PDF cleanup"
  on storage.objects
  for delete
  to anon
  using (
    bucket_id = 'cybersecurity-pdfs'
    and public.is_reserved_cybersecurity_pdf(name)
  );

create or replace function public.reserve_cybersecurity_pdf_upload(
  p_filename text,
  p_upload_password text
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  expected_hash text;
  reserved_object_name text;
begin
  select upload_password_sha256
  into expected_hash
  from public.cybersecurity_document_config
  where singleton = true;

  if p_upload_password is null
    or expected_hash is null
    or encode(extensions.digest(convert_to(p_upload_password, 'UTF8'), 'sha256'), 'hex') <> expected_hash
  then
    raise exception 'Invalid document upload password'
      using errcode = '42501';
  end if;

  if p_filename is null
    or length(p_filename) = 0
    or length(p_filename) > 255
    or lower(p_filename) not like '%.pdf'
  then
    raise exception 'Invalid PDF filename'
      using errcode = '22023';
  end if;

  delete from public.cybersecurity_upload_reservations
  where expires_at <= now();

  reserved_object_name := gen_random_uuid()::text || '.pdf';

  insert into public.cybersecurity_upload_reservations (object_name, filename)
  values (reserved_object_name, p_filename);

  return reserved_object_name;
end;
$$;

revoke all on function public.reserve_cybersecurity_pdf_upload(text, text) from public;
grant execute on function public.reserve_cybersecurity_pdf_upload(text, text) to anon, authenticated;

create or replace function public.resume_cybersecurity_pdf_upload(
  p_filename text,
  p_object_name text,
  p_upload_password text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  expected_hash text;
begin
  select upload_password_sha256
  into expected_hash
  from public.cybersecurity_document_config
  where singleton = true;

  if p_upload_password is null
    or expected_hash is null
    or encode(extensions.digest(convert_to(p_upload_password, 'UTF8'), 'sha256'), 'hex') <> expected_hash
  then
    raise exception 'Invalid document upload password'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.cybersecurity_upload_reservations
    where object_name = p_object_name
      and filename = p_filename
      and expires_at > now()
  ) then
    raise exception 'Upload reservation expired; start the upload again'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.resume_cybersecurity_pdf_upload(text, text, text) from public;
grant execute on function public.resume_cybersecurity_pdf_upload(text, text, text) to anon, authenticated;

create or replace function public.release_cybersecurity_pdf_upload(
  p_object_name text,
  p_upload_password text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  expected_hash text;
begin
  select upload_password_sha256
  into expected_hash
  from public.cybersecurity_document_config
  where singleton = true;

  if p_upload_password is null
    or expected_hash is null
    or encode(extensions.digest(convert_to(p_upload_password, 'UTF8'), 'sha256'), 'hex') <> expected_hash
  then
    raise exception 'Invalid document upload password'
      using errcode = '42501';
  end if;

  delete from public.cybersecurity_upload_reservations
  where object_name = p_object_name;
end;
$$;

revoke all on function public.release_cybersecurity_pdf_upload(text, text) from public;
grant execute on function public.release_cybersecurity_pdf_upload(text, text) to anon, authenticated;

drop function if exists public.ingest_cybersecurity_document(text, text[], text);

create or replace function public.ingest_cybersecurity_document(
  p_filename text,
  p_chunks text[],
  p_upload_password text,
  p_storage_object_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  document_id uuid;
  expected_hash text;
begin
  select upload_password_sha256
  into expected_hash
  from public.cybersecurity_document_config
  where singleton = true;

  if p_upload_password is null
    or expected_hash is null
    or encode(extensions.digest(convert_to(p_upload_password, 'UTF8'), 'sha256'), 'hex') <> expected_hash
  then
    raise exception 'Invalid document upload password'
      using errcode = '42501';
  end if;

  if p_filename is null
    or length(p_filename) = 0
    or p_chunks is null
    or cardinality(p_chunks) = 0
    or cardinality(p_chunks) > 4000
    or p_storage_object_name is null
  then
    raise exception 'Invalid document content'
      using errcode = '22023';
  end if;

  select id into document_id
  from public.cybersecurity_documents
  where storage_object_name = p_storage_object_name;

  if document_id is not null then
    return document_id;
  end if;

  insert into public.cybersecurity_documents (filename, storage_object_name)
  values (p_filename, p_storage_object_name)
  returning id into document_id;

  insert into public.cybersecurity_document_chunks (document_id, content)
  select document_id, chunk
  from unnest(p_chunks) as chunk;

  return document_id;
end;
$$;

revoke all on function public.ingest_cybersecurity_document(text, text[], text, text) from public;
grant execute on function public.ingest_cybersecurity_document(text, text[], text, text) to anon, authenticated;

create or replace function public.search_cybersecurity_knowledge(
  p_query text,
  p_limit integer default 5
)
returns table (
  filename text,
  content text,
  relevance real
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with query as (
    select websearch_to_tsquery(
      'english',
      regexp_replace(trim(p_query), '[[:space:]]+', ' OR ', 'g')
    ) as terms
  )
  select
    d.filename,
    c.content,
    ts_rank(c.search_vector, query.terms) as relevance
  from public.cybersecurity_document_chunks as c
  join public.cybersecurity_documents as d on d.id = c.document_id
  cross join query
  where c.search_vector @@ query.terms
  order by relevance desc
  limit least(greatest(coalesce(p_limit, 5), 1), 8);
$$;

revoke all on function public.search_cybersecurity_knowledge(text, integer) from public;
grant execute on function public.search_cybersecurity_knowledge(text, integer) to anon, authenticated;

create or replace function public.list_cybersecurity_documents()
returns table (
  id uuid,
  filename text,
  uploaded_at timestamptz,
  chunk_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.filename, d.uploaded_at, count(c.id) as chunk_count
  from public.cybersecurity_documents as d
  left join public.cybersecurity_document_chunks as c on c.document_id = d.id
  group by d.id
  order by d.uploaded_at desc;
$$;

revoke all on function public.list_cybersecurity_documents() from public;
grant execute on function public.list_cybersecurity_documents() to anon, authenticated;
