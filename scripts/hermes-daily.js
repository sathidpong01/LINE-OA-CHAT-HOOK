const fs = require("fs");
const path = require("path");

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

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

module.exports = {
  dailyWindow,
  loadCaseState,
  writeCaseState,
};
