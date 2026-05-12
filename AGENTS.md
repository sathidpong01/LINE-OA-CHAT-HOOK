# AGENTS.md

## Project

LINE OA Pending Chat Checker with Supabase

คุณคือ AI coding agent ที่ช่วยพัฒนาระบบเก็บ log แชท LINE OA เพื่อให้ Hermes/Ollama/AI วิเคราะห์ว่าแชทไหนน่าจะค้างตอบ หรืองานไหนอาจถูกลืม

## Current decision

แนวทางล่าสุดคือ:

```text
LINE OA → Supabase Edge Function → Supabase Database → Hermes terminal
```

ไม่ใช้ Hermes ต่อ LINE แล้ว  
ไม่ใช้ Cloudflare Tunnel ถาวรแล้ว  
ไม่ใช้ NAS เป็น webhook receiver แล้ว

## User context

- ผู้ใช้เป็นร้านรับทำป้ายโฆษณา
- มีแชทลูกค้าจำนวนมากใน LINE OA
- แอดมินหลายคนอาจเปิดอ่านหรือตอบส่ง ๆ แล้วลืม follow-up
- งานบางงานเป็นงานผลิต ใช้เวลาหลายวันหรือหลายสัปดาห์
- ผู้ใช้ต้องการรายงานสั้น ๆ ว่าใครน่าจะค้างตอบ
- ผู้ใช้จะสั่ง Hermes จาก terminal เอง
- ผู้ใช้มี Supabase ว่างอีก 1 project
- Supabase Free อาจเข้าสถานะ sleep หาก inactive จึงควรมี heartbeat
- NAS อาจใช้เก็บ backup/report ภายหลัง แต่ไม่ใช่ตัวรับ webhook ตอนนี้

## Target architecture

```text
LINE OA Customer Account
  → Messaging API Webhook URL
  → Supabase Edge Function: line-webhook
  → Table: line_messages
  → Local terminal/Hermes fetches data
  → Analyzer + AI summary
  → Markdown/Text report
```

## Supabase responsibilities

- provide stable HTTPS webhook URL
- verify LINE signature
- parse LINE webhook events
- store message events in `line_messages`
- optionally store raw_event jsonb for debugging
- expose data to local analyzer securely

## Hermes/local responsibilities

- query Supabase for recent messages
- group by customer
- detect risky conversations
- optionally send filtered cases to AI
- create report
- do not auto-reply to customers

## Database schema V1

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

create index if not exists idx_line_messages_event_time
on public.line_messages(event_time desc);

create index if not exists idx_line_messages_line_user_id
on public.line_messages(line_user_id);
```

Optional heartbeat table:

```sql
create table if not exists public.system_heartbeat (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  source text
);
```

## Edge Function requirements

Function name recommendation: `line-webhook`

Must:
- accept POST request from LINE
- read raw request body
- verify `x-line-signature`
- parse JSON only after signature verification
- insert text messages into `line_messages`
- insert non-text events with `message_type` and raw_event, but text can be null
- return 200 quickly
- never expose service role key to client

## Environment variables

```env
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DEFAULT_LOOKBACK_DAYS=30
PRODUCTION_LOOKBACK_DAYS=90
TIMEZONE=Asia/Bangkok
```

## Security rules

- Do not commit `.env`
- Do not expose service role key in frontend
- Verify LINE signature
- Store only necessary message data
- Do not send all raw logs to AI unless necessary
- Prefer sending only filtered risky cases to AI
- Do not create customer auto-reply in V1

## Keywords

High priority:
- ขอราคา
- ราคา
- ราคาเท่าไหร่
- ใบเสนอราคา
- โอน
- โอนแล้ว
- มัดจำ
- ด่วน
- วันนี้
- พรุ่งนี้
- ส่งไฟล์
- ส่งแบบ
- ทำทันไหม
- ติดตั้ง
- ผลิต
- ป้ายไฟ
- แก้แบบ
- นัดรับ
- รอวัสดุ

Non-final replies:
- รับทราบ
- เดี๋ยวเช็กให้
- ขอสอบถามก่อน
- รอสักครู่
- เดี๋ยวแจ้ง
- ขอดูก่อน
- ขอเช็กคิว
- ขอเช็กราคา

Possible close indicators:
- ส่งงานแล้ว
- ติดตั้งเรียบร้อย
- รับงานแล้ว
- ลูกค้ายกเลิก
- โอนครบแล้ว
- ปิดงาน
- เรียบร้อยค่ะ
- ขอบคุณค่ะ

Special rule: “ขอบคุณ” alone must not close a case, especially after payment/deposit wording.


## Report format

```text
รายงานแชทที่ควรตรวจสอบ

ค้างแน่ / เสี่ยงสูง
1. คุณสมชาย — ขอราคาป้ายไวนิล
ล่าสุด: 10 พ.ค. 19:42
เหตุผล: ลูกค้าถามราคา ยังไม่พบคำตอบที่จบเรื่องในข้อมูล

ควรตรวจสอบ
1. คุณบอย — งานผลิตป้ายไฟ
ล่าสุด: 5 พ.ค.
เหตุผล: งานผลิตเก่าและยังไม่พบสัญญาณปิดงาน
```

## Definition of Done V1

- Supabase project has table `line_messages`
- Edge Function receives LINE webhook successfully
- LINE Developers Verify webhook succeeds
- Sending a test message to OA creates a row in Supabase
- Local script can fetch last 30 days of messages
- Local script creates markdown report
- Hermes can read or receive the report prompt from terminal
