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

test("case state falls back when cases is not a plain object", () => {
  const dir = tempDir();
  const statePath = path.join(dir, "case_state", "cases.json");

  for (const malformedCases of ["not-an-object", [], null]) {
    writeCaseState(statePath, { cases: malformedCases });

    assert.deepEqual(loadCaseState(statePath), { cases: {} });
  }
});
