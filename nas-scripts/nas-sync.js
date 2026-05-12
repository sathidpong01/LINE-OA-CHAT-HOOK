/**
 * LINE OA Pending Chat Checker - NAS Sync Script
 * 
 * หน้าที่: ดึงข้อมูลแชทจาก Supabase มาจัดเก็บเป็นไฟล์ JSON บน NAS 
 * รูปแบบไฟล์: raw_logs/YYYY/MM/DD.json
 * 
 * ข้อกำหนด: 
 * - ออกแบบมาให้รันด้วย Node.js แบบ Native บน Synology NAS
 * - ใช้ Zero Dependency (ไม่จำเป็นต้อง npm install ถ้า Node.js version >= 18)
 * - ใช้ REST API ของ Supabase เพื่อความเบาและรวดเร็ว
 */

const fs = require('fs');
const path = require('path');

// 1. กำหนดค่า Environment (คุณสามารถตั้งค่าใน Environment ของ NAS หรือแก้ตัวแปรตรงนี้ได้เลย)
// แนะนำ: ตั้งค่าเป็น Environment Variables ใน Task Scheduler ของ NAS
const SUPABASE_URL = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

// โฟลเดอร์ปลายทางที่จะเก็บข้อมูลดิบ (แก้ไข Path นี้ให้ตรงกับ Shared Folder บน NAS)
const BASE_LOG_DIR = process.env.BASE_LOG_DIR || path.join(__dirname, 'raw_logs');

/**
 * ดึงข้อความจาก Supabase ตามวันที่ระบุ (YYYY-MM-DD)
 */
async function fetchMessagesForDate(targetDateStr) {
    console.log(`[Sync] กำลังดึงข้อมูลของวันที่ ${targetDateStr}...`);
    
    // สร้างช่วงเวลา 00:00:00 ถึง 23:59:59 ของวันนั้น (UTC หรือเวลาท้องถิ่นขึ้นอยู่กับระบบ)
    const startOfDay = new Date(`${targetDateStr}T00:00:00.000Z`).toISOString();
    const endOfDay = new Date(`${targetDateStr}T23:59:59.999Z`).toISOString();

    const url = `${SUPABASE_URL}/rest/v1/line_messages?event_time=gte.${startOfDay}&event_time=lte.${endOfDay}&order=event_time.asc`;

    try {
        const response = await fetch(url, {
            headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
            }
        });

        if (!response.ok) {
            throw new Error(`Supabase API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`[Sync] พบข้อความ ${data.length} รายการ สำหรับวันที่ ${targetDateStr}`);
        return data;
    } catch (error) {
        console.error(`[Error] ไม่สามารถดึงข้อมูลวันที่ ${targetDateStr} ได้:`, error.message);
        return [];
    }
}

/**
 * บันทึกข้อมูลลงเป็นไฟล์ JSON
 */
function saveLogFile(targetDateStr, data) {
    if (!data || data.length === 0) return;

    const [year, month, day] = targetDateStr.split('-');
    const dirPath = path.join(BASE_LOG_DIR, year, month);
    const filePath = path.join(dirPath, `${day}.json`);

    // สร้างโฟลเดอร์ถ้ายืนยันว่ายังไม่มี (เช่น raw_logs/2026/05)
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }

    // เซฟไฟล์ JSON
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`[Save] บันทึกไฟล์สำเร็จ: ${filePath}`);
}

/**
 * ฟังก์ชันหลัก
 */
async function main() {
    console.log('--- เริ่มกระบวนการ NAS Sync ---');

    // ตรวจสอบว่ามี fetch ให้ใช้หรือไม่ (Node.js 18+)
    if (typeof fetch === 'undefined') {
        console.error('[Error] สคริปต์นี้ต้องการ Node.js version 18 ขึ้นไป (เพื่อใช้ native fetch)');
        process.exit(1);
    }

    if (SUPABASE_URL === 'YOUR_SUPABASE_URL') {
        console.error('[Error] กรุณาตั้งค่า SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY');
        process.exit(1);
    }

    // ค่าเริ่มต้นคือ "ดึงข้อมูลของเมื่อวานและวันนี้" เพื่อป้องกันการตกหล่น
    const datesToSync = [];
    
    // ดึงวันที่วันนี้ (อิงตามเวลาเครื่อง NAS)
    const today = new Date();
    datesToSync.push(today.toISOString().split('T')[0]);

    // ดึงวันที่เมื่อวาน
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    datesToSync.push(yesterday.toISOString().split('T')[0]);

    for (const dateStr of datesToSync) {
        const messages = await fetchMessagesForDate(dateStr);
        saveLogFile(dateStr, messages);
    }

    console.log('--- กระบวนการเสร็จสมบูรณ์ ---');
}

main();
