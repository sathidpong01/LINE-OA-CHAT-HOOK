# SKILL.md

## Skill: Supabase LINE OA Log Collector

### Purpose

Collect LINE OA customer messages into Supabase so Hermes/Ollama/AI can later analyze pending customer chats from terminal.

### Updated architecture

```text
LINE OA
→ Supabase Edge Function
→ Supabase table: line_messages
→ Local terminal/Hermes
→ Pending chat report
```

### Do not use in current version

- Cloudflare Tunnel for Hermes
- LINE Bot for Hermes
- NAS webhook receiver
- Docker
- CRM dashboard
- Auto customer replies

### Supabase schema

```sql
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
```

### Edge Function behavior

1. Receive POST from LINE.
2. Verify `x-line-signature`.
3. Parse events.
4. For text messages, insert text into Supabase.
5. For non-text messages, insert message type and raw event.
6. Return 200.

### Local analysis behavior

1. Fetch messages from Supabase.
2. Group by customer.
3. Detect risk using keywords and recency.
4. Build AI prompt with only risky cases.
5. Generate short report.

### Report sections

- `ค้างแน่ / เสี่ยงสูง`
- `ควรตรวจสอบ`

### Heartbeat

Supabase Free project may pause after inactivity. Keep a lightweight heartbeat:
- GitHub Actions
- scheduled script
- periodic Supabase query

Suggested frequency: 2-3 times per week or daily.

Heartbeat can be a simple select from `line_messages` or insert into `system_heartbeat`.
