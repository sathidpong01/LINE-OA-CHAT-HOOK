# Hermes Daily Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Hermes-run daily workflow that prepares an 08:00-to-08:00 LINE OA context, optionally merges manually downloaded CSV backups, respects local case state, and writes a context file for Hermes to analyze.

**Architecture:** Add a focused script, `scripts/hermes-daily.js`, with exported pure helpers and a small CLI. Keep raw logs immutable, store optional CSV import state under `Y:\normalized_logs`, store case state under `Y:\case_state`, and write generated context under `Y:\reports`.

**Tech Stack:** Node.js 18+ built-ins only (`fs`, `path`, `crypto`, `node:test`, `node:assert/strict`). No npm install.

---

## File Structure

- Create `scripts/hermes-daily.js`: daily workflow helpers and CLI.
- Create `scripts/hermes-daily.test.js`: unit tests using Node's built-in test runner.
- Modify `README.md`: add the Hermes daily workflow command and folder contract.
- Do not modify raw logs, Supabase schema, Edge Function, or NAS sync scripts for this feature.

The script should expose these helpers:

```js
module.exports = {
  dailyWindow,
  loadCaseState,
  writeCaseState,
  normalizeRawLogMessage,
  loadRawLogMessages,
  parseCsv,
  normalizeCsvRow,
  importCsvBackups,
  buildContextCases,
  renderHermesContext,
  writeHermesContext,
  runCli,
};
```

---

### Task 1: Daily Window And Case State

**Files:**
- Create: `scripts/hermes-daily.js`
- Create: `scripts/hermes-daily.test.js`

- [ ] **Step 1: Write failing tests for 08:00-to-08:00 window and case state initialization**

Add this to `scripts/hermes-daily.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  dailyWindow,
  loadCaseState,
  writeCaseState,
} = require("./hermes-daily");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hermes-daily-"));
}

test("dailyWindow returns previous 08:00 to current 08:00 after the morning cutoff", () => {
  const window = dailyWindow(new Date("2026-05-16T02:00:00.000Z"));

  assert.equal(window.start.toISOString(), "2026-05-15T01:00:00.000Z");
  assert.equal(window.end.toISOString(), "2026-05-16T01:00:00.000Z");
  assert.equal(window.reportDate, "2026-05-16");
});

test("dailyWindow uses the latest completed 08:00 cutoff before 08:00 Bangkok", () => {
  const window = dailyWindow(new Date("2026-05-16T00:30:00.000Z"));

  assert.equal(window.start.toISOString(), "2026-05-14T01:00:00.000Z");
  assert.equal(window.end.toISOString(), "2026-05-15T01:00:00.000Z");
  assert.equal(window.reportDate, "2026-05-15");
});

test("case state initializes when missing and preserves saved cases", () => {
  const dir = tempDir();
  const statePath = path.join(dir, "case_state", "cases.json");

  assert.deepEqual(loadCaseState(statePath), { cases: {} });

  writeCaseState(statePath, {
    cases: {
      "U-test": {
        status: "watch",
        summary: "รอผลิต",
      },
    },
  });

  assert.deepEqual(loadCaseState(statePath), {
    cases: {
      "U-test": {
        status: "watch",
        summary: "รอผลิต",
      },
    },
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test scripts\hermes-daily.test.js
```

Expected: FAIL with `Cannot find module './hermes-daily'`.

- [ ] **Step 3: Implement the minimal helpers**

Create `scripts/hermes-daily.js` with:

```js
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
  return parsed && typeof parsed === "object" && parsed.cases ? parsed : { cases: {} };
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
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node --test scripts\hermes-daily.test.js
```

Expected: PASS 3 tests.

- [ ] **Step 5: Commit Task 1**

Run:

```powershell
git add scripts\hermes-daily.js scripts\hermes-daily.test.js
git commit -m "feat: add hermes daily window state"
```

---

### Task 2: Normalize Raw Webhook Logs

**Files:**
- Modify: `scripts/hermes-daily.js`
- Modify: `scripts/hermes-daily.test.js`

- [ ] **Step 1: Write failing tests for raw log normalization**

Append to `scripts/hermes-daily.test.js`:

```js
const {
  normalizeRawLogMessage,
  loadRawLogMessages,
} = require("./hermes-daily");

test("normalizeRawLogMessage marks webhook rows as customer messages with local media path", () => {
  const result = normalizeRawLogMessage({
    id: 10,
    event_time: "2026-05-15T03:00:00.000Z",
    created_at: "2026-05-15T03:00:01.000Z",
    line_user_id: "U-customer",
    display_name: "คุณเอ",
    message_type: "image",
    text: null,
    media_path: "2026/05/15/U-customer/slip.jpg",
  }, { mediaBaseDir: "Y:\\media" });

  assert.deepEqual(result, {
    id: "raw:10",
    source: "raw_log",
    direction: "customer",
    event_time: "2026-05-15T03:00:00.000Z",
    line_user_id: "U-customer",
    display_name: "คุณเอ",
    message_type: "image",
    text: "",
    media_path: "2026/05/15/U-customer/slip.jpg",
    media_file: path.join("Y:\\media", "2026", "05", "15", "U-customer", "slip.jpg"),
  });
});

test("loadRawLogMessages reads only messages inside a time range", () => {
  const dir = tempDir();
  const logDir = path.join(dir, "raw_logs", "2026", "05");
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(logDir, "15.json"), JSON.stringify([
    {
      id: 1,
      event_time: "2026-05-15T00:59:59.000Z",
      line_user_id: "U-before",
      message_type: "text",
      text: "ก่อนรอบ",
    },
    {
      id: 2,
      event_time: "2026-05-15T01:00:00.000Z",
      line_user_id: "U-inside",
      display_name: "คุณในรอบ",
      message_type: "text",
      text: "อยู่ในรอบ",
    },
    {
      id: 3,
      event_time: "2026-05-16T01:00:01.000Z",
      line_user_id: "U-after",
      message_type: "text",
      text: "หลังรอบ",
    }
  ], null, 2), "utf8");

  const messages = loadRawLogMessages(path.join(dir, "raw_logs"), {
    start: new Date("2026-05-15T01:00:00.000Z"),
    end: new Date("2026-05-16T01:00:00.000Z"),
    mediaBaseDir: "Y:\\media",
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].id, "raw:2");
  assert.equal(messages[0].direction, "customer");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test scripts\hermes-daily.test.js
```

Expected: FAIL with `normalizeRawLogMessage is not a function`.

- [ ] **Step 3: Implement raw log loading helpers**

Add these functions to `scripts/hermes-daily.js`:

```js
function collectFiles(rootDir, extension) {
  const files = [];
  if (!fs.existsSync(rootDir)) return files;

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(fullPath, extension));
    if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) files.push(fullPath);
  }

  return files;
}

function localMediaPath(baseMediaDir, objectPath) {
  if (!objectPath) return null;
  return path.join(baseMediaDir, ...String(objectPath).split("/"));
}

function normalizeRawLogMessage(row, options = {}) {
  const mediaBaseDir = options.mediaBaseDir || "Y:\\media";
  const mediaPath = row.media_path || null;

  return {
    id: `raw:${row.id}`,
    source: "raw_log",
    direction: "customer",
    event_time: row.event_time || row.created_at,
    line_user_id: row.line_user_id,
    display_name: row.display_name || row.line_user_id,
    message_type: row.message_type || "unknown",
    text: row.text || "",
    media_path: mediaPath,
    media_file: mediaPath ? localMediaPath(mediaBaseDir, mediaPath) : null,
  };
}

function loadRawLogMessages(rawLogDir, options = {}) {
  const start = options.start;
  const end = options.end;
  const messages = [];

  for (const filePath of collectFiles(rawLogDir, ".json")) {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(parsed)) continue;

    for (const row of parsed) {
      const eventTime = new Date(row.event_time || row.created_at);
      if (Number.isNaN(eventTime.valueOf())) continue;
      if (start && eventTime < start) continue;
      if (end && eventTime > end) continue;
      messages.push(normalizeRawLogMessage(row, options));
    }
  }

  messages.sort((a, b) => new Date(a.event_time) - new Date(b.event_time));
  return messages;
}
```

Update `module.exports` to include `normalizeRawLogMessage` and `loadRawLogMessages`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node --test scripts\hermes-daily.test.js
```

Expected: PASS 5 tests.

- [ ] **Step 5: Commit Task 2**

Run:

```powershell
git add scripts\hermes-daily.js scripts\hermes-daily.test.js
git commit -m "feat: normalize hermes raw logs"
```

---

### Task 3: Optional CSV Import With Manifest

**Files:**
- Modify: `scripts/hermes-daily.js`
- Modify: `scripts/hermes-daily.test.js`

- [ ] **Step 1: Write failing tests for CSV parsing and optional import**

Append to `scripts/hermes-daily.test.js`:

```js
const {
  parseCsv,
  normalizeCsvRow,
  importCsvBackups,
} = require("./hermes-daily");

test("parseCsv handles quoted commas and Thai headers", () => {
  const rows = parseCsv("เวลา,ผู้ส่ง,ข้อความ\\n\"2026-05-15 09:10\",\"ร้าน\",\"รับทราบ, เดี๋ยวเช็กให้\"\\n");

  assert.deepEqual(rows, [
    {
      "เวลา": "2026-05-15 09:10",
      "ผู้ส่ง": "ร้าน",
      "ข้อความ": "รับทราบ, เดี๋ยวเช็กให้",
    },
  ]);
});

test("normalizeCsvRow maps shop backup rows into normalized messages", () => {
  const result = normalizeCsvRow({
    "เวลา": "2026-05-15 09:10",
    "ผู้ส่ง": "ร้าน",
    "ชื่อลูกค้า": "คุณเอ",
    "User ID": "U-customer",
    "ข้อความ": "รับทราบค่ะ",
  }, "backup.csv", 2);

  assert.equal(result.id, "csv:backup.csv:2");
  assert.equal(result.source, "line_oa_csv");
  assert.equal(result.direction, "shop");
  assert.equal(result.line_user_id, "U-customer");
  assert.equal(result.display_name, "คุณเอ");
  assert.equal(result.text, "รับทราบค่ะ");
  assert.equal(result.message_type, "text");
});

test("importCsvBackups skips missing folders and records imported files", () => {
  const dir = tempDir();
  const backupDir = path.join(dir, "line_oa_backups");
  const normalizedDir = path.join(dir, "normalized_logs");

  let result = importCsvBackups(backupDir, normalizedDir);
  assert.equal(result.importedFiles.length, 0);
  assert.equal(result.messages.length, 0);
  assert.match(result.note, /ไม่มี CSV/);

  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(backupDir, "backup.csv"), [
    "เวลา,ผู้ส่ง,ชื่อลูกค้า,User ID,ข้อความ",
    "2026-05-15 09:10,ร้าน,คุณเอ,U-customer,รับทราบค่ะ",
  ].join("\\n"), "utf8");

  result = importCsvBackups(backupDir, normalizedDir);
  assert.deepEqual(result.importedFiles, ["backup.csv"]);
  assert.equal(result.messages.length, 1);

  const secondRun = importCsvBackups(backupDir, normalizedDir);
  assert.deepEqual(secondRun.importedFiles, []);
  assert.equal(secondRun.messages.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test scripts\hermes-daily.test.js
```

Expected: FAIL with `parseCsv is not a function`.

- [ ] **Step 3: Implement CSV parser, normalizer, and manifest**

Add these functions to `scripts/hermes-daily.js`:

```js
const crypto = require("crypto");

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function parseCsv(text) {
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function firstValue(row, names) {
  for (const name of names) {
    if (row[name]) return row[name];
  }
  return "";
}

function parseCsvEventTime(value) {
  const trimmed = String(value || "").trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return trimmed;

  const [, year, month, day, hour, minute, second = "00"] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)) - BANGKOK_OFFSET_MS).toISOString();
}

function inferDirection(sender) {
  const text = String(sender || "").toLowerCase();
  if (/ร้าน|admin|แอดมิน|oa|official/.test(text)) return "shop";
  if (/ลูกค้า|customer|user/.test(text)) return "customer";
  return "unknown";
}

function normalizeCsvRow(row, fileName, lineNumber) {
  const sender = firstValue(row, ["ผู้ส่ง", "sender", "Sender", "From"]);
  const text = firstValue(row, ["ข้อความ", "message", "Message", "Text"]);
  const userId = firstValue(row, ["User ID", "userId", "line_user_id", "LINE User ID"]);
  const displayName = firstValue(row, ["ชื่อลูกค้า", "display_name", "Display Name", "Name"]);
  const rawTime = firstValue(row, ["เวลา", "Time", "Timestamp", "created_at"]);

  return {
    id: `csv:${fileName}:${lineNumber}`,
    source: "line_oa_csv",
    direction: inferDirection(sender),
    event_time: parseCsvEventTime(rawTime),
    line_user_id: userId || displayName || `csv:${crypto.createHash("sha1").update(`${fileName}:${displayName}:${sender}`).digest("hex").slice(0, 12)}`,
    display_name: displayName || userId || "ไม่ทราบชื่อ",
    message_type: text ? "text" : "unknown",
    text,
    media_path: null,
    media_file: null,
  };
}

function loadImportManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) return { imported: {} };
  const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return parsed && parsed.imported ? parsed : { imported: {} };
}

function fileSha1(filePath) {
  return crypto.createHash("sha1").update(fs.readFileSync(filePath)).digest("hex");
}

function importCsvBackups(backupDir, normalizedDir) {
  fs.mkdirSync(backupDir, { recursive: true });
  fs.mkdirSync(normalizedDir, { recursive: true });

  const manifestPath = path.join(normalizedDir, "csv-import-manifest.json");
  const manifest = loadImportManifest(manifestPath);
  const files = collectFiles(backupDir, ".csv").sort();
  const messages = [];
  const importedFiles = [];

  if (files.length === 0) {
    return { messages, importedFiles, note: "ไม่มี CSV backup ใหม่ให้ import" };
  }

  for (const filePath of files) {
    const fileName = path.basename(filePath);
    const sha1 = fileSha1(filePath);
    if (manifest.imported[fileName] === sha1) continue;

    const rows = parseCsv(fs.readFileSync(filePath, "utf8"));
    rows.forEach((row, index) => {
      messages.push(normalizeCsvRow(row, fileName, index + 2));
    });
    manifest.imported[fileName] = sha1;
    importedFiles.push(fileName);
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return {
    messages,
    importedFiles,
    note: importedFiles.length > 0 ? `import CSV ใหม่ ${importedFiles.length} ไฟล์` : "ไม่มี CSV backup ใหม่ให้ import",
  };
}
```

Update `module.exports` to include `parseCsv`, `normalizeCsvRow`, and `importCsvBackups`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node --test scripts\hermes-daily.test.js
```

Expected: PASS 8 tests.

- [ ] **Step 5: Commit Task 3**

Run:

```powershell
git add scripts\hermes-daily.js scripts\hermes-daily.test.js
git commit -m "feat: import optional line oa csv backups"
```

---

### Task 4: Build Context Cases With Case-State Rules

**Files:**
- Modify: `scripts/hermes-daily.js`
- Modify: `scripts/hermes-daily.test.js`

- [ ] **Step 1: Write failing tests for context selection**

Append to `scripts/hermes-daily.test.js`:

```js
const {
  buildContextCases,
} = require("./hermes-daily");

function normalized(overrides) {
  return {
    id: overrides.id || `m-${Math.random()}`,
    source: overrides.source || "raw_log",
    direction: overrides.direction || "customer",
    event_time: overrides.event_time,
    line_user_id: overrides.line_user_id,
    display_name: overrides.display_name || overrides.line_user_id,
    message_type: overrides.message_type || "text",
    text: overrides.text || "",
    media_path: overrides.media_path || null,
    media_file: overrides.media_file || null,
  };
}

test("buildContextCases includes daily activity and open cases from 90 day lookback", () => {
  const cases = buildContextCases([
    normalized({
      id: "daily",
      event_time: "2026-05-15T03:00:00.000Z",
      line_user_id: "U-daily",
      text: "ขอราคาค่ะ",
    }),
    normalized({
      id: "old-open",
      event_time: "2026-04-10T03:00:00.000Z",
      line_user_id: "U-open",
      text: "งานผลิตถึงไหนแล้วคะ",
    }),
    normalized({
      id: "old-closed",
      event_time: "2026-04-10T03:00:00.000Z",
      line_user_id: "U-closed",
      text: "ติดตั้งเรียบร้อย",
    }),
  ], {
    windowStart: new Date("2026-05-15T01:00:00.000Z"),
    windowEnd: new Date("2026-05-16T01:00:00.000Z"),
    lookbackDays: 90,
    caseState: {
      cases: {
        "U-open": { status: "watch", summary: "รอผลิต" },
        "U-closed": { status: "closed", summary: "ปิดแล้ว" },
      },
    },
  });

  assert.deepEqual(cases.map((item) => item.line_user_id), ["U-open", "U-daily"]);
  assert.equal(cases[0].include_reason, "existing_watch_case");
  assert.equal(cases[1].include_reason, "activity_in_daily_window");
});

test("buildContextCases includes closed cases only when new activity appears in the daily window", () => {
  const cases = buildContextCases([
    normalized({
      id: "reactivated",
      event_time: "2026-05-15T03:00:00.000Z",
      line_user_id: "U-closed",
      text: "สอบถามเพิ่มค่ะ",
    }),
  ], {
    windowStart: new Date("2026-05-15T01:00:00.000Z"),
    windowEnd: new Date("2026-05-16T01:00:00.000Z"),
    lookbackDays: 90,
    caseState: {
      cases: {
        "U-closed": { status: "closed", summary: "ปิดแล้ว" },
      },
    },
  });

  assert.equal(cases.length, 1);
  assert.equal(cases[0].include_reason, "reactivated_closed_case");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test scripts\hermes-daily.test.js
```

Expected: FAIL with `buildContextCases is not a function`.

- [ ] **Step 3: Implement context selection**

Add these functions to `scripts/hermes-daily.js`:

```js
function groupByLineUser(messages) {
  const groups = new Map();
  for (const message of messages) {
    if (!message.line_user_id) continue;
    const group = groups.get(message.line_user_id) || [];
    group.push(message);
    groups.set(message.line_user_id, group);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => new Date(a.event_time) - new Date(b.event_time));
  }
  return groups;
}

function isInsideWindow(message, start, end) {
  const time = new Date(message.event_time);
  return !Number.isNaN(time.valueOf()) && time >= start && time <= end;
}

function buildContextCases(messages, options) {
  const windowStart = options.windowStart;
  const windowEnd = options.windowEnd;
  const lookbackStart = new Date(windowEnd.getTime() - Number(options.lookbackDays || 90) * 24 * 60 * 60 * 1000);
  const caseState = options.caseState || { cases: {} };
  const cases = [];

  for (const [lineUserId, group] of groupByLineUser(messages)) {
    const state = caseState.cases[lineUserId] || { status: "open" };
    const status = state.status || "open";
    const hasDailyActivity = group.some((message) => isInsideWindow(message, windowStart, windowEnd));
    const relevantMessages = group.filter((message) => {
      const time = new Date(message.event_time);
      return !Number.isNaN(time.valueOf()) && time >= lookbackStart && time <= windowEnd;
    });

    if (relevantMessages.length === 0) continue;

    let includeReason = null;
    if ((status === "closed" || status === "ignored") && hasDailyActivity) {
      includeReason = status === "closed" ? "reactivated_closed_case" : "reactivated_ignored_case";
    } else if (status === "closed" || status === "ignored") {
      continue;
    } else if (hasDailyActivity) {
      includeReason = "activity_in_daily_window";
    } else if (status === "open" || status === "watch" || status === "needs_owner") {
      includeReason = `existing_${status}_case`;
    }

    if (!includeReason) continue;

    cases.push({
      line_user_id: lineUserId,
      display_name: relevantMessages[relevantMessages.length - 1].display_name || lineUserId,
      status,
      state,
      include_reason: includeReason,
      latest_at: relevantMessages[relevantMessages.length - 1].event_time,
      messages: relevantMessages,
    });
  }

  cases.sort((a, b) => new Date(a.latest_at) - new Date(b.latest_at));
  return cases;
}
```

Update `module.exports` to include `buildContextCases`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node --test scripts\hermes-daily.test.js
```

Expected: PASS 10 tests.

- [ ] **Step 5: Commit Task 4**

Run:

```powershell
git add scripts\hermes-daily.js scripts\hermes-daily.test.js
git commit -m "feat: select hermes daily context cases"
```

---

### Task 5: Render And Write Hermes Context

**Files:**
- Modify: `scripts/hermes-daily.js`
- Modify: `scripts/hermes-daily.test.js`

- [ ] **Step 1: Write failing tests for Markdown context rendering**

Append to `scripts/hermes-daily.test.js`:

```js
const {
  renderHermesContext,
  writeHermesContext,
} = require("./hermes-daily");

test("renderHermesContext includes instructions, CSV note, cases, shop messages, and media paths", () => {
  const markdown = renderHermesContext({
    reportDate: "2026-05-16",
    windowStart: new Date("2026-05-15T01:00:00.000Z"),
    windowEnd: new Date("2026-05-16T01:00:00.000Z"),
    csvNote: "ไม่มี CSV backup ใหม่ให้ import",
    importedFiles: [],
    cases: [{
      line_user_id: "U-test",
      display_name: "คุณเอ",
      status: "watch",
      include_reason: "activity_in_daily_window",
      state: { status: "watch", summary: "รอผลิต" },
      messages: [
        normalized({
          id: "m1",
          direction: "customer",
          event_time: "2026-05-15T03:00:00.000Z",
          line_user_id: "U-test",
          display_name: "คุณเอ",
          text: "โอนมัดจำแล้วค่ะ",
        }),
        normalized({
          id: "m2",
          source: "line_oa_csv",
          direction: "shop",
          event_time: "2026-05-15T03:05:00.000Z",
          line_user_id: "U-test",
          display_name: "คุณเอ",
          text: "รับทราบค่ะ",
        }),
        normalized({
          id: "m3",
          direction: "customer",
          event_time: "2026-05-15T03:06:00.000Z",
          line_user_id: "U-test",
          display_name: "คุณเอ",
          message_type: "image",
          media_file: "Y:\\media\\2026\\05\\15\\U-test\\slip.jpg",
        }),
      ],
    }],
  });

  assert.match(markdown, /Hermes Daily LINE OA Context/);
  assert.match(markdown, /ไม่พบคำตอบฝั่งร้านในข้อมูลที่มี/);
  assert.match(markdown, /ปิดงานอัตโนมัติวันนี้/);
  assert.match(markdown, /คุณเอ/);
  assert.match(markdown, /customer: โอนมัดจำแล้วค่ะ/);
  assert.match(markdown, /shop: รับทราบค่ะ/);
  assert.match(markdown, /media: Y:\\media\\2026\\05\\15\\U-test\\slip\.jpg/);
});

test("writeHermesContext writes report-date named context files", () => {
  const dir = tempDir();
  const filePath = writeHermesContext("hello", dir, "2026-05-16");

  assert.equal(filePath, path.join(dir, "hermes-daily-context-2026-05-16.md"));
  assert.equal(fs.readFileSync(filePath, "utf8"), "hello");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test scripts\hermes-daily.test.js
```

Expected: FAIL with `renderHermesContext is not a function`.

- [ ] **Step 3: Implement context renderer**

Add these functions to `scripts/hermes-daily.js`:

```js
function formatIsoBangkok(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "ไม่ทราบเวลา";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date).replace(" ", " ");
}

function renderMessage(message) {
  const time = formatIsoBangkok(message.event_time);
  const direction = message.direction || "unknown";
  const body = message.text || `[${message.message_type || "non-text"}]`;
  const lines = [`- ${time} ${direction}: ${body}`];
  if (message.media_file) lines.push(`  media: ${message.media_file}`);
  return lines.join("\n");
}

function renderHermesContext(input) {
  const lines = [
    "# Hermes Daily LINE OA Context",
    "",
    `Report date: ${input.reportDate}`,
    `Window: ${input.windowStart.toISOString()} -> ${input.windowEnd.toISOString()}`,
    `CSV enrichment: ${input.csvNote}`,
    `Imported CSV files: ${(input.importedFiles || []).join(", ") || "none"}`,
    "",
    "## Hermes Instructions",
    "",
    "- วิเคราะห์ทุก conversation ในไฟล์นี้ ไม่ใช่เฉพาะ tag ที่ script ใส่ไว้",
    "- ถ้าไม่มี shop/admin messages ล่าสุด ให้ใช้คำว่า \"ไม่พบคำตอบฝั่งร้านในข้อมูลที่มี\"",
    "- ห้ามฟันธงว่าร้านไม่ได้ตอบ ถ้าข้อมูลมีเฉพาะ webhook inbound",
    "- ปิดเคสเองได้เฉพาะเมื่อหลักฐานชัด และต้องเขียน closed_evidence ใน cases.json",
    "- ถ้าไม่มั่นใจ ให้จัดไว้ในหัวข้อ \"ถามเจ้าของร้าน\"",
    "- รายงานสุดท้ายต้องมีหัวข้อ: ต้องดูทันที, ควรตรวจ, เฝ้าดู, ถามเจ้าของร้าน, ปิดงานอัตโนมัติวันนี้",
    "",
    "## Cases",
    "",
  ];

  if (!input.cases || input.cases.length === 0) {
    lines.push("ไม่มี conversation ที่ต้องส่งให้ Hermes ในรอบนี้");
    return lines.join("\n");
  }

  input.cases.forEach((item, index) => {
    lines.push(`### ${index + 1}. ${item.display_name} (${item.line_user_id})`);
    lines.push("");
    lines.push(`status: ${item.status}`);
    lines.push(`include_reason: ${item.include_reason}`);
    if (item.state && item.state.summary) lines.push(`state_summary: ${item.state.summary}`);
    lines.push("");
    lines.push("messages:");
    item.messages.forEach((message) => lines.push(renderMessage(message)));
    lines.push("");
  });

  return lines.join("\n").trimEnd();
}

function writeHermesContext(markdown, reportDir, reportDate) {
  fs.mkdirSync(reportDir, { recursive: true });
  const filePath = path.join(reportDir, `hermes-daily-context-${reportDate}.md`);
  fs.writeFileSync(filePath, markdown, "utf8");
  return filePath;
}
```

Update `module.exports` to include `renderHermesContext` and `writeHermesContext`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node --test scripts\hermes-daily.test.js
```

Expected: PASS 12 tests.

- [ ] **Step 5: Commit Task 5**

Run:

```powershell
git add scripts\hermes-daily.js scripts\hermes-daily.test.js
git commit -m "feat: render hermes daily context"
```

---

### Task 6: CLI Wiring And README

**Files:**
- Modify: `scripts/hermes-daily.js`
- Modify: `scripts/hermes-daily.test.js`
- Modify: `README.md`

- [ ] **Step 1: Write failing test for CLI orchestration helper**

Append to `scripts/hermes-daily.test.js`:

```js
const {
  runCli,
} = require("./hermes-daily");

test("runCli creates directories and writes a Hermes daily context", () => {
  const dir = tempDir();
  const rawLogDir = path.join(dir, "raw_logs", "2026", "05");
  fs.mkdirSync(rawLogDir, { recursive: true });
  fs.writeFileSync(path.join(rawLogDir, "15.json"), JSON.stringify([
    {
      id: 1,
      event_time: "2026-05-15T03:00:00.000Z",
      line_user_id: "U-test",
      display_name: "คุณเอ",
      message_type: "text",
      text: "ขอราคา",
    }
  ], null, 2), "utf8");

  const result = runCli({
    now: new Date("2026-05-16T02:00:00.000Z"),
    rawLogDir: path.join(dir, "raw_logs"),
    backupDir: path.join(dir, "line_oa_backups"),
    normalizedDir: path.join(dir, "normalized_logs"),
    caseStatePath: path.join(dir, "case_state", "cases.json"),
    reportDir: path.join(dir, "reports"),
    mediaBaseDir: path.join(dir, "media"),
  });

  assert.equal(result.reportDate, "2026-05-16");
  assert.equal(fs.existsSync(result.contextPath), true);
  assert.match(fs.readFileSync(result.contextPath, "utf8"), /คุณเอ/);
  assert.equal(fs.existsSync(path.join(dir, "case_state", "cases.json")), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test scripts\hermes-daily.test.js
```

Expected: FAIL with `runCli is not a function` or a missing return value.

- [ ] **Step 3: Implement CLI orchestration**

Add constants and `runCli` to `scripts/hermes-daily.js`:

```js
const DEFAULT_RAW_LOG_DIR = "Y:\\raw_logs";
const DEFAULT_BACKUP_DIR = "Y:\\line_oa_backups";
const DEFAULT_NORMALIZED_DIR = "Y:\\normalized_logs";
const DEFAULT_CASE_STATE_PATH = "Y:\\case_state\\cases.json";
const DEFAULT_REPORT_DIR = "Y:\\reports";
const DEFAULT_MEDIA_BASE_DIR = "Y:\\media";

function runCli(overrides = {}) {
  const now = overrides.now || new Date();
  const window = dailyWindow(now);
  const rawLogDir = overrides.rawLogDir || process.env.RAW_LOG_DIR || DEFAULT_RAW_LOG_DIR;
  const backupDir = overrides.backupDir || process.env.LINE_OA_BACKUP_DIR || DEFAULT_BACKUP_DIR;
  const normalizedDir = overrides.normalizedDir || process.env.NORMALIZED_LOG_DIR || DEFAULT_NORMALIZED_DIR;
  const caseStatePath = overrides.caseStatePath || process.env.CASE_STATE_PATH || DEFAULT_CASE_STATE_PATH;
  const reportDir = overrides.reportDir || process.env.REPORT_DIR || DEFAULT_REPORT_DIR;
  const mediaBaseDir = overrides.mediaBaseDir || process.env.MEDIA_BASE_DIR || DEFAULT_MEDIA_BASE_DIR;

  const caseState = loadCaseState(caseStatePath);
  writeCaseState(caseStatePath, caseState);

  const rawMessages = loadRawLogMessages(rawLogDir, {
    start: new Date(window.end.getTime() - 90 * 24 * 60 * 60 * 1000),
    end: window.end,
    mediaBaseDir,
  });
  const csvImport = importCsvBackups(backupDir, normalizedDir);
  const allMessages = [...rawMessages, ...csvImport.messages].sort((a, b) => new Date(a.event_time) - new Date(b.event_time));
  const cases = buildContextCases(allMessages, {
    windowStart: window.start,
    windowEnd: window.end,
    lookbackDays: 90,
    caseState,
  });
  const markdown = renderHermesContext({
    reportDate: window.reportDate,
    windowStart: window.start,
    windowEnd: window.end,
    csvNote: csvImport.note,
    importedFiles: csvImport.importedFiles,
    cases,
  });
  const contextPath = writeHermesContext(markdown, reportDir, window.reportDate);

  const normalizedPath = path.join(normalizedDir, `messages-${window.reportDate}.json`);
  fs.mkdirSync(normalizedDir, { recursive: true });
  fs.writeFileSync(normalizedPath, JSON.stringify(allMessages, null, 2), "utf8");

  return {
    reportDate: window.reportDate,
    contextPath,
    normalizedPath,
    caseStatePath,
    rawMessageCount: rawMessages.length,
    csvMessageCount: csvImport.messages.length,
    caseCount: cases.length,
  };
}

if (require.main === module) {
  const result = runCli();
  console.log(`Report date: ${result.reportDate}`);
  console.log(`Raw messages: ${result.rawMessageCount}`);
  console.log(`CSV messages imported: ${result.csvMessageCount}`);
  console.log(`Cases in context: ${result.caseCount}`);
  console.log(`Context written: ${result.contextPath}`);
  console.log(`Normalized messages written: ${result.normalizedPath}`);
  console.log(`Case state: ${result.caseStatePath}`);
}
```

Update `module.exports` to include `runCli`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node --test scripts\hermes-daily.test.js
```

Expected: PASS 13 tests.

- [ ] **Step 5: Update README**

Add this section to `README.md` after the local analyzer section:

```markdown
## Hermes daily workflow

Hermes should run this script in the morning to build a context file for the previous 08:00-to-08:00 workday. LINE OA CSV backups are optional; if `Y:\line_oa_backups` has no new CSV, the workflow continues.

```powershell
$env:RAW_LOG_DIR='Y:\raw_logs'
$env:LINE_OA_BACKUP_DIR='Y:\line_oa_backups'
$env:NORMALIZED_LOG_DIR='Y:\normalized_logs'
$env:CASE_STATE_PATH='Y:\case_state\cases.json'
$env:REPORT_DIR='Y:\reports'
$env:MEDIA_BASE_DIR='Y:\media'
node scripts/hermes-daily.js
```

Output:

- `Y:\reports\hermes-daily-context-YYYY-MM-DD.md`
- `Y:\normalized_logs\messages-YYYY-MM-DD.json`
- `Y:\case_state\cases.json`
```

- [ ] **Step 6: Run full verification**

Run:

```powershell
node --test scripts\hermes-daily.test.js scripts\analyze-pending.test.js nas-scripts\nas-sync.test.js nas-scripts\nas-cleanup-media.test.js
node --check scripts\hermes-daily.js
```

Expected: all tests pass and `node --check` exits with code 0.

- [ ] **Step 7: Run the workflow once against current local data**

Run:

```powershell
$env:RAW_LOG_DIR='Y:\raw_logs'
$env:LINE_OA_BACKUP_DIR='Y:\line_oa_backups'
$env:NORMALIZED_LOG_DIR='Y:\normalized_logs'
$env:CASE_STATE_PATH='Y:\case_state\cases.json'
$env:REPORT_DIR='Y:\reports'
$env:MEDIA_BASE_DIR='Y:\media'
node scripts\hermes-daily.js
```

Expected: prints a report date, raw message count, CSV import count, context case count, and writes `Y:\reports\hermes-daily-context-YYYY-MM-DD.md`.

- [ ] **Step 8: Commit Task 6**

Run:

```powershell
git add scripts\hermes-daily.js scripts\hermes-daily.test.js README.md
git commit -m "feat: add hermes daily workflow cli"
```

---

## Self-Review

Spec coverage:

- 08:00-to-08:00 window: Task 1 and Task 6.
- Optional CSV enrichment from `Y:\line_oa_backups`: Task 3 and Task 6.
- Missing CSV does not block workflow: Task 3 and Task 6.
- `Y:\case_state\cases.json`: Task 1, Task 4, and Task 6.
- Skip closed/ignored except new activity: Task 4.
- 90-day open/watch/needs_owner lookback: Task 4 and Task 6.
- Context output under `Y:\reports`: Task 5 and Task 6.
- Raw logs remain immutable: all tasks read raw logs only.
- Shop-side uncertainty wording: Task 5.

Placeholder scan: passed; every task includes concrete files, commands, expected output, and code snippets.

Type consistency:

- Normalized messages use `line_user_id`, `display_name`, `event_time`, `direction`, `source`, `message_type`, `text`, `media_path`, and `media_file` in every task.
- Case state uses `{ cases: { [line_user_id]: { status, summary } } }` consistently.
- CLI return fields are named in the test and implementation step consistently.
