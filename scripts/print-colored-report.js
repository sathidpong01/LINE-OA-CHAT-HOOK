const fs = require("fs");

const ANSI = {
  reset: "\x1b[0m",
  redBold: "\x1b[31;1m",
  yellowBold: "\x1b[33;1m",
  blueBold: "\x1b[36;1m",
  magentaBold: "\x1b[35;1m",
  gray: "\x1b[90m",
};

const LABEL_COLORS = [
  { pattern: /\[(RED)\s+C\d+\]/, color: ANSI.redBold },
  { pattern: /\[(YELLOW)\s+C\d+\]/, color: ANSI.yellowBold },
  { pattern: /\[(BLUE)\s+C\d+\]/, color: ANSI.blueBold },
  { pattern: /\[(ASK)\s+C\d+\]/, color: ANSI.magentaBold },
  { pattern: /\[(GRAY)\s+C\d+\]/, color: ANSI.gray },
];

const SECTION_COLORS = [
  { title: "ต้องดูทันที", color: ANSI.redBold },
  { title: "ควรตรวจ", color: ANSI.yellowBold },
  { title: "เฝ้าดู", color: ANSI.blueBold },
  { title: "ถามเจ้าของร้าน", color: ANSI.magentaBold },
  { title: "ปิดงานอัตโนมัติวันนี้", color: ANSI.gray },
];

function wrap(line, color, options = {}) {
  if (options.color === false) return line;
  return `${color}${line}${ANSI.reset}`;
}

function colorizeLine(line, options = {}) {
  for (const section of SECTION_COLORS) {
    if (line.trim() === section.title) {
      return wrap(line, section.color, options);
    }
  }

  for (const label of LABEL_COLORS) {
    if (label.pattern.test(line)) {
      return wrap(line, label.color, options);
    }
  }

  return line;
}

function colorizeReport(report, options = {}) {
  return String(report || "")
    .split(/\r\n|\n|\r/)
    .map((line) => colorizeLine(line, options))
    .join("\n");
}

function runCli(argv = process.argv.slice(2)) {
  const noColor = argv.includes("--no-color");
  const filePath = argv.find((arg) => arg !== "--no-color");
  if (!filePath) {
    console.error("Usage: node scripts/print-colored-report.js <report.md> [--no-color]");
    process.exitCode = 1;
    return;
  }

  const report = fs.readFileSync(filePath, "utf8");
  process.stdout.write(colorizeReport(report, { color: !noColor }));
}

if (require.main === module) {
  runCli();
}

module.exports = {
  ANSI,
  colorizeLine,
  colorizeReport,
  runCli,
};
