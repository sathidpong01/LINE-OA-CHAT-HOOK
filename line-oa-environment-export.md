# Export: สรุปข้อมูลอุปกรณ์และสภาพแวดล้อมสำหรับให้ AI อ่าน

อัปเดตตามบทสนทนาล่าสุด: 2026-05-12

## เป้าหมายของโปรเจกต์

ผู้ใช้ต้องการระบบช่วยตรวจแชท LINE OA ของร้านรับทำป้ายโฆษณา เพื่อหาว่าในแต่ละวัน/ย้อนหลังมีลูกค้าคนไหนที่น่าจะยังค้างตอบ หรือมีงานที่อาจถูกลืม

ระบบที่ต้องการไม่ใช่ CRM เต็มรูปแบบ และไม่ต้องการให้ AI ตอบลูกค้าอัตโนมัติในเฟสแรก

เป้าหมายหลักคือ:

- เก็บ log แชทจาก LINE OA
- ให้ AI/Hermes อ่านข้อมูลย้อนหลัง
- สรุปลูกค้าที่น่าจะค้างตอบ
- ตรวจงานเก่าที่ยังอาจไม่ปิด โดยเฉพาะงานผลิต
- ใช้งานผ่าน terminal เป็นหลัก
- ลดความซับซ้อนของ Cloudflare/LINE bridge/NAS webhook

---

## บริบทของร้าน

ผู้ใช้เป็นร้านรับทำป้ายโฆษณา มีลูกค้าทักผ่าน LINE OA เป็นประจำ

ปัญหาที่พบ:

- มีแชทลูกค้าเข้ามาระหว่างเวลาเปิดทำการ 08:00-17:00 และนอกเวลา
- มีแอดมินหลายคนดูแลแชท
- บางคนเปิดอ่านหรือตอบรับสั้น ๆ แล้วปล่อยลูกค้าไว้
- บางครั้งเจ้าของร้านหรือแอดมินเข้าไปดูแชทนอกเวลา แล้วลืมกลับมาตอบตอนเช้า
- งานป้ายบางงานเป็นงานสั่งผลิต ใช้เวลาหลายวันหรือหลายสัปดาห์
- แชทลูกค้าอาจจม ทำให้ลืมว่าเคยมีงานนี้
- ต้องการระบบตรวจย้อนหลัง ไม่ใช่แค่ดูแชทวันนี้

---

## สิ่งที่ผู้ใช้ต้องการจาก AI

ต้องการให้ AI/Hermes ช่วย:

1. วิเคราะห์ว่าแชทไหนน่าจะค้างตอบ
2. วิเคราะห์คุณภาพการตอบ เช่น ตอบส่ง ๆ หรือยังไม่จบ
3. จัดลำดับความสำคัญ เช่น ขอราคา, โอนแล้ว, ด่วน, ส่งไฟล์
4. ตรวจย้อนหลังสูงสุดประมาณ 1 เดือนเป็นพื้นฐาน
5. งานผลิต/มัดจำ/ติดตั้งอาจต้องตามได้ 60-90 วัน
6. รายงานควรสั้น ไม่ยาว
7. แบ่งผลลัพธ์เป็น:
   - ค้างแน่ / เสี่ยงสูง
   - ควรตรวจสอบ
8. ใช้ภาษาระวัง ไม่ฟันธงเกินไป เพราะระบบอาจไม่เห็นข้อความฝั่งแอดมินครบ

ตัวอย่างถ้อยคำที่ควรใช้:

- “ควรตรวจสอบ”
- “ยังไม่พบใน log”
- “น่าจะค้าง”
- “เสี่ยงว่างานจม”

หลีกเลี่ยง:

- “ยังไม่ได้ตอบแน่นอน”
- “แอดมินลืมแน่นอน”
- “ลูกค้าถูกเทแน่นอน”

---

## อุปกรณ์และระบบที่มี

### คอมหลัก / คอม AI

- ใช้ Windows
- ติดตั้ง Hermes แล้ว
- ทดสอบ Ollama ได้แล้ว
- ใช้ terminal สั่ง Hermes ได้
- คอมไม่ได้เปิด 24 ชั่วโมง
- ผู้ใช้ตัดสินใจแล้วว่าจะไม่ทำ LINE ให้ Hermes คุยกับตัวเองในตอนนี้
- จะใช้วิธีสั่ง Hermes ผ่าน terminal เอง

### Hermes

- ติดตั้งแล้ว
- ตรวจพบว่ามี platform หลายตัว เช่น Telegram, Discord, Slack, WhatsApp และ LINE
- เคยทดสอบ LINE gateway ผ่าน Cloudflare Quick Tunnel ได้
- LINE Developers Verify ผ่านแล้วในช่วงทดสอบ
- แต่ยกเลิกแผน LINE bridge เพราะ Quick Tunnel link เปลี่ยนทุกครั้ง และการทำ tunnel ถาวรต้องมีโดเมน ทำให้ขั้นตอนยุ่งยาก
- ตอนนี้แผนคือใช้ Hermes ผ่าน terminal เท่านั้น

### Ollama

- ติดตั้งและทดสอบได้แล้ว
- อาจใช้ร่วมกับ Hermes
- ไม่ต้องเปิด 24 ชั่วโมง

### Synology NAS

รุ่น: Synology DS218play

ข้อมูลจากภาพ/บทสนทนา:

- ไม่รองรับ Docker / Container Manager
- มี Package Center
- เห็นว่ามีแพ็กเกจที่เกี่ยวข้อง เช่น:
  - Node.js v18
  - Node.js v20
  - Node.js v22
  - Python 3.9
  - Web Station
  - Apache HTTP Server 2.4
  - PHP 8.x
  - MariaDB 10
  - phpMyAdmin
  - SMB Service
  - WebDAV Server
- NAS เหมาะกับการเก็บ log / backup / report
- ไม่เหมาะกับการรัน LLM/Ollama/Hermes หนัก ๆ
- ตอนนี้ไม่ใช้ NAS เป็นตัวรับ webhook หลักแล้ว
- NAS อาจใช้เป็นที่เก็บ backup/report ในอนาคต

### DDNS

มี DDNS:

```text
https://sirisilp.i234.me/
```

ข้อสังเกต:

- DDNS ชี้ได้ แต่เข้าจากเน็ตมือถือโดยตรงไม่ได้
- อาจติด port forwarding, firewall, ISP/CGNAT หรือ service ไม่เปิด
- ไม่เหมาะใช้เป็น webhook URL หลักในตอนนี้

### Cloudflare

- ผู้ใช้มีบัญชี Cloudflare
- เคยทดลอง Quick Tunnel สำเร็จ
- ได้ URL ชั่วคราวแบบ trycloudflare.com
- LINE Verify ผ่านเมื่อใช้ Quick Tunnel
- แต่ Quick Tunnel URL เปลี่ยนทุกครั้งที่เริ่มใหม่
- การทำ Tunnel ถาวรผ่าน Public Hostname ต้องมีโดเมนของตัวเองใน Cloudflare
- ผู้ใช้ยังไม่อยากซื้อ/จัดการโดเมน จึงยกเลิกแผนนี้ในตอนนี้

### Supabase

- ผู้ใช้มี Supabase อยู่
- สร้าง database/project ได้ 2 ตัว
- ใช้ไปแล้ว 1 ตัว
- เหลืออีก 1 ตัวว่าง
- มีความกังวลว่า Supabase Free จะเข้าสถานะ sleep/pause ถ้าไม่มี activity
- แนวทางล่าสุดคือใช้ Supabase เป็นตัวรับ LINE webhook และเก็บ log กลาง
- อาจทำ heartbeat/cron เพื่อกัน inactivity

---

## การตัดสินใจล่าสุดของสถาปัตยกรรม

แผนเก่า:

```text
LINE OA → Cloudflare Tunnel/NAS → log → Hermes
```

ถูกลดความสำคัญลง เพราะ Cloudflare/NAS/DDNS ทำให้ขั้นตอนยุ่งยาก

แผนปัจจุบัน:

```text
LINE OA
↓
Supabase Edge Function
↓
Supabase Database: line_messages
↓
Hermes terminal บนคอม Windows
↓
ดึงข้อมูลจาก Supabase หรือ export เป็น JSON/CSV
↓
AI วิเคราะห์แชทค้าง
↓
สร้างรายงาน
```

สิ่งที่ไม่ทำตอนนี้:

- ไม่ทำ LINE Bot ให้ Hermes คุยกับผู้ใช้
- ไม่ทำ Cloudflare Tunnel ถาวร
- ไม่ใช้ NAS รับ webhook
- ไม่ทำ CRM เต็มระบบ
- ไม่ให้ AI auto-reply ลูกค้า
- ไม่ทำ dashboard ในเฟสแรก

---

## Supabase schema ที่แนะนำ

ตารางหลัก:

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

ตาราง heartbeat optional:

```sql
create table if not exists public.system_heartbeat (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  source text
);
```

---

## Supabase Edge Function ที่ต้องการ

ชื่อ function ที่แนะนำ:

```text
line-webhook
```

หน้าที่:

- รับ POST request จาก LINE
- อ่าน raw body
- verify `x-line-signature`
- parse JSON หลัง verify แล้วเท่านั้น
- วนทุก event ใน webhook
- เก็บ message event ลง `line_messages`
- เก็บ text message เป็นหลัก
- non-text message เก็บ type และ raw_event ก่อน ยังไม่ต้องโหลดไฟล์/รูป
- ตอบ 200 ให้ LINE อย่างรวดเร็ว

Environment variables:

```env
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## Local analyzer / Hermes terminal

คอม Windows ที่รัน Hermes ควรทำหน้าที่:

- ดึงข้อมูลจาก Supabase ย้อนหลัง 30 วัน
- ถ้าเจอ keyword งานผลิต/มัดจำ/ติดตั้ง/ป้ายไฟ ให้ตรวจได้ 60-90 วัน
- group by `line_user_id`
- ใช้ `display_name` เมื่อมี
- กรองเคสเสี่ยงด้วย rule ก่อน
- ส่งเฉพาะเคสเสี่ยงให้ AI/Hermes สรุป
- สร้าง report เป็น Markdown หรือ text
- ยังไม่ต้องส่งรายงานเข้า LINE

---

## Keyword สำหรับตรวจความเสี่ยง

### คำสำคัญฝั่งลูกค้า / งานสำคัญ

```text
ขอราคา
ราคา
ราคาเท่าไหร่
ใบเสนอราคา
ทำทันไหม
ด่วน
วันนี้
พรุ่งนี้
ส่งไฟล์
ส่งแบบ
โอนแล้ว
โอน
มัดจำ
ติดตั้ง
นัดรับ
ผลิต
รอของ
รอวัสดุ
แก้แบบ
ป้ายไฟ
```

### คำตอบร้านที่ยังไม่ถือว่าจบ

```text
รับทราบ
เดี๋ยวเช็กให้
ขอสอบถามก่อน
รอสักครู่
เดี๋ยวแจ้ง
ขอดูก่อน
ขอเช็กคิว
ขอเช็กราคา
```

### คำที่อาจสื่อว่าปิดเคส แต่ต้องระวัง context

```text
ส่งงานแล้ว
ติดตั้งเรียบร้อย
รับงานแล้ว
ลูกค้ายกเลิก
โอนครบแล้ว
ปิดงาน
เรียบร้อยค่ะ
ขอบคุณค่ะ
```

กฎสำคัญ:

- “ขอบคุณ” อย่างเดียวห้ามถือว่าปิดเคส
- ถ้ามีคำว่า โอน, มัดจำ, จำนวนเงิน ใกล้กับ “ขอบคุณ” ให้ถือว่าเป็นการรับเรื่อง/รับเงิน ไม่ใช่ปิดงาน
- งานผลิต/มัดจำ/ติดตั้ง/ป้ายไฟ ควรตามได้นานกว่า 30 วัน

---

## รูปแบบรายงานที่ต้องการ

ควรสั้น กระชับ เช่น:

```text
รายงานแชทที่ควรตรวจสอบ

ค้างแน่ / เสี่ยงสูง
1. คุณสมชาย — ขอราคาป้ายไวนิล
ล่าสุด: 10 พ.ค. 19:42
เหตุผล: ลูกค้าถามราคา ยังไม่พบคำตอบที่จบเรื่องในข้อมูล

2. คุณแอน — แจ้งโอนมัดจำ
ล่าสุด: 9 พ.ค. 20:15
เหตุผล: มีการแจ้งโอน ควรตรวจสอบว่ายืนยันและบันทึกงานแล้วหรือยัง

ควรตรวจสอบ
1. คุณบอย — งานผลิตป้ายไฟ
ล่าสุด: 5 พ.ค.
เหตุผล: งานผลิตเก่าและยังไม่พบสัญญาณปิดงาน
```

---

## Prompt สำหรับ Hermes/AI

```text
คุณคือผู้ช่วยตรวจแชท LINE OA ของร้านทำป้ายโฆษณา

ข้อมูลต่อไปนี้เป็นเคสที่ระบบคัดกรองมาจาก log แชท LINE OA
ให้สรุปว่าลูกค้าคนไหนน่าจะค้างตอบ หรืองานไหนอาจถูกลืม

กติกา:
- ตอบสั้น
- แบ่งเป็น “ค้างแน่ / เสี่ยงสูง” และ “ควรตรวจสอบ”
- อย่าฟันธงว่า “ยังไม่ได้ตอบแน่นอน” เพราะ log อาจไม่เห็นข้อความฝั่งแอดมินครบ
- ใช้คำว่า “ยังไม่พบใน log”, “ควรตรวจสอบ”, “เสี่ยงว่างานจม”
- อย่าถือว่า “รับทราบ”, “เดี๋ยวเช็กให้”, “ขอสอบถามก่อน”, “รอสักครู่” เป็นการปิดเคส
- อย่าถือว่า “ขอบคุณ” อย่างเดียวเป็นการปิดเคส โดยเฉพาะหลังโอนเงินหรือมัดจำ
- งานผลิต/ติดตั้ง/มัดจำ/ป้ายไฟ ให้ตามได้นานกว่า 30 วัน

รูปแบบ:

รายงานแชทที่ควรตรวจสอบ

ค้างแน่ / เสี่ยงสูง
1. ชื่อลูกค้า — เรื่อง
ล่าสุด: เวลา
เหตุผล: ...

ควรตรวจสอบ
1. ชื่อลูกค้า — เรื่อง
ล่าสุด: เวลา
เหตุผล: ...

เคส:
{{CASES}}
```

---

## ไฟล์เอกสารที่เตรียมไว้แล้ว

มีการสร้างชุดไฟล์สำหรับ AI coding agent แล้ว 2 เวอร์ชัน:

### เวอร์ชันเก่า: NAS-first

ไฟล์ zip:

```text
line-oa-hermes-agent-kit.zip
```

แนวคิดเดิม:

```text
LINE OA → Cloudflare Tunnel → NAS → JSONL → Hermes
```

### เวอร์ชันล่าสุด: Supabase

ไฟล์ zip:

```text
line-oa-supabase-agent-update.zip
```

ควรใช้เวอร์ชันนี้เป็นหลัก

ประกอบด้วย:

```text
README.md
AGENTS.md
CLAUDE.md
SKILL.md
PROJECT_BRIEF.md
PROMPTS.md
.env.example
supabase-schema.sql
```

---

## สิ่งที่ต้องทำต่อ

ลำดับที่แนะนำ:

1. สร้าง Supabase project ตัวที่ว่าง
2. รัน `supabase-schema.sql`
3. สร้าง Edge Function `line-webhook`
4. ใส่ LINE channel secret/access token ใน Supabase secrets
5. ตั้ง Webhook URL ใน LINE Developers เป็น URL ของ Supabase Edge Function
6. กด Verify
7. ส่งข้อความทดสอบเข้า LINE OA แล้วเช็ก row ใน `line_messages`
8. เขียน local analyzer ให้ดึงข้อมูลจาก Supabase
9. ให้ Hermes terminal วิเคราะห์รายงาน
10. ค่อยเพิ่ม heartbeat กัน Supabase sleep

---

## สิ่งที่ไม่ควรทำตอนนี้

- อย่ากลับไปทำ LINE bridge ให้ Hermes คุยกับผู้ใช้ตอนนี้
- อย่าทำ Cloudflare Tunnel ถาวรถ้ายังไม่มีโดเมน
- อย่าให้ NAS รับ webhook โดยตรงตอนนี้
- อย่าให้ AI ส่งข้อความกลับลูกค้าอัตโนมัติ
- อย่าทำ CRM/dashboard ก่อน webhook + log ใช้งานได้จริง
- อย่าให้ Hermes มีสิทธิ์ godmode ทั้งเครื่องถ้าไม่จำเป็น ให้จำกัดใน workspace โปรเจกต์
