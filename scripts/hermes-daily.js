const fs = require("fs");
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

module.exports = {
  dailyWindow,
  loadCaseState,
  loadRawLogMessages,
  normalizeRawLogMessage,
  writeCaseState,
};
