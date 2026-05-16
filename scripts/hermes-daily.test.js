const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  buildContextCases,
  dailyWindow,
  importCsvBackups,
  loadCaseState,
  loadRawLogMessages,
  normalizeRawLogMessage,
  normalizeCsvRow,
  parseCsv,
  renderHermesContext,
  writeHermesContext,
  writeCaseState,
  runCli,
} = require("./hermes-daily");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hermes-daily-"));
}

function normalized(overrides = {}) {
  return {
    id: "test-message",
    source: "test",
    direction: "customer",
    event_time: "2026-05-15T03:00:00.000Z",
    line_user_id: "U-test",
    display_name: "",
    message_type: "text",
    text: "",
    ...overrides,
  };
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

test("case state falls back when JSON is malformed", () => {
  const dir = tempDir();
  const statePath = path.join(dir, "case_state", "cases.json");
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, "{not json", "utf8");

  assert.deepEqual(loadCaseState(statePath), { cases: {} });
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
  assert.equal(fs.existsSync(backupDir), true);

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
  assert.equal(secondImport.messages.length, 1);
});

test("importCsvBackups replaces changed CSV rows without duplicating old rows", () => {
  const dir = tempDir();
  const backupDir = path.join(dir, "line-oa-backups");
  const normalizedDir = path.join(dir, "normalized");
  const csvPath = path.join(backupDir, "backup.csv");

  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(
    csvPath,
    "เวลา,ผู้ส่ง,ชื่อลูกค้า,User ID,ข้อความ\n2026-05-15 09:10,ร้าน,คุณเอ,U-customer,รับทราบค่ะ\n",
    "utf8",
  );
  importCsvBackups(backupDir, normalizedDir);

  fs.writeFileSync(
    csvPath,
    "เวลา,ผู้ส่ง,ชื่อลูกค้า,User ID,ข้อความ\n2026-05-15 09:20,ร้าน,คุณเอ,U-customer,เช็กให้แล้วค่ะ\n",
    "utf8",
  );
  const result = importCsvBackups(backupDir, normalizedDir);

  assert.deepEqual(result.importedFiles, ["backup.csv"]);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].text, "เช็กให้แล้วค่ะ");
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

test("buildContextCases includes daily activity and open/watch cases from 90-day lookback", () => {
  const cases = buildContextCases(
    [
      normalized({
        line_user_id: "U-daily",
        event_time: "2026-05-15T03:00:00.000Z",
        text: "ขอราคาค่ะ",
      }),
      normalized({
        line_user_id: "U-open",
        event_time: "2026-04-10T03:00:00.000Z",
        text: "งานผลิตถึงไหนแล้วคะ",
      }),
      normalized({
        line_user_id: "U-closed",
        event_time: "2026-04-10T03:00:00.000Z",
        text: "ติดตั้งเรียบร้อย",
      }),
    ],
    {
      windowStart: new Date("2026-05-15T01:00:00.000Z"),
      windowEnd: new Date("2026-05-16T01:00:00.000Z"),
      lookbackDays: 90,
      caseState: {
        cases: {
          "U-open": { status: "watch", summary: "รอผลิต" },
          "U-closed": { status: "closed", summary: "ปิดแล้ว" },
        },
      },
    },
  );

  assert.deepEqual(
    cases.map((caseItem) => caseItem.line_user_id),
    ["U-open", "U-daily"],
  );
  assert.deepEqual(
    cases.map((caseItem) => caseItem.include_reason),
    ["existing_watch_case", "activity_in_daily_window"],
  );
});

test("buildContextCases includes closed cases only when new activity appears in daily window", () => {
  const cases = buildContextCases(
    [
      normalized({
        line_user_id: "U-closed",
        event_time: "2026-05-15T03:00:00.000Z",
        text: "สอบถามเพิ่มค่ะ",
      }),
    ],
    {
      windowStart: new Date("2026-05-15T01:00:00.000Z"),
      windowEnd: new Date("2026-05-16T01:00:00.000Z"),
      lookbackDays: 90,
      caseState: {
        cases: {
          "U-closed": { status: "closed", summary: "ปิดแล้ว" },
        },
      },
    },
  );

  assert.equal(cases.length, 1);
  assert.equal(cases[0].line_user_id, "U-closed");
  assert.equal(cases[0].include_reason, "reactivated_closed_case");
});

test("buildContextCases sorts and retains all relevant messages for the same user", () => {
  const cases = buildContextCases(
    [
      normalized({
        id: "message-3",
        line_user_id: "U-thread",
        event_time: "2026-05-15T05:00:00.000Z",
        text: "ล่าสุด",
      }),
      normalized({
        id: "message-1",
        line_user_id: "U-thread",
        event_time: "2026-04-10T03:00:00.000Z",
        text: "เริ่มงาน",
      }),
      normalized({
        id: "message-2",
        line_user_id: "U-thread",
        event_time: "2026-05-15T03:00:00.000Z",
        text: "ตามงาน",
      }),
    ],
    {
      windowStart: new Date("2026-05-15T01:00:00.000Z"),
      windowEnd: new Date("2026-05-16T01:00:00.000Z"),
      lookbackDays: 90,
      caseState: { cases: {} },
    },
  );

  assert.equal(cases.length, 1);
  assert.deepEqual(
    cases[0].messages.map((message) => message.id),
    ["message-1", "message-2", "message-3"],
  );
});

test("buildContextCases skips ignored cases without daily activity and reactivates ignored cases with daily activity", () => {
  const cases = buildContextCases(
    [
      normalized({
        line_user_id: "U-ignored-old",
        event_time: "2026-04-10T03:00:00.000Z",
        text: "ไม่ต้องตาม",
      }),
      normalized({
        line_user_id: "U-ignored-daily",
        event_time: "2026-05-15T03:00:00.000Z",
        text: "สอบถามใหม่",
      }),
    ],
    {
      windowStart: new Date("2026-05-15T01:00:00.000Z"),
      windowEnd: new Date("2026-05-16T01:00:00.000Z"),
      lookbackDays: 90,
      caseState: {
        cases: {
          "U-ignored-old": { status: "ignored", summary: "ไม่ต้องตาม" },
          "U-ignored-daily": { status: "ignored", summary: "ไม่ต้องตาม" },
        },
      },
    },
  );

  assert.deepEqual(
    cases.map((caseItem) => caseItem.line_user_id),
    ["U-ignored-daily"],
  );
  assert.equal(cases[0].include_reason, "reactivated_ignored_case");
});

test("buildContextCases includes needs_owner cases from 90-day lookback without daily activity", () => {
  const cases = buildContextCases(
    [
      normalized({
        line_user_id: "U-needs-owner",
        event_time: "2026-04-10T03:00:00.000Z",
        text: "รอเจ้าของตัดสินใจ",
      }),
    ],
    {
      windowStart: new Date("2026-05-15T01:00:00.000Z"),
      windowEnd: new Date("2026-05-16T01:00:00.000Z"),
      lookbackDays: 90,
      caseState: {
        cases: {
          "U-needs-owner": { status: "needs_owner", summary: "รอเจ้าของ" },
        },
      },
    },
  );

  assert.equal(cases.length, 1);
  assert.equal(cases[0].line_user_id, "U-needs-owner");
  assert.equal(cases[0].include_reason, "existing_needs_owner_case");
});

test("renderHermesContext includes instructions, CSV note, cases, shop messages, and media paths", () => {
  const markdown = renderHermesContext({
    reportDate: "2026-05-16",
    windowStart: new Date("2026-05-15T01:00:00.000Z"),
    windowEnd: new Date("2026-05-16T01:00:00.000Z"),
    csvNote: "ไม่มี CSV backup ใหม่ให้ import",
    importedFiles: [],
    cases: [
      {
        line_user_id: "U-test",
        display_name: "คุณเอ",
        status: "watch",
        include_reason: "activity_in_daily_window",
        state: { status: "watch", summary: "รอผลิต" },
        messages: [
          normalized({
            direction: "customer",
            event_time: "2026-05-15T03:00:00.000Z",
            text: "โอนมัดจำแล้วค่ะ",
          }),
          normalized({
            source: "line_oa_csv",
            direction: "shop",
            event_time: "2026-05-15T03:05:00.000Z",
            text: "รับทราบค่ะ",
          }),
          normalized({
            direction: "customer",
            event_time: "2026-05-15T03:06:00.000Z",
            message_type: "image",
            media_file: "Y:\\media\\2026\\05\\15\\U-test\\slip.jpg",
          }),
        ],
      },
    ],
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

test("renderHermesContext indents multiline message continuations", () => {
  const markdown = renderHermesContext({
    reportDate: "2026-05-16",
    windowStart: new Date("2026-05-15T01:00:00.000Z"),
    windowEnd: new Date("2026-05-16T01:00:00.000Z"),
    csvNote: "",
    importedFiles: [],
    cases: [
      {
        line_user_id: "U-test",
        display_name: "คุณเอ",
        status: "watch",
        include_reason: "activity_in_daily_window",
        state: { status: "watch" },
        messages: [
          normalized({
            direction: "customer",
            event_time: "2026-05-15T03:10:00.000Z",
            text: "บรรทัด 1\nบรรทัด 2",
          }),
        ],
      },
    ],
  });

  assert.match(markdown, /\n  \| บรรทัด 2/);
  assert.doesNotMatch(markdown, /\nบรรทัด 2(?:\n|$)/);
});

test("renderHermesContext renders invalid time and non-text messages without media", () => {
  const markdown = renderHermesContext({
    reportDate: "2026-05-16",
    windowStart: new Date("2026-05-15T01:00:00.000Z"),
    windowEnd: new Date("2026-05-16T01:00:00.000Z"),
    csvNote: "",
    importedFiles: [],
    cases: [
      {
        line_user_id: "U-test",
        display_name: "คุณเอ",
        status: "watch",
        include_reason: "activity_in_daily_window",
        state: { status: "watch" },
        messages: [
          normalized({
            direction: "customer",
            event_time: "not-a-date",
            message_type: "image",
          }),
        ],
      },
    ],
  });

  assert.match(markdown, /ไม่ทราบเวลา customer: \[image\]/);
});

test("runCli creates directories and writes a Hermes daily context", () => {
  const dir = tempDir();
  const rawLogDir = path.join(dir, "raw_logs");
  const logDir = path.join(rawLogDir, "2026", "05");
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(
    path.join(logDir, "15.json"),
    JSON.stringify(
      [
        {
          id: 1,
          event_time: "2026-05-15T03:00:00.000Z",
          line_user_id: "U-test",
          display_name: "คุณเอ",
          message_type: "text",
          text: "ขอราคา",
        },
      ],
      null,
      2,
    ),
    "utf8",
  );

  const result = runCli({
    now: new Date("2026-05-16T02:00:00.000Z"),
    rawLogDir,
    backupDir: path.join(dir, "line_oa_backups"),
    normalizedDir: path.join(dir, "normalized_logs"),
    caseStatePath: path.join(dir, "case_state", "cases.json"),
    reportDir: path.join(dir, "reports"),
    mediaBaseDir: path.join(dir, "media"),
  });

  assert.equal(result.reportDate, "2026-05-16");
  assert.ok(fs.existsSync(result.contextPath));
  assert.match(fs.readFileSync(result.contextPath, "utf8"), /คุณเอ/);
  assert.ok(fs.existsSync(path.join(dir, "case_state", "cases.json")));
});

test("runCli keeps CSV enrichment available on later runs", () => {
  const dir = tempDir();
  const rawLogDir = path.join(dir, "raw_logs");
  const logDir = path.join(rawLogDir, "2026", "05");
  const backupDir = path.join(dir, "line_oa_backups");
  const normalizedDir = path.join(dir, "normalized_logs");
  const options = {
    now: new Date("2026-05-16T02:00:00.000Z"),
    rawLogDir,
    backupDir,
    normalizedDir,
    caseStatePath: path.join(dir, "case_state", "cases.json"),
    reportDir: path.join(dir, "reports"),
    mediaBaseDir: path.join(dir, "media"),
  };

  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(
    path.join(logDir, "15.json"),
    JSON.stringify(
      [
        {
          id: 1,
          event_time: "2026-05-15T03:00:00.000Z",
          line_user_id: "U-customer",
          display_name: "คุณเอ",
          message_type: "text",
          text: "ขอราคา",
        },
      ],
      null,
      2,
    ),
    "utf8",
  );
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(
    path.join(backupDir, "backup.csv"),
    "เวลา,ผู้ส่ง,ชื่อลูกค้า,User ID,ข้อความ\n2026-05-15 09:10,ร้าน,คุณเอ,U-customer,รับทราบค่ะ\n",
    "utf8",
  );

  runCli(options);
  const secondRun = runCli(options);
  const context = fs.readFileSync(secondRun.contextPath, "utf8");

  assert.equal(secondRun.csvMessageCount, 1);
  assert.match(context, /shop: รับทราบค่ะ/);
});
