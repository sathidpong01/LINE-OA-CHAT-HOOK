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
  raw_event jsonb
);

create index if not exists idx_line_messages_event_time
on public.line_messages(event_time desc);

create index if not exists idx_line_messages_line_user_id
on public.line_messages(line_user_id);

create table if not exists public.system_heartbeat (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  source text
);
