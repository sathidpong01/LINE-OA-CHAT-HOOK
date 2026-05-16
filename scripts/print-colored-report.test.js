const test = require("node:test");
const assert = require("node:assert/strict");

const {
  colorizeLine,
  colorizeReport,
  ANSI,
} = require("./print-colored-report");

test("colorizes priority label lines with ANSI colors", () => {
  assert.equal(
    colorizeLine("- [RED C01] Earns S Kittayarak"),
    `${ANSI.redBold}- [RED C01] Earns S Kittayarak${ANSI.reset}`,
  );
  assert.equal(
    colorizeLine("- [YELLOW C02] korekai"),
    `${ANSI.yellowBold}- [YELLOW C02] korekai${ANSI.reset}`,
  );
  assert.equal(
    colorizeLine("- [BLUE C03] Taany"),
    `${ANSI.blueBold}- [BLUE C03] Taany${ANSI.reset}`,
  );
  assert.equal(
    colorizeLine("- [ASK C04] BaSs Mobile"),
    `${ANSI.magentaBold}- [ASK C04] BaSs Mobile${ANSI.reset}`,
  );
  assert.equal(
    colorizeLine("- [GRAY C05] Boy"),
    `${ANSI.gray}- [GRAY C05] Boy${ANSI.reset}`,
  );
});

test("colorizes report section headings", () => {
  assert.equal(colorizeLine("ต้องดูทันที"), `${ANSI.redBold}ต้องดูทันที${ANSI.reset}`);
  assert.equal(colorizeLine("ควรตรวจ"), `${ANSI.yellowBold}ควรตรวจ${ANSI.reset}`);
  assert.equal(colorizeLine("เฝ้าดู"), `${ANSI.blueBold}เฝ้าดู${ANSI.reset}`);
  assert.equal(colorizeLine("ถามเจ้าของร้าน"), `${ANSI.magentaBold}ถามเจ้าของร้าน${ANSI.reset}`);
  assert.equal(colorizeLine("ปิดงานอัตโนมัติวันนี้"), `${ANSI.gray}ปิดงานอัตโนมัติวันนี้${ANSI.reset}`);
});

test("leaves unrelated lines unchanged and supports no-color mode", () => {
  assert.equal(colorizeLine("หลักฐาน: 2026-05-15"), "หลักฐาน: 2026-05-15");
  assert.equal(colorizeLine("- [RED C01] Earns", { color: false }), "- [RED C01] Earns");
});

test("colorizes a whole report line by line", () => {
  const report = ["ต้องดูทันที", "- [RED C01] Earns", "เหตุผล: test"].join("\n");
  const colored = colorizeReport(report);

  assert.match(colored, /\x1b\[31;1mต้องดูทันที\x1b\[0m/);
  assert.match(colored, /\x1b\[31;1m- \[RED C01\] Earns\x1b\[0m/);
  assert.match(colored, /เหตุผล: test/);
});
