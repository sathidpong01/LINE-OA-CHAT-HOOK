const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  dailyWindow,
  loadCaseState,
  loadRawLogMessages,
  normalizeRawLogMessage,
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
