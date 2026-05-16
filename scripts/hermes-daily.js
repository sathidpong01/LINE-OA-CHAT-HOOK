const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DEFAULT_RAW_LOG_DIR = "Y:\\raw_logs";
const DEFAULT_BACKUP_DIR = "Y:\\line_oa_backups";
const DEFAULT_NORMALIZED_DIR = "Y:\\normalized_logs";
const DEFAULT_CASE_STATE_PATH = "Y:\\case_state\\cases.json";
const DEFAULT_REPORT_DIR = "Y:\\reports";
const DEFAULT_MEDIA_BASE_DIR = "Y:\\media";
const LOOKBACK_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

function bangkokParts(date) {
  const shifted = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
  };
}

function bangkokLocalDate(year, month, day, hour) {
  return new Date(Date.UTC(year, month - 1, day, hour, 0, 0, 0) - BANGKOK_OFFSET_MS);
}

function formatBangkokDate(date) {
  const parts = bangkokParts(date);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function dailyWindow(now = new Date()) {
  const parts = bangkokParts(now);
  let end = bangkokLocalDate(parts.year, parts.month, parts.day, 8);
  if (now < end) {
    end = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  }

  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return {
    start,
    end,
    reportDate: formatBangkokDate(end),
  };
}

function loadCaseState(filePath) {
  if (!fs.existsSync(filePath)) return { cases: {} };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return { cases: {} };
  }
  if (
    parsed &&
    typeof parsed === "object" &&
    parsed.cases &&
    typeof parsed.cases === "object" &&
    !Array.isArray(parsed.cases)
  ) {
    return parsed;
  }
  return { cases: {} };
}

function writeCaseState(filePath, state) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
}

function collectFiles(rootDir, extension) {
  if (!fs.existsSync(rootDir)) return [];

  const files = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath, extension));
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === extension.toLowerCase()) {
      files.push(entryPath);
    }
  }

  return files;
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }

  values.push(value);
  return values;
}

function parseCsvRecords(text) {
  const normalizedText = String(text || "").replace(/^\uFEFF/, "");
  const records = [];
  let values = [];
  let value = "";
  let inQuotes = false;
  let lineNumber = 1;
  let recordLineNumber = 1;

  for (let index = 0; index < normalizedText.length; index += 1) {
    const char = normalizedText[index];
    const nextChar = normalizedText[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      values.push(value);
      if (values.some((field) => field.trim() !== "")) {
        records.push({ values, lineNumber: recordLineNumber });
      }
      values = [];
      value = "";
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      lineNumber += 1;
      recordLineNumber = lineNumber;
    } else if ((char === "\n" || char === "\r") && inQuotes) {
      value += "\n";
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      lineNumber += 1;
    } else {
      value += char;
    }
  }

  values.push(value);
  if (values.some((field) => field.trim() !== "")) {
    records.push({ values, lineNumber: recordLineNumber });
  }

  return records;
}

function parseCsv(text, options = {}) {
  const records = parseCsvRecords(text);
  if (records.length === 0) return [];

  const headers = records[0].values.map((header) => header.trim());
  return records.slice(1).map((record) => {
    const row = {};
    headers.forEach((header, index) => {
      row[header] = record.values[index] === undefined ? "" : record.values[index];
    });
    return options.withLineNumbers ? { row, lineNumber: record.lineNumber } : row;
  });
}

function firstValue(row, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) {
      const value = row[name];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return String(value).trim();
      }
    }
  }
  return "";
}

function parseCsvEventTime(value) {
  const trimmed = String(value || "").trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return trimmed;

  const [, year, month, day, hour, minute, second = "00"] = match;
  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      0,
    ) - BANGKOK_OFFSET_MS,
  );
  return Number.isNaN(date.getTime()) ? trimmed : date.toISOString();
}

function inferDirection(sender) {
  const normalized = String(sender || "").trim().toLowerCase();
  if (!normalized) return "unknown";
  if (
    normalized.includes("ร้าน") ||
    normalized.includes("แอดมิน") ||
    normalized.includes("admin") ||
    normalized.includes("shop") ||
    normalized.includes("oa")
  ) {
    return "shop";
  }
  if (
    normalized.includes("ลูกค้า") ||
    normalized.includes("customer") ||
    normalized.includes("user")
  ) {
    return "customer";
  }
  return "unknown";
}

function normalizeCsvRow(row, fileName, lineNumber) {
  const sender = firstValue(row, ["ผู้ส่ง", "sender", "Sender", "from", "From"]);
  const text = firstValue(row, ["ข้อความ", "message", "Message", "text", "Text"]);

  return {
    id: `csv:${fileName}:${lineNumber}`,
    source: "line_oa_csv",
    direction: inferDirection(sender),
    event_time: parseCsvEventTime(firstValue(row, ["เวลา", "time", "Time", "timestamp", "Timestamp"])),
    line_user_id: firstValue(row, ["User ID", "user_id", "line_user_id", "LINE User ID"]),
    display_name: firstValue(row, ["ชื่อลูกค้า", "display_name", "Display Name", "name", "Name"]),
    message_type: text ? "text" : firstValue(row, ["ประเภท", "message_type", "Message Type"]) || "unknown",
    text,
    raw_event: row,
  };
}

function loadImportManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) return { imported: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.imported &&
      typeof parsed.imported === "object" &&
      !Array.isArray(parsed.imported)
    ) {
      return parsed;
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.files &&
      typeof parsed.files === "object" &&
      !Array.isArray(parsed.files)
    ) {
      return { imported: parsed.files };
    }
  } catch {
    return { imported: {} };
  }
  return { imported: {} };
}

function fileSha1(filePath) {
  return crypto.createHash("sha1").update(fs.readFileSync(filePath)).digest("hex");
}

function loadPersistedCsvMessages(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePersistedCsvMessages(filePath, messages) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(messages, null, 2), "utf8");
}

function importCsvBackups(backupDir, normalizedDir) {
  fs.mkdirSync(backupDir, { recursive: true });
  fs.mkdirSync(normalizedDir, { recursive: true });
  const manifestPath = path.join(normalizedDir, "csv-import-manifest.json");
  const persistedMessagesPath = path.join(normalizedDir, "csv-messages.json");
  const manifest = loadImportManifest(manifestPath);
  let messages = loadPersistedCsvMessages(persistedMessagesPath);
  const csvFiles = collectFiles(backupDir, ".csv").sort((a, b) => a.localeCompare(b));

  if (csvFiles.length === 0) {
    return {
      messages,
      importedFiles: [],
      note: "ไม่มี CSV backup ให้ import",
    };
  }

  const importedFiles = [];

  for (const filePath of csvFiles) {
    const relativeFile = path.relative(backupDir, filePath).split(path.sep).join("/");
    const sha1 = fileSha1(filePath);
    if (manifest.imported[relativeFile] && manifest.imported[relativeFile].sha1 === sha1) {
      continue;
    }

    const text = fs.readFileSync(filePath, "utf8");
    const nextMessages = [];
    for (const parsedRow of parseCsv(text, { withLineNumbers: true })) {
      nextMessages.push(normalizeCsvRow(parsedRow.row, relativeFile, parsedRow.lineNumber));
    }

    const fileMessagePrefix = `csv:${relativeFile}:`;
    messages = messages.filter((message) => !String(message.id || "").startsWith(fileMessagePrefix));
    messages.push(...nextMessages);

    manifest.imported[relativeFile] = {
      sha1,
      imported_at: new Date().toISOString(),
    };
    importedFiles.push(relativeFile);
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  writePersistedCsvMessages(persistedMessagesPath, messages);

  return {
    messages,
    importedFiles,
    note: importedFiles.length > 0 ? "" : "ไม่มี CSV ใหม่ให้ import",
  };
}

function localMediaPath(baseMediaDir, objectPath) {
  if (!objectPath) return null;
  const parts = String(objectPath)
    .split(/[\\/]+/)
    .filter(Boolean);
  return path.join(baseMediaDir, ...parts);
}

function normalizeRawLogMessage(row, options = {}) {
  const mediaPath = row.media_path || null;
  return {
    id: `raw:${row.id}`,
    source: "raw_log",
    direction: "customer",
    event_time: row.event_time || row.created_at,
    line_user_id: row.line_user_id,
    display_name: row.display_name || "",
    message_type: row.message_type || "",
    text: row.text || "",
    media_path: mediaPath,
    media_file: mediaPath ? localMediaPath(options.mediaBaseDir || DEFAULT_MEDIA_BASE_DIR, mediaPath) : null,
  };
}

function loadRawLogMessages(rawLogDir, options = {}) {
  const startTime = options.start ? new Date(options.start).getTime() : Number.NEGATIVE_INFINITY;
  const endTime = options.end ? new Date(options.end).getTime() : Number.POSITIVE_INFINITY;
  const rows = [];

  for (const filePath of collectFiles(rawLogDir, ".json")) {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (Array.isArray(parsed)) {
      rows.push(...parsed);
    }
  }

  return rows
    .filter((row) => {
      const timestamp = row.event_time || row.created_at;
      const time = timestamp ? new Date(timestamp).getTime() : Number.NaN;
      return time >= startTime && time <= endTime;
    })
    .map((row) => normalizeRawLogMessage(row, options))
    .sort((a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime());
}

function messageTime(message) {
  const timestamp = message.event_time || message.created_at;
  return timestamp ? new Date(timestamp).getTime() : Number.NaN;
}

function groupByLineUser(messages) {
  const groups = new Map();

  for (const message of messages) {
    if (!message.line_user_id) continue;
    if (!groups.has(message.line_user_id)) {
      groups.set(message.line_user_id, []);
    }
    groups.get(message.line_user_id).push(message);
  }

  for (const group of groups.values()) {
    group.sort((a, b) => messageTime(a) - messageTime(b));
  }

  return groups;
}

function isInsideWindow(message, start, end) {
  const time = messageTime(message);
  return time >= start.getTime() && time <= end.getTime();
}

function buildContextCases(messages, options) {
  const windowStart = options.windowStart;
  const windowEnd = options.windowEnd;
  const lookbackDays = options.lookbackDays;
  const caseState = options.caseState || { cases: {} };
  const knownCases =
    caseState && caseState.cases && typeof caseState.cases === "object" && !Array.isArray(caseState.cases)
      ? caseState.cases
      : {};
  const lookbackStart = new Date(windowEnd.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const contextCases = [];

  for (const [lineUserId, groupMessages] of groupByLineUser(messages)) {
    const relevantMessages = groupMessages.filter((message) => isInsideWindow(message, lookbackStart, windowEnd));
    if (relevantMessages.length === 0) continue;

    const state = knownCases[lineUserId] || { status: "open" };
    const status = state.status || "open";
    const hasDailyActivity = relevantMessages.some((message) => isInsideWindow(message, windowStart, windowEnd));
    let includeReason = "";

    if (status === "closed" || status === "ignored") {
      if (!hasDailyActivity) continue;
      includeReason = `reactivated_${status}_case`;
    } else if (hasDailyActivity) {
      includeReason = "activity_in_daily_window";
    } else if (status === "open" || status === "watch" || status === "needs_owner") {
      includeReason = `existing_${status}_case`;
    } else {
      continue;
    }

    const latestMessage = relevantMessages[relevantMessages.length - 1];
    contextCases.push({
      line_user_id: lineUserId,
      display_name: latestMessage.display_name || "",
      status,
      state,
      include_reason: includeReason,
      latest_at: latestMessage.event_time || latestMessage.created_at,
      messages: relevantMessages,
    });
  }

  return contextCases.sort((a, b) => new Date(a.latest_at).getTime() - new Date(b.latest_at).getTime());
}

function formatIsoBangkok(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ไม่ทราบเวลา";

  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function renderMessage(message) {
  const time = formatIsoBangkok(message.event_time || message.created_at);
  const direction = message.direction || "unknown";
  const body = String(message.text || `[${message.message_type || "unknown"}]`);
  const bodyLines = body.split(/\r\n|\n|\r/);
  const lines = [`- ${time} ${direction}: ${bodyLines[0]}`];

  for (const continuation of bodyLines.slice(1)) {
    lines.push(`  | ${continuation}`);
  }

  if (message.media_file) {
    lines.push(`  media: ${message.media_file}`);
  }

  return lines.join("\n");
}

function renderHermesContext(input) {
  const importedFiles = input.importedFiles || [];
  const cases = input.cases || [];
  const lines = [
    "# Hermes Daily LINE OA Context",
    "",
    `Report date: ${input.reportDate}`,
    `Window start: ${input.windowStart instanceof Date ? input.windowStart.toISOString() : input.windowStart}`,
    `Window end: ${input.windowEnd instanceof Date ? input.windowEnd.toISOString() : input.windowEnd}`,
    "",
    "## CSV Enrichment",
    input.csvNote || "ไม่มีหมายเหตุ CSV",
    "",
    "Imported files:",
  ];

  if (importedFiles.length === 0) {
    lines.push("- ไม่มีไฟล์ CSV ที่ import ใหม่");
  } else {
    for (const filePath of importedFiles) {
      lines.push(`- ${filePath}`);
    }
  }

  lines.push(
    "",
    "## Hermes Instructions",
    "- วิเคราะห์ทุก conversation ในไฟล์นี้ ไม่ใช่เฉพาะ tag ที่ script ใส่ไว้",
    '- ถ้าไม่มี shop/admin messages ล่าสุด ให้ใช้คำว่า "ไม่พบคำตอบฝั่งร้านในข้อมูลที่มี"',
    "- ห้ามฟันธงว่าร้านไม่ได้ตอบ ถ้าข้อมูลมีเฉพาะ webhook inbound",
    "- ปิดเคสเองได้เฉพาะเมื่อหลักฐานชัด และต้องเขียน closed_evidence ใน cases.json",
    '- ถ้าไม่มั่นใจ ให้จัดไว้ในหัวข้อ "ถามเจ้าของร้าน"',
    "- รายงานสุดท้ายต้องมีหัวข้อ: ต้องดูทันที, ควรตรวจ, เฝ้าดู, ถามเจ้าของร้าน, ปิดงานอัตโนมัติวันนี้",
    "",
    "## Cases",
  );

  if (cases.length === 0) {
    lines.push("ไม่มี conversation ที่ต้องส่งให้ Hermes ในรอบนี้");
    return lines.join("\n");
  }

  cases.forEach((caseItem, index) => {
    lines.push(
      "",
      `### ${index + 1}. ${caseItem.display_name || caseItem.line_user_id || "ไม่ทราบชื่อ"}`,
      `line_user_id: ${caseItem.line_user_id || ""}`,
      `status: ${caseItem.status || ""}`,
      `include_reason: ${caseItem.include_reason || ""}`,
    );

    if (caseItem.state && caseItem.state.summary) {
      lines.push(`state_summary: ${caseItem.state.summary}`);
    }

    lines.push("", "Messages:");
    for (const message of caseItem.messages || []) {
      lines.push(renderMessage(message));
    }
  });

  return lines.join("\n");
}

function writeHermesContext(markdown, reportDir, reportDate) {
  fs.mkdirSync(reportDir, { recursive: true });
  const filePath = path.join(reportDir, `hermes-daily-context-${reportDate}.md`);
  fs.writeFileSync(filePath, markdown, "utf8");
  return filePath;
}

function byEventTimeAsc(left, right) {
  return messageTime(left) - messageTime(right);
}

function runCli(overrides = {}) {
  const now = overrides.now || new Date();
  const window = dailyWindow(now);
  const reportDate = window.reportDate;
  const rawLogDir = overrides.rawLogDir || process.env.RAW_LOG_DIR || DEFAULT_RAW_LOG_DIR;
  const backupDir = overrides.backupDir || process.env.LINE_OA_BACKUP_DIR || DEFAULT_BACKUP_DIR;
  const normalizedDir = overrides.normalizedDir || process.env.NORMALIZED_LOG_DIR || DEFAULT_NORMALIZED_DIR;
  const caseStatePath = overrides.caseStatePath || process.env.CASE_STATE_PATH || DEFAULT_CASE_STATE_PATH;
  const reportDir = overrides.reportDir || process.env.REPORT_DIR || DEFAULT_REPORT_DIR;
  const mediaBaseDir = overrides.mediaBaseDir || process.env.MEDIA_BASE_DIR || DEFAULT_MEDIA_BASE_DIR;
  const caseState = loadCaseState(caseStatePath);

  writeCaseState(caseStatePath, caseState);

  const rawMessages = loadRawLogMessages(rawLogDir, {
    start: new Date(window.end.getTime() - LOOKBACK_DAYS * DAY_MS),
    end: window.end,
    mediaBaseDir,
  });
  const csvImport = importCsvBackups(backupDir, normalizedDir);
  const allMessages = [...rawMessages, ...csvImport.messages].sort(byEventTimeAsc);
  const cases = buildContextCases(allMessages, {
    windowStart: window.start,
    windowEnd: window.end,
    lookbackDays: LOOKBACK_DAYS,
    caseState,
  });
  const markdown = renderHermesContext({
    reportDate,
    windowStart: window.start,
    windowEnd: window.end,
    csvNote: csvImport.note,
    importedFiles: csvImport.importedFiles,
    cases,
  });
  const contextPath = writeHermesContext(markdown, reportDir, reportDate);
  const normalizedPath = path.join(normalizedDir, `messages-${reportDate}.json`);

  fs.mkdirSync(normalizedDir, { recursive: true });
  fs.writeFileSync(normalizedPath, JSON.stringify(allMessages, null, 2), "utf8");

  return {
    reportDate,
    contextPath,
    normalizedPath,
    caseStatePath,
    rawMessageCount: rawMessages.length,
    csvMessageCount: csvImport.messages.length,
    caseCount: cases.length,
  };
}

module.exports = {
  DEFAULT_BACKUP_DIR,
  DEFAULT_CASE_STATE_PATH,
  DEFAULT_MEDIA_BASE_DIR,
  DEFAULT_NORMALIZED_DIR,
  DEFAULT_RAW_LOG_DIR,
  DEFAULT_REPORT_DIR,
  buildContextCases,
  dailyWindow,
  fileSha1,
  firstValue,
  groupByLineUser,
  importCsvBackups,
  inferDirection,
  isInsideWindow,
  loadCaseState,
  loadImportManifest,
  loadRawLogMessages,
  normalizeCsvRow,
  normalizeRawLogMessage,
  parseCsv,
  parseCsvEventTime,
  parseCsvLine,
  renderHermesContext,
  runCli,
  writeHermesContext,
  writeCaseState,
};

if (require.main === module) {
  const result = runCli();
  console.log(`reportDate: ${result.reportDate}`);
  console.log(`contextPath: ${result.contextPath}`);
  console.log(`normalizedPath: ${result.normalizedPath}`);
  console.log(`caseStatePath: ${result.caseStatePath}`);
  console.log(`rawMessageCount: ${result.rawMessageCount}`);
  console.log(`csvMessageCount: ${result.csvMessageCount}`);
  console.log(`caseCount: ${result.caseCount}`);
}
