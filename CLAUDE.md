# CLAUDE.md

## Current architecture

The project now uses Supabase as the webhook receiver and log database.

Do not continue the old plan where NAS receives LINE webhooks directly.

```text
LINE OA → Supabase Edge Function → Supabase Postgres → Local Hermes terminal
```

## User wants

- Lightweight pending chat checker
- Store LINE OA customer messages
- Analyze chats from terminal with Hermes/Ollama/AI
- Avoid complex Cloudflare/LINE bridge setup
- Avoid full CRM
- Avoid auto-replies

## Build order

1. SQL schema for Supabase
2. Supabase Edge Function `line-webhook`
3. Webhook verification with LINE signature
4. Insert events into `line_messages`
5. Local analyzer script
6. Report generator
7. Optional heartbeat to prevent Supabase inactivity pause

## Important implementation notes

- LINE signature verification requires raw body.
- Parse JSON after verifying signature.
- Store raw_event for debugging.
- Handle multiple events in one webhook request.
- Only text messages are required in V1.
- Non-text messages can be recorded as type only.
- Do not download files/images in V1.

## Supabase Edge Function env

```env
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

## Local analyzer notes

Local script should:
- fetch last 30 days from `line_messages`
- fetch up to 90 days for production-related keywords
- group by `line_user_id`
- use displayName when available
- produce two report sections: `ค้างแน่ / เสี่ยงสูง` and `ควรตรวจสอบ`

## Avoid overclaiming

Because admin replies from LINE OA Manager may not be visible in logs, reports must say:
- “ควรตรวจสอบ”
- “ยังไม่พบใน log”
- “น่าจะค้าง”
- “เสี่ยงว่างานจม”

Do not say:
- “ยังไม่ได้ตอบแน่นอน”
- “แอดมินลืมแน่นอน”

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


## V1 deliverables

- `supabase/schema.sql`
- `supabase/functions/line-webhook/index.ts`
- `.env.example`
- `scripts/fetch-messages.ts` or `.js`
- `scripts/analyze-pending.ts` or `.js`
- `reports/report-YYYY-MM-DD.md`
