# Project Brief — Supabase Version

## Problem

ร้านรับทำป้ายใช้ LINE OA คุยกับลูกค้า แอดมินหลายคนอาจเปิดอ่าน ตอบรับสั้น ๆ หรือปล่อยให้แชทจม งานผลิตบางงานกินเวลานานและอาจถูกลืม

## Solution

เก็บข้อความ LINE OA เข้า Supabase ผ่าน webhook แล้วให้ Hermes ใน terminal วิเคราะห์รายงานแชทค้าง

## Why Supabase

- มี HTTPS endpoint ผ่าน Edge Function
- ไม่ต้องใช้ Cloudflare Tunnel
- ไม่ต้องเปิด NAS ออก internet
- ไม่ต้องมีโดเมน
- เหมาะกับการเริ่มเร็ว
- คอม Hermes ไม่ต้องเปิด 24 ชม.

## Main flow

```text
LINE OA → Supabase Edge Function → line_messages table → Hermes terminal report
```

## Milestones

1. Supabase table พร้อม
2. Edge Function รับ webhook ได้
3. LINE Developers Verify ผ่าน
4. ส่งข้อความทดสอบแล้วเกิด row ใน table
5. Local analyzer ดึงข้อมูลจาก Supabase ได้
6. สร้างรายงาน markdown ได้
7. เพิ่ม AI/Hermes summarization
8. เพิ่ม heartbeat กัน project sleep
