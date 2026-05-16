const test = require("node:test");
const assert = require("node:assert/strict");

const {
  analyzeMessages,
  buildMarkdownReport,
} = require("./analyze-pending");

const NOW = new Date("2026-05-15T08:00:00.000Z");

function msg(overrides) {
  return {
    id: overrides.id ?? Math.floor(Math.random() * 100000),
    event_time: overrides.event_time,
    line_user_id: overrides.line_user_id ?? "U-test",
    display_name: overrides.display_name ?? "ลูกค้าทดสอบ",
    message_type: overrides.message_type ?? "text",
    text: overrides.text ?? "",
    media_path: overrides.media_path ?? null,
    raw_event: overrides.raw_event ?? {},
  };
}

test("flags old payment messages as high risk even when followed by thank-you only", () => {
  const result = analyzeMessages([
    msg({
      id: 1,
      event_time: "2026-05-13T02:00:00.000Z",
      text: "โอนมัดจำแล้วค่ะ",
    }),
    msg({
      id: 2,
      event_time: "2026-05-13T02:10:00.000Z",
      text: "ขอบคุณค่ะ",
    }),
  ], { now: NOW });

  assert.equal(result.highRisk.length, 1);
  assert.equal(result.highRisk[0].displayName, "ลูกค้าทดสอบ");
  assert.match(result.highRisk[0].reason, /โอน|มัดจำ/);
});

test("does not flag conversations that have a real close indicator after risky text", () => {
  const result = analyzeMessages([
    msg({
      id: 1,
      event_time: "2026-05-01T02:00:00.000Z",
      text: "งานผลิตป้ายไฟเริ่มได้เลยค่ะ",
    }),
    msg({
      id: 2,
      event_time: "2026-05-14T02:00:00.000Z",
      text: "ติดตั้งเรียบร้อยแล้วค่ะ",
    }),
  ], { now: NOW });

  assert.equal(result.highRisk.length, 0);
  assert.equal(result.review.length, 0);
});

test("puts stale quote requests into review with useful report text", () => {
  const result = analyzeMessages([
    msg({
      id: 1,
      event_time: "2026-05-13T07:00:00.000Z",
      line_user_id: "U-quote",
      display_name: "คุณสมชาย",
      text: "ขอราคาป้ายไวนิล 3x5 เมตรครับ",
    }),
  ], { now: NOW });

  assert.equal(result.review.length, 1);
  assert.equal(result.review[0].displayName, "คุณสมชาย");

  const report = buildMarkdownReport(result, { now: NOW });
  assert.match(report, /รายงานแชทที่ควรตรวจสอบ/);
  assert.match(report, /ควรตรวจสอบ/);
  assert.match(report, /คุณสมชาย/);
  assert.match(report, /ขอราคา/);
});

test("does not treat a plain price statement as a quote request", () => {
  const result = analyzeMessages([
    msg({
      id: 1,
      event_time: "2026-05-13T07:00:00.000Z",
      text: "ราคา 4,000 บาทครับ งานตัวหนังสือหัวกลม",
    }),
    msg({
      id: 2,
      event_time: "2026-05-14T08:29:05.000Z",
      text: "ครับ",
    }),
  ], { now: NOW });

  assert.equal(result.highRisk.length, 0);
  assert.equal(result.review.length, 0);
});

test("uses explicit amount question as quote request instead of earlier price edit text", () => {
  const result = analyzeMessages([
    msg({
      id: 1,
      event_time: "2026-05-14T03:50:50.000Z",
      text: "แล้วก็เปลี่ยนราคาเป็น 300 ค่ะ",
    }),
    msg({
      id: 2,
      event_time: "2026-05-14T03:54:25.000Z",
      text: "เท่าไหร่คะพี่",
    }),
  ], { now: NOW });

  assert.equal(result.review.length, 1);
  assert.equal(result.review[0].subject, "เท่าไหร่คะพี่");
});

test("snoozes a risky conversation when the customer says they will confirm later", () => {
  const result = analyzeMessages([
    msg({
      id: 1,
      event_time: "2026-05-13T06:43:26.000Z",
      text: "ขอเป็นใบเสนอราคาก่อนนะครับ",
    }),
    msg({
      id: 2,
      event_time: "2026-05-13T07:57:40.000Z",
      text: "ครับ เดียวแจ้งนะครับ รอลูกค้ายืนยันแบบมาก่อนครับ",
    }),
  ], { now: NOW });

  assert.equal(result.highRisk.length, 0);
  assert.equal(result.review.length, 0);
});

test("does not treat non-price amount questions as quote requests", () => {
  const result = analyzeMessages([
    msg({
      id: 1,
      event_time: "2026-05-14T02:48:00.000Z",
      text: "ต้องสเกลเท่าไหร่คะ",
    }),
  ], { now: NOW });

  assert.equal(result.highRisk.length, 0);
  assert.equal(result.review.length, 0);
});

test("does not treat casual today wording as urgent", () => {
  const result = analyzeMessages([
    msg({
      id: 1,
      event_time: "2026-05-14T03:54:00.000Z",
      text: "รอเพื่อนพี่ เข้าไปคุยก่อนนะ วันนี้แหละ",
    }),
  ], { now: NOW });

  assert.equal(result.highRisk.length, 0);
  assert.equal(result.review.length, 0);
});

test("keeps same-day pickup wording as urgent", () => {
  const result = analyzeMessages([
    msg({
      id: 1,
      event_time: "2026-05-14T02:54:00.000Z",
      text: "วันนี้ ให้น้องไปรับค่ะ",
    }),
  ], { now: NOW });

  assert.equal(result.highRisk.length, 1);
  assert.equal(result.highRisk[0].categories.includes("urgent"), true);
});

test("snoozes tomorrow follow-up promises from the customer", () => {
  const result = analyzeMessages([
    msg({
      id: 1,
      event_time: "2026-05-13T08:58:00.000Z",
      text: "เดี๋ยวขอส่ง PO ให้พรุ่งนี้ค่ะ",
    }),
  ], { now: NOW });

  assert.equal(result.highRisk.length, 0);
  assert.equal(result.review.length, 0);
});

test("includes recent conversation context and short customer id in report", () => {
  const result = analyzeMessages([
    msg({
      id: 1,
      event_time: "2026-05-13T06:40:00.000Z",
      line_user_id: "U1234567890abcdef",
      display_name: "คุณบอย",
      text: "ขอราคาป้ายไฟครับ",
    }),
    msg({
      id: 2,
      event_time: "2026-05-13T06:41:00.000Z",
      line_user_id: "U1234567890abcdef",
      display_name: "คุณบอย",
      message_type: "image",
      text: null,
    }),
    msg({
      id: 3,
      event_time: "2026-05-13T06:42:00.000Z",
      line_user_id: "U1234567890abcdef",
      display_name: "คุณบอย",
      text: "ตามรูปนี้เลยครับ",
    }),
  ], { now: NOW });

  const report = buildMarkdownReport(result, { now: NOW });

  assert.match(report, /รหัส: U123...cdef/);
  assert.match(report, /ข้อความล่าสุด:/);
  assert.match(report, /- ขอราคาป้ายไฟครับ/);
  assert.match(report, /- \[image\]/);
  assert.match(report, /- ตามรูปนี้เลยครับ/);
});

test("marks an image after payment wording as a possible transfer slip", () => {
  const result = analyzeMessages([
    msg({
      id: 1,
      event_time: "2026-05-13T06:40:00.000Z",
      line_user_id: "U-slip",
      display_name: "คุณแอน",
      text: "โอนมัดจำให้แล้วค่ะ",
    }),
    msg({
      id: 2,
      event_time: "2026-05-13T06:41:00.000Z",
      line_user_id: "U-slip",
      display_name: "คุณแอน",
      message_type: "image",
      text: null,
    }),
  ], { now: NOW });

  assert.equal(result.highRisk.length, 1);

  const report = buildMarkdownReport(result, { now: NOW });
  assert.match(report, /\[image: อาจเป็นสลิปโอนเงิน\]/);
});

test("includes local media file path when image has a media path", () => {
  const result = analyzeMessages([
    msg({
      id: 1,
      event_time: "2026-05-13T06:40:00.000Z",
      line_user_id: "U-slip",
      display_name: "คุณแอน",
      text: "โอนแล้วค่ะ",
    }),
    msg({
      id: 2,
      event_time: "2026-05-13T06:41:00.000Z",
      line_user_id: "U-slip",
      display_name: "คุณแอน",
      message_type: "image",
      text: null,
      media_path: "2026/05/13/U-slip/abc.jpg",
    }),
  ], { now: NOW, mediaBaseDir: "Y:\\media" });

  const report = buildMarkdownReport(result, { now: NOW });

  assert.match(report, /\[image: อาจเป็นสลิปโอนเงิน\]/);
  assert.match(report, /ไฟล์: Y:\\media\\2026\\05\\13\\U-slip\\abc\.jpg/);
});

test("does not mark unrelated images as possible transfer slips", () => {
  const result = analyzeMessages([
    msg({
      id: 1,
      event_time: "2026-05-13T06:40:00.000Z",
      line_user_id: "U-artwork",
      display_name: "คุณแอน",
      text: "ขอราคาป้ายไฟครับ",
    }),
    msg({
      id: 2,
      event_time: "2026-05-13T06:41:00.000Z",
      line_user_id: "U-artwork",
      display_name: "คุณแอน",
      message_type: "image",
      text: null,
    }),
  ], { now: NOW });

  const report = buildMarkdownReport(result, { now: NOW });
  assert.doesNotMatch(report, /\[image: อาจเป็นสลิปโอนเงิน\]/);
});
