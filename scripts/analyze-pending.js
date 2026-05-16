const fs = require("fs");
const path = require("path");

const DEFAULT_RAW_LOG_DIR = "Y:\\raw_logs";
const DEFAULT_LOOKBACK_DAYS = Number(process.env.DEFAULT_LOOKBACK_DAYS || 30);
const DEFAULT_REPORT_DIR = path.join(__dirname, "..", "reports");
const DEFAULT_MEDIA_BASE_DIR = process.env.MEDIA_BASE_DIR || "Y:\\media";
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const KEYWORDS = {
  payment: ["โอน", "โอนแล้ว", "มัดจำ"],
  urgent: ["ด่วน", "ทำทันไหม"],
  production: ["ติดตั้ง", "ผลิต", "ป้ายไฟ", "แก้แบบ", "นัดรับ", "รอวัสดุ", "ส่งไฟล์", "ส่งแบบ"],
};

const QUOTE_PATTERNS = [
  /ขอ.{0,12}ราคา/u,
  /ใบเสนอราคา/u,
  /ราคา.{0,16}(เท่าไหร่|เท่าไร|ยังไง|อย่างไร|ดีสุด|ได้เท่านี้|ใช่ไหม|ไหม|มั้ย|ก่อน)/u,
  /(คิด|แจ้ง|เสนอ|ส่ง).{0,12}ราคา/u,
];

const PRICE_CONTEXT_PATTERN = /ราคา|ใบเสนอราคา|บาท|มัดจำ/u;
const AMOUNT_QUESTION_PATTERN = /เท่าไหร่|เท่าไร|กี่บาท/u;
const PAYMENT_CONTEXT_PATTERN = /โอน|มัดจำ|สลิป|บัญชี|ชำระ|จ่าย/u;
const URGENT_PATTERNS = [
  /ส่งทัน|ทำทัน|ทันไหม|ทันมั้ย/u,
  /(วันนี้|พรุ่งนี้).{0,16}(รับ|ไปรับ|ส่ง|ติดตั้ง|เสร็จ|ทัน)/u,
  /(รับ|ไปรับ|ส่ง|ติดตั้ง|เสร็จ).{0,16}(วันนี้|พรุ่งนี้)/u,
];

const CLOSE_INDICATORS = [
  "ส่งงานแล้ว",
  "ติดตั้งเรียบร้อย",
  "รับงานแล้ว",
  "ลูกค้ายกเลิก",
  "โอนครบแล้ว",
  "ปิดงาน",
  "เรียบร้อยค่ะ",
];

const CUSTOMER_WAITING_INDICATORS = [
  "เดี๋ยวแจ้ง",
  "เดียวแจ้ง",
  "รอลูกค้ายืนยัน",
];

const CUSTOMER_WAITING_PATTERNS = [
  /เดี๋ยว.{0,24}พรุ่งนี้/u,
  /เดียว.{0,24}พรุ่งนี้/u,
];

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function isThankOnly(text) {
  const normalized = normalizeText(text).replace(/[.!?。、]+$/g, "");
  return /^(ขอบคุณ|ขอบคุณค่ะ|ขอบคุณครับ|ขอบคุณคะ)$/.test(normalized);
}

function detectRisk(text, previousTexts = []) {
  const normalized = normalizeText(text);
  const categories = [];

  const hasDirectQuote = QUOTE_PATTERNS.some((pattern) => pattern.test(normalized));
  const hasContextualAmountQuestion =
    AMOUNT_QUESTION_PATTERN.test(normalized) &&
    previousTexts.some((previousText) => PRICE_CONTEXT_PATTERN.test(normalizeText(previousText)));

  if (hasDirectQuote || hasContextualAmountQuestion) {
    categories.push("quote");
  }

  if (URGENT_PATTERNS.some((pattern) => pattern.test(normalized)) && !isCustomerWaitingMessage(normalized)) {
    categories.push("urgent");
  }

  for (const [category, keywords] of Object.entries(KEYWORDS)) {
    if (includesAny(normalized, keywords)) categories.push(category);
  }

  return categories;
}

function isCustomerWaitingMessage(text) {
  const normalized = normalizeText(text);
  return includesAny(normalized, CUSTOMER_WAITING_INDICATORS) ||
    CUSTOMER_WAITING_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isCloseMessage(text) {
  const normalized = normalizeText(text);
  if (!normalized || isThankOnly(normalized)) return false;
  return includesAny(normalized, CLOSE_INDICATORS);
}

function groupMessages(messages) {
  const groups = new Map();

  for (const message of messages) {
    if (!message || !message.line_user_id) continue;
    const existing = groups.get(message.line_user_id) || [];
    existing.push(message);
    groups.set(message.line_user_id, existing);
  }

  for (const group of groups.values()) {
    group.sort((a, b) => new Date(a.event_time || a.created_at) - new Date(b.event_time || b.created_at));
  }

  return groups;
}

function formatDateTime(value, timeZone = "Asia/Bangkok") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ไม่ทราบเวลา";

  return new Intl.DateTimeFormat("th-TH", {
    timeZone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function summarizeSubject(text) {
  const normalized = normalizeText(text);
  if (!normalized) return "ข้อความไม่ใช่ตัวอักษร";
  return normalized.length > 42 ? `${normalized.slice(0, 42)}...` : normalized;
}

function hasPaymentContext(messages) {
  return messages.some((message) => PAYMENT_CONTEXT_PATTERN.test(normalizeText(message.text)));
}

function localMediaPath(mediaBaseDir, objectPath) {
  if (!objectPath) return null;
  return path.join(mediaBaseDir, ...String(objectPath).split("/"));
}

function summarizeMessage(message, previousMessages = [], options = {}) {
  const text = normalizeText(message.text);
  if (text) return summarizeSubject(text);
  const mediaFile = message.media_path
    ? localMediaPath(options.mediaBaseDir || DEFAULT_MEDIA_BASE_DIR, message.media_path)
    : null;
  const fileSuffix = mediaFile ? `\n  ไฟล์: ${mediaFile}` : "";
  if (message.message_type === "image" && hasPaymentContext(previousMessages)) {
    return `[image: อาจเป็นสลิปโอนเงิน]${fileSuffix}`;
  }
  return `[${message.message_type || "non-text"}]${fileSuffix}`;
}

function shortCustomerId(lineUserId) {
  const value = String(lineUserId || "");
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function buildReason(categories, ageHours) {
  const ageDays = Math.floor(ageHours / 24);
  const ageText = ageDays >= 1 ? `${ageDays} วัน` : `${Math.floor(ageHours)} ชม.`;

  if (categories.includes("payment")) {
    return `พบคำเกี่ยวกับการโอน/มัดจำ และยังไม่พบสัญญาณปิดเคสใน log นานประมาณ ${ageText}`;
  }

  if (categories.includes("urgent")) {
    return `พบคำเร่งด่วน และยังไม่พบสัญญาณปิดเคสใน log นานประมาณ ${ageText}`;
  }

  if (categories.includes("quote")) {
    return `ลูกค้าถามราคา/ใบเสนอราคา และยังไม่พบสัญญาณปิดเคสใน log นานประมาณ ${ageText}`;
  }

  return `พบคำเกี่ยวกับงานผลิต/ติดตั้ง และยังไม่พบสัญญาณปิดเคสใน log นานประมาณ ${ageText}`;
}

function classifyCase(categories, ageHours) {
  if (categories.includes("payment") && ageHours >= 24) return "highRisk";
  if (categories.includes("urgent") && ageHours >= 24) return "highRisk";
  if (categories.includes("quote") && ageHours >= 72) return "highRisk";
  if (categories.includes("production") && ageHours >= 24 * 30) return "review";
  if (categories.length > 0 && ageHours >= 24) return "review";
  return null;
}

function analyzeMessages(messages, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const timeZone = options.timeZone || process.env.TIMEZONE || "Asia/Bangkok";
  const mediaBaseDir = options.mediaBaseDir || DEFAULT_MEDIA_BASE_DIR;
  const result = {
    highRisk: [],
    review: [],
  };

  for (const [lineUserId, group] of groupMessages(messages)) {
    const riskyMessages = group
      .map((message, index) => ({
        message,
        index,
        categories: detectRisk(
          message.text,
          group.slice(Math.max(0, index - 3), index).map((previousMessage) => previousMessage.text),
        ),
      }))
      .filter((entry) => entry.categories.length > 0 && !isCloseMessage(entry.message.text));

    if (riskyMessages.length === 0) continue;

    const latestRisk = riskyMessages[riskyMessages.length - 1];
    const hasCloseAfterRisk = group
      .slice(latestRisk.index + 1)
      .some((message) => isCloseMessage(message.text));

    const hasWaitingAfterRisk = group
      .slice(latestRisk.index + 1)
      .some((message) => isCustomerWaitingMessage(message.text));

    if (hasCloseAfterRisk || hasWaitingAfterRisk) continue;

    const riskTime = new Date(latestRisk.message.event_time || latestRisk.message.created_at);
    if (Number.isNaN(riskTime.getTime())) continue;

    const ageHours = Math.max(0, (now - riskTime) / MS_PER_HOUR);
    const bucket = classifyCase(latestRisk.categories, ageHours);
    if (!bucket) continue;

    const latestMessage = group[group.length - 1];
    const recentRawMessages = group.slice(-3);
    const recentMessages = recentRawMessages.map((message, index) =>
      summarizeMessage(
        message,
        group.slice(0, group.length - recentRawMessages.length + index),
        { mediaBaseDir },
      ),
    );

    result[bucket].push({
      lineUserId,
      shortLineUserId: shortCustomerId(lineUserId),
      displayName: latestMessage.display_name || latestRisk.message.display_name || lineUserId,
      subject: summarizeSubject(latestRisk.message.text),
      latestAt: latestMessage.event_time || latestMessage.created_at,
      latestAtText: formatDateTime(latestMessage.event_time || latestMessage.created_at, timeZone),
      reason: buildReason(latestRisk.categories, ageHours),
      categories: latestRisk.categories,
      messageCount: group.length,
      recentMessages,
    });
  }

  result.highRisk.sort((a, b) => new Date(b.latestAt) - new Date(a.latestAt));
  result.review.sort((a, b) => new Date(b.latestAt) - new Date(a.latestAt));

  return result;
}

function renderSection(title, cases) {
  const lines = [title];
  if (cases.length === 0) {
    lines.push("ไม่มีเคสในกลุ่มนี้");
    return lines.join("\n");
  }

  cases.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.displayName} — ${item.subject}`);
    lines.push(`รหัส: ${item.shortLineUserId || shortCustomerId(item.lineUserId)}`);
    lines.push(`ล่าสุด: ${item.latestAtText}`);
    lines.push(`เหตุผล: ${item.reason}`);
    if (item.recentMessages && item.recentMessages.length > 0) {
      lines.push("ข้อความล่าสุด:");
      item.recentMessages.forEach((message) => {
        lines.push(`- ${message}`);
      });
    }
    lines.push("");
  });

  return lines.join("\n").trimEnd();
}

function buildMarkdownReport(analysis, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const timeZone = options.timeZone || process.env.TIMEZONE || "Asia/Bangkok";
  const generatedAt = formatDateTime(now, timeZone);

  return [
    "รายงานแชทที่ควรตรวจสอบ",
    "",
    `สร้างเมื่อ: ${generatedAt}`,
    "",
    renderSection("ค้างแน่ / เสี่ยงสูง", analysis.highRisk || []),
    "",
    renderSection("ควรตรวจสอบ", analysis.review || []),
    "",
  ].join("\n");
}

function collectJsonFiles(rootDir) {
  const files = [];
  if (!fs.existsSync(rootDir)) return files;

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      files.push(fullPath);
    }
  }

  return files;
}

function loadMessagesFromRawLogs(rawLogDir, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const lookbackDays = Number(options.lookbackDays || DEFAULT_LOOKBACK_DAYS);
  const cutoff = new Date(now.getTime() - lookbackDays * MS_PER_DAY);
  const messages = [];

  for (const filePath of collectJsonFiles(rawLogDir)) {
    const fileText = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(fileText);
    if (!Array.isArray(parsed)) continue;

    for (const message of parsed) {
      const eventTime = new Date(message.event_time || message.created_at);
      if (!Number.isNaN(eventTime.getTime()) && eventTime >= cutoff && eventTime <= now) {
        messages.push(message);
      }
    }
  }

  messages.sort((a, b) => new Date(a.event_time || a.created_at) - new Date(b.event_time || b.created_at));
  return messages;
}

function writeReport(report, reportDir, now = new Date()) {
  fs.mkdirSync(reportDir, { recursive: true });
  const date = now.toISOString().slice(0, 10);
  const filePath = path.join(reportDir, `report-${date}.md`);
  fs.writeFileSync(filePath, report, "utf8");
  return filePath;
}

function runCli() {
  const rawLogDir = process.env.RAW_LOG_DIR || DEFAULT_RAW_LOG_DIR;
  const reportDir = process.env.REPORT_DIR || DEFAULT_REPORT_DIR;
  const lookbackDays = Number(process.env.DEFAULT_LOOKBACK_DAYS || DEFAULT_LOOKBACK_DAYS);
  const now = new Date();

  const messages = loadMessagesFromRawLogs(rawLogDir, { now, lookbackDays });
  const analysis = analyzeMessages(messages, { now });
  const report = buildMarkdownReport(analysis, { now });
  const reportPath = writeReport(report, reportDir, now);

  console.log(`Read ${messages.length} messages from ${rawLogDir}`);
  console.log(`High risk: ${analysis.highRisk.length}`);
  console.log(`Review: ${analysis.review.length}`);
  console.log(`Report written: ${reportPath}`);
}

if (require.main === module) {
  runCli();
}

module.exports = {
  analyzeMessages,
  buildMarkdownReport,
  loadMessagesFromRawLogs,
  writeReport,
  detectRisk,
  isCloseMessage,
  isThankOnly,
  isCustomerWaitingMessage,
  shortCustomerId,
  localMediaPath,
};
