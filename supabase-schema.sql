-- LINE OA Pending Chat Checker schema

create table if not exists public.line_messages (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  event_time timestamptz,
  line_user_id text not null,
  display_name text,
  message_id text,
  message_type text,
  text text,
  media_bucket text,
  media_path text,
  media_content_type text,
  media_size bigint,
  media_backed_up_at timestamptz,
  media_deleted_at timestamptz,
  media_error text,
  raw_event jsonb
);

alter table public.line_messages
  add column if not exists media_bucket text,
  add column if not exists media_path text,
  add column if not exists media_content_type text,
  add column if not exists media_size bigint,
  add column if not exists media_backed_up_at timestamptz,
  add column if not exists media_deleted_at timestamptz,
  add column if not exists media_error text;

create index if not exists idx_line_messages_event_time
on public.line_messages(event_time desc);

create index if not exists idx_line_messages_line_user_id
on public.line_messages(line_user_id);

create index if not exists idx_line_messages_media_path
on public.line_messages(media_path)
where media_path is not null;

insert into storage.buckets (id, name, public)
values ('line-message-media', 'line-message-media', false)
on conflict (id) do nothing;

create table if not exists public.system_heartbeat (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  source text
);
