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

## Local analyzer V1

อ่าน log ดิบจาก NAS path `Y:\raw_logs` แล้วสร้างรายงาน markdown ใน `Y:\reports`

```powershell
$env:RAW_LOG_DIR='Y:\raw_logs'
$env:REPORT_DIR='Y:\reports'
$env:DEFAULT_LOOKBACK_DAYS='30'
node scripts/analyze-pending.js
```

ทดสอบ rule-based analyzer:

```powershell
node --test scripts/analyze-pending.test.js
```

## Hermes daily workflow

สร้าง context รายวันให้ Hermes จาก raw logs, CSV backup ถ้ามี, case state, และไฟล์ media local path:

```powershell
$env:RAW_LOG_DIR='Y:\raw_logs'
$env:LINE_OA_BACKUP_DIR='Y:\line_oa_backups'
$env:NORMALIZED_LOG_DIR='Y:\normalized_logs'
$env:CASE_STATE_PATH='Y:\case_state\cases.json'
$env:REPORT_DIR='Y:\reports'
$env:MEDIA_BASE_DIR='Y:\media'
node scripts/hermes-daily.js
```

Output หลัก:

- `Y:\reports\hermes-daily-context-YYYY-MM-DD.md`
- `Y:\normalized_logs\messages-YYYY-MM-DD.json`
- `Y:\case_state\cases.json`

CSV backup เป็น optional enrichment เท่านั้น ถ้าไม่มี CSV ใหม่ workflow ยังทำงานต่อจาก raw logs และ case state ได้ตามปกติ

## Media backup flow

รูปภาพจาก LINE webhook ไม่ได้มากับ payload โดยตรง ระบบใช้ `message_id` ดาวน์โหลดจาก LINE Content API แล้วเก็บชั่วคราวใน Supabase Storage bucket `line-message-media`

NAS sync จะดึงไฟล์ที่มี `media_path` ลง `BASE_MEDIA_DIR` และ mark `media_backed_up_at` ใน `line_messages`

```powershell
$env:BASE_LOG_DIR='Y:\raw_logs'
$env:BASE_MEDIA_DIR='Y:\media'
node Y:\scripts\nas-sync.js
```

ทดสอบ helper ของ NAS sync:

```powershell
node --test nas-scripts/nas-sync.test.js
```

## Supabase media cleanup

หลังจาก NAS sync backup รูปลง `BASE_MEDIA_DIR` และ mark `media_backed_up_at` แล้ว สามารถลบไฟล์รูปบน Supabase Storage เพื่อลดโอกาสพื้นที่เต็มได้ โดยสคริปต์ cleanup จะเก็บแถว database ไว้ และอัปเดตเฉพาะ `media_deleted_at`

ค่าเริ่มต้นเป็น dry-run ถ้ายังไม่ตั้ง `CONFIRM_REMOTE_MEDIA_DELETE=true`

```powershell
$env:SUPABASE_URL='https://YOUR_PROJECT.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY='YOUR_SERVICE_ROLE_KEY'
$env:BASE_MEDIA_DIR='Y:\media'
$env:MEDIA_DELETE_GRACE_DAYS='2'
node Y:\scripts\nas-cleanup-media.js
```

เมื่อตรวจ dry-run แล้วค่อยเปิดลบจริง:

```powershell
$env:CONFIRM_REMOTE_MEDIA_DELETE='true'
node Y:\scripts\nas-cleanup-media.js
```

ทดสอบ helper ของ cleanup:

```powershell
node --test nas-scripts/nas-cleanup-media.test.js
```

### Synology Task Scheduler command

ใช้ path ฝั่ง NAS จริง เช่น shared folder `/volume2/Raw_line_chat`

```sh
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
export BASE_LOG_DIR="/volume2/Raw_line_chat/raw_logs"
export BASE_MEDIA_DIR="/volume2/Raw_line_chat/media"
/usr/local/bin/node /volume2/Raw_line_chat/scripts/nas-sync.js
```

Cleanup งานรูปเก่าที่ backup แล้ว แนะนำตั้งเป็นอีก task แยกจาก sync เช่นวันละครั้ง:

```sh
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
export BASE_MEDIA_DIR="/volume2/Raw_line_chat/media"
export MEDIA_DELETE_GRACE_DAYS="2"
export MEDIA_CLEANUP_LIMIT="100"
export CONFIRM_REMOTE_MEDIA_DELETE="true"
/usr/local/bin/node /volume2/Raw_line_chat/scripts/nas-cleanup-media.js
```

ถ้า Node.js บน Synology อยู่คนละ path ให้หา path ด้วย:

```sh
which node
```
