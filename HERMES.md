# Hermes Operating Guide

คู่มือนี้มีไว้ให้ Hermes ใช้เมื่อเจ้าของร้านสั่งให้สรุปแชท LINE OA รายวัน

## Trigger

ถ้าผู้ใช้สั่งประมาณนี้:

- `สรุปแชทเมื่อวาน`
- `สรุปแชทรายวัน`
- `สรุปงานค้างจาก LINE`
- `เช็คแชทเมื่อวานให้หน่อย`
- `สรุปวันให้หน่อย`

ให้รัน daily workflow เองทันที ไม่ต้องถามให้ผู้ใช้จำ command

## Working Directory

ต้องเริ่มจากโฟลเดอร์โปรเจค:

```powershell
cd Y:\LINE-OA-CHAT-HOOK
```

ห้ามรันจาก `Y:\` โดยตรงถ้าใช้คำสั่ง `node scripts\hermes-daily.js`

## Daily Context Command

รันคำสั่งนี้เพื่อสร้าง context รายวัน:

```powershell
$env:RAW_LOG_DIR='Y:\raw_logs'
$env:LINE_OA_BACKUP_DIR='Y:\line_oa_backups'
$env:NORMALIZED_LOG_DIR='Y:\normalized_logs'
$env:CASE_STATE_PATH='Y:\case_state\cases.json'
$env:REPORT_DIR='Y:\reports'
$env:MEDIA_BASE_DIR='Y:\media'
node scripts\hermes-daily.js
```

script จะสรุปรอบงานล่าสุดที่ปิดแล้ว โดยนิยามวันทำงานคือ:

```text
08:00 Asia/Bangkok -> 08:00 Asia/Bangkok วันถัดไป
```

## Inputs

- `Y:\raw_logs` คือ log ลูกค้าจาก webhook แบบ real-time
- `Y:\media` คือรูป/สลิปที่ backup ลง NAS แล้ว
- `Y:\line_oa_backups` คือ CSV backup จาก LINE OA Manager ที่เจ้าของร้านโหลดเอง ถ้าไม่มีก็ข้ามได้
- `Y:\case_state\cases.json` คือสมุดสถานะ case ที่ Hermes ใช้จำว่า open/watch/closed/ignored

## Outputs

หลังรัน command ให้อ่าน stdout เพื่อหา path เหล่านี้:

- `contextPath` เช่น `Y:\reports\hermes-daily-context-2026-05-16.md`
- `normalizedPath` เช่น `Y:\normalized_logs\messages-2026-05-16.json`
- `caseStatePath` คือ `Y:\case_state\cases.json`

จากนั้นให้อ่าน `contextPath` แล้ววิเคราะห์จากไฟล์นั้นเป็นหลัก

ถ้าเขียนรายงานลงไฟล์ ให้เขียนที่:

```text
Y:\reports\daily-report-YYYY-MM-DD.md
```

## Reporting Rules

รายงานสุดท้ายควรมีหัวข้อเหล่านี้:

1. `ต้องดูทันที`
2. `ควรตรวจ`
3. `เฝ้าดู`
4. `ถามเจ้าของร้าน`
5. `ปิดงานอัตโนมัติวันนี้`

ให้จัดลำดับ priority เองจากเงิน, สลิป, มัดจำ, ความด่วน, เวลาที่รอ, งานผลิต, และการถามซ้ำของลูกค้า

ห้ามใส่ emoji ตกแต่งเองในหัวข้อหรือ bullet ของรายงาน เพราะอ่านยากใน terminal

ถ้า emoji เป็นส่วนหนึ่งของชื่อลูกค้า ให้คงไว้ได้ ห้ามลบหรือเปลี่ยนชื่อลูกค้า

ให้ทำชื่อคน/เคสอ่านง่ายด้วย label คงที่ เช่น:

```text
[RED C01] Earns S Kittayarak
[YELLOW C02] laNORA (S S P T . G I G A)
[BLUE C03] Taany
```

กติกา label:

- `RED` = ต้องดูทันที
- `YELLOW` = ควรตรวจ
- `BLUE` = เฝ้าดู
- `GRAY` = ปิดงานอัตโนมัติวันนี้
- `ASK` = ถามเจ้าของร้าน

ถ้า terminal รองรับ ANSI color จะใช้สีจริงกับ label/name ได้ แต่ต้องยังอ่านรู้เรื่องเมื่อ copy ไปเป็น text ธรรมดา

ทุกเคสใน `ต้องดูทันที` และ `ควรตรวจ` ต้องมี:

- เหตุผล
- หลักฐานล่าสุดพร้อมเวลา
- สิ่งที่ควรทำต่อ 1 บรรทัด

ถ้าไม่มีข้อมูลฝั่งร้านจาก CSV ล่าสุด ให้ใช้คำว่า:

```text
ไม่พบคำตอบฝั่งร้านในข้อมูลที่มี
```

ห้ามฟันธงว่า:

```text
ร้านยังไม่ได้ตอบ
```

เพราะ webhook ปัจจุบันเห็นฝั่งลูกค้าเป็นหลัก

## Case State Rules

Hermes ดูแล `Y:\case_state\cases.json` ได้ แต่ต้อง conservative

สถานะที่ใช้:

- `open` = ยังต้องตาม
- `watch` = รอดู / รอลูกค้า / รอผลิต / รอวัสดุ
- `closed` = ปิดงานแล้ว ข้ามรอบถัดไป เว้นแต่มีข้อความใหม่
- `needs_owner` = ไม่มั่นใจ ต้องถามเจ้าของร้าน
- `ignored` = ไม่ใช่เคสงานหรือไม่ต้องตาม

ปิดเองเป็น `closed` ได้เมื่อหลักฐานชัด เช่น:

- ลูกค้าบอกว่าติดตั้งเรียบร้อย
- ส่งงานแล้ว
- ลูกค้ายกเลิก
- ปิดงานชัดเจน
- โอนครบแล้วและไม่มีประเด็นงาน/ส่งของ/ผลิตค้าง

ห้ามปิดเองจากคำคลุมเครือ เช่น:

- `ขอบคุณ`
- `เรียบร้อยค่ะ`
- `ได้ค่ะ`

โดยเฉพาะถ้าก่อนหน้านั้นมีเรื่องราคา, โอน, มัดจำ, ใบเสนอราคา, งานผลิต หรือสลิป

ถ้าปิดเอง ต้องบันทึกหลักฐานใน case state:

```json
{
  "status": "closed",
  "closed_at": "2026-05-16T08:25:00+07:00",
  "closed_reason": "พบข้อความยืนยันว่าติดตั้งเรียบร้อย",
  "closed_evidence": [
    "2026-05-15 16:20 customer: ติดตั้งเรียบร้อยแล้วค่ะ"
  ]
}
```

ถ้าไม่มั่นใจ ให้ใส่ `needs_owner` แล้วถามในรายงาน ไม่ต้องเดา

## Image / Slip Reading Rules

ใน context อาจมีข้อความรูป 2 แบบ:

```text
- 2026-05-15 16:45 customer: [image]
  media: Y:\media\2026\05\15\U...\614057902784905456.jpg
```

หรือ:

```text
- 2026-05-13 11:32 customer: [image]
```

ถ้ามีบรรทัด `media:` ให้ถือว่ามีไฟล์รูปใน NAS แล้ว และควรเปิดอ่านรูปนั้นด้วย vision/image tool โดยเฉพาะเมื่ออยู่ใกล้ข้อความเหล่านี้:

- โอน
- โอนแล้ว
- มัดจำ
- สลิป
- บัญชี
- ชำระ
- จ่าย
- ขอราคา / ใบเสนอราคา
- ส่งแบบ / ส่งไฟล์ / แก้แบบ

เมื่ออ่านรูปแล้ว ให้สรุปแบบระวัง:

```text
รูปแนบ: เห็นเป็นสลิป/หลักฐานโอนเงิน น่าจะเกี่ยวกับยอด ... บาท
```

ถ้าอ่านรูปไม่ได้ หรือไม่มี `media:` path ให้เขียนว่า:

```text
มี event รูปภาพ แต่ยังไม่มีไฟล์รูปใน context ให้อ่าน
```

ห้ามเดาว่ารูปเป็นสลิป ถ้าไม่ได้เปิดอ่านรูปหรือไม่มีบริบทเรื่องเงินใกล้ ๆ

## CSV Backup Behavior

CSV backup เป็น optional enrichment:

- ถ้ามี CSV ใหม่ใน `Y:\line_oa_backups` ให้ import เข้า context
- ถ้าไม่มี CSV ใหม่ ห้ามหยุด workflow
- CSV ที่เคย import แล้วต้องยังใช้ได้ในรอบต่อไป
- ถ้ามีข้อความฝั่งร้านจาก CSV ให้ใช้ช่วยลด false positive

## Safety Rules

- ห้ามแก้ `Y:\raw_logs`
- ห้ามลบไฟล์ media จาก workflow รายวัน
- ห้ามส่งข้อความตอบลูกค้า
- ห้าม expose service role key
- ถ้า context ไม่พอ ให้บอกข้อจำกัดในรายงาน ไม่แต่งข้อมูลเพิ่ม
