const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DEFAULT_MEDIA_BASE_DIR = "Y:\\media";

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
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function importCsvBackups(backupDir, normalizedDir) {
  fs.mkdirSync(normalizedDir, { recursive: true });
  const manifestPath = path.join(normalizedDir, "csv-import-manifest.json");
  const manifest = loadImportManifest(manifestPath);
  const csvFiles = collectFiles(backupDir, ".csv").sort((a, b) => a.localeCompare(b));

  if (csvFiles.length === 0) {
    return {
      messages: [],
      importedFiles: [],
      note: "ไม่มี CSV backup ให้ import",
    };
  }

  const messages = [];
  const importedFiles = [];

  for (const filePath of csvFiles) {
    const relativeFile = path.relative(backupDir, filePath).split(path.sep).join("/");
    const sha1 = fileSha1(filePath);
    if (manifest.imported[relativeFile] && manifest.imported[relativeFile].sha1 === sha1) {
      continue;
    }

    const text = fs.readFileSync(filePath, "utf8");
    for (const parsedRow of parseCsv(text, { withLineNumbers: true })) {
      messages.push(normalizeCsvRow(parsedRow.row, relativeFile, parsedRow.lineNumber));
    }

    manifest.imported[relativeFile] = {
      sha1,
      imported_at: new Date().toISOString(),
    };
    importedFiles.push(relativeFile);
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

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

module.exports = {
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
  writeCaseState,
};
