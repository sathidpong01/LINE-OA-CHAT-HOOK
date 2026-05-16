const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  dailyWindow,
  importCsvBackups,
  loadCaseState,
  loadRawLogMessages,
  normalizeRawLogMessage,
  normalizeCsvRow,
  parseCsv,
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

test("case state falls back when cases is not a plain object", () => {
  const dir = tempDir();
  const statePath = path.join(dir, "case_state", "cases.json");

  for (const malformedCases of ["not-an-object", [], null]) {
    writeCaseState(statePath, { cases: malformedCases });

    assert.deepEqual(loadCaseState(statePath), { cases: {} });
  }
});

test("normalizeRawLogMessage marks webhook rows as customer messages with local media path", () => {
  const message = normalizeRawLogMessage(
    {
      id: 10,
      event_time: "2026-05-15T03:00:00.000Z",
      created_at: "2026-05-15T03:00:01.000Z",
      line_user_id: "U-customer",
      display_name: "คุณเอ",
      message_type: "image",
      text: null,
      media_path: "2026/05/15/U-customer/slip.jpg",
    },
    { mediaBaseDir: "Y:\\media" },
  );

  assert.deepEqual(message, {
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

test("loadRawLogMessages reads JSON files recursively and filters inclusive time range", () => {
  const dir = tempDir();
  const logDir = path.join(dir, "raw_logs", "2026", "05");
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(
    path.join(logDir, "15.json"),
    JSON.stringify(
      [
        {
          id: 1,
          event_time: "2026-05-15T00:59:59.999Z",
          created_at: "2026-05-15T00:59:59.999Z",
          line_user_id: "U-before",
          display_name: "ก่อนช่วง",
          message_type: "text",
          text: "before",
          media_path: null,
        },
        {
          id: 2,
          event_time: "2026-05-15T01:00:00.000Z",
          created_at: "2026-05-15T01:00:00.001Z",
          line_user_id: "U-inside",
          display_name: "ในช่วง",
          message_type: "text",
          text: "inside",
          media_path: null,
        },
        {
          id: 3,
          event_time: "2026-05-16T01:00:00.000Z",
          created_at: "2026-05-16T01:00:00.000Z",
          line_user_id: "U-end",
          display_name: "ขอบช่วง",
          message_type: "text",
          text: "end",
          media_path: null,
        },
        {
          id: 4,
          event_time: "2026-05-16T01:00:00.001Z",
          created_at: "2026-05-16T01:00:00.001Z",
          line_user_id: "U-after",
          display_name: "หลังช่วง",
          message_type: "text",
          text: "after",
          media_path: null,
        },
      ],
      null,
      2,
    ),
    "utf8",
  );

  const messages = loadRawLogMessages(path.join(dir, "raw_logs"), {
    start: new Date("2026-05-15T01:00:00.000Z"),
    end: new Date("2026-05-16T01:00:00.000Z"),
  });

  assert.deepEqual(
    messages.map((message) => message.id),
    ["raw:2", "raw:3"],
  );
  assert.equal(messages[0].direction, "customer");
  assert.equal(messages[1].direction, "customer");
});

test("parseCsv handles quoted commas and Thai headers", () => {
  const rows = parseCsv(
    'เวลา,ผู้ส่ง,ข้อความ\n"2026-05-15 09:10","ร้าน","รับทราบ, เดี๋ยวเช็กให้"\n',
  );

  assert.deepEqual(rows, [
    {
      เวลา: "2026-05-15 09:10",
      ผู้ส่ง: "ร้าน",
      ข้อความ: "รับทราบ, เดี๋ยวเช็กให้",
    },
  ]);
});

test("parseCsv handles quoted newline as a single row", () => {
  const rows = parseCsv(
    'เวลา,ผู้ส่ง,ข้อความ\n"2026-05-15 09:10","ร้าน","บรรทัด 1\nบรรทัด 2"\n',
  );

  assert.deepEqual(rows, [
    {
      เวลา: "2026-05-15 09:10",
      ผู้ส่ง: "ร้าน",
      ข้อความ: "บรรทัด 1\nบรรทัด 2",
    },
  ]);
});

test("normalizeCsvRow maps shop backup rows", () => {
  const message = normalizeCsvRow(
    {
      เวลา: "2026-05-15 09:10",
      ผู้ส่ง: "ร้าน",
      ชื่อลูกค้า: "คุณเอ",
      "User ID": "U-customer",
      ข้อความ: "รับทราบค่ะ",
    },
    "backup.csv",
    2,
  );

  assert.equal(message.id, "csv:backup.csv:2");
  assert.equal(message.source, "line_oa_csv");
  assert.equal(message.direction, "shop");
  assert.equal(message.line_user_id, "U-customer");
  assert.equal(message.display_name, "คุณเอ");
  assert.equal(message.text, "รับทราบค่ะ");
  assert.equal(message.message_type, "text");
});

test("importCsvBackups skips missing folders and records imported files", () => {
  const dir = tempDir();
  const backupDir = path.join(dir, "line-oa-backups");
  const normalizedDir = path.join(dir, "normalized");

  const missingImport = importCsvBackups(backupDir, normalizedDir);
  assert.deepEqual(missingImport.importedFiles, []);
  assert.deepEqual(missingImport.messages, []);
  assert.match(missingImport.note, /ไม่มี CSV/);

  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(
    path.join(backupDir, "backup.csv"),
    "เวลา,ผู้ส่ง,ชื่อลูกค้า,User ID,ข้อความ\n2026-05-15 09:10,ร้าน,คุณเอ,U-customer,รับทราบค่ะ\n",
    "utf8",
  );

  const firstImport = importCsvBackups(backupDir, normalizedDir);
  assert.deepEqual(firstImport.importedFiles, ["backup.csv"]);
  assert.equal(firstImport.messages.length, 1);

  const secondImport = importCsvBackups(backupDir, normalizedDir);
  assert.deepEqual(secondImport.importedFiles, []);
  assert.equal(secondImport.messages.length, 0);
});

test("importCsvBackups preserves quoted newlines in message fields", () => {
  const dir = tempDir();
  const backupDir = path.join(dir, "line-oa-backups");
  const normalizedDir = path.join(dir, "normalized");

  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(
    path.join(backupDir, "backup.csv"),
    'เวลา,ผู้ส่ง,ชื่อลูกค้า,User ID,ข้อความ\n2026-05-15 09:10,ร้าน,คุณเอ,U-customer,"บรรทัด 1\nบรรทัด 2"\n',
    "utf8",
  );

  const result = importCsvBackups(backupDir, normalizedDir);

  assert.deepEqual(result.importedFiles, ["backup.csv"]);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].text, "บรรทัด 1\nบรรทัด 2");
});

test("importCsvBackups continues when manifest JSON is malformed", () => {
  const dir = tempDir();
  const backupDir = path.join(dir, "line-oa-backups");
  const normalizedDir = path.join(dir, "normalized");

  fs.mkdirSync(backupDir, { recursive: true });
  fs.mkdirSync(normalizedDir, { recursive: true });
  fs.writeFileSync(path.join(normalizedDir, "csv-import-manifest.json"), "{not json", "utf8");
  fs.writeFileSync(
    path.join(backupDir, "backup.csv"),
    "เวลา,ผู้ส่ง,ชื่อลูกค้า,User ID,ข้อความ\n2026-05-15 09:10,ร้าน,คุณเอ,U-customer,รับทราบค่ะ\n",
    "utf8",
  );

  const result = importCsvBackups(backupDir, normalizedDir);

  assert.deepEqual(result.importedFiles, ["backup.csv"]);
  assert.equal(result.messages.length, 1);
});
