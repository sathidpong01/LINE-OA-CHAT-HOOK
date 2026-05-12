# LINE OA Pending Chat Checker — Supabase Version

เอกสารนี้เป็นเวอร์ชันปรับใหม่ หลังเปลี่ยนแนวทางจาก “NAS รับ webhook” มาเป็น “Supabase รับ webhook และเก็บ log”

## New architecture

```text
LINE OA ลูกค้า
↓
LINE Messaging API Webhook
↓
Supabase Edge Function
↓
Supabase Database: line_messages
↓
คอม Windows / Hermes terminal
↓
ดึงข้อมูลจาก Supabase หรือ export เป็น JSON/CSV
↓
Hermes วิเคราะห์แชทค้าง
↓
สร้างรายงาน
```

## Why changed

ตัดความยุ่งยากเรื่อง Cloudflare Tunnel, DDNS, port forwarding, NAS รับ webhook โดยตรง, HTTPS endpoint ในบ้าน, และการทำ LINE bridge ให้ Hermes

## Scope V1

1. สร้าง Supabase project
2. สร้าง table `line_messages`
3. สร้าง Supabase Edge Function รับ LINE webhook
4. Insert ข้อความ text ลง database
5. Hermes ใช้ terminal ดึงข้อมูลหรืออ่าน export
6. สร้างรายงานค้างตอบ

## Non-goals

- ไม่ทำ CRM เต็มระบบ
- ไม่ทำ LINE Bot ให้ Hermes คุยกับเรา
- ไม่ให้ AI ส่งข้อความตอบลูกค้า
- ไม่ทำ dashboard
- ไม่ใช้ NAS รับ webhook ในเฟสนี้
