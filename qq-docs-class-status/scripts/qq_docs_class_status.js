#!/usr/bin/env node

const fs = require("fs");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    if (key === "json" || key === "debug" || key === "latest-filled") {
      args[key] = true;
    } else {
      args[key] = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/qq_docs_class_status.js --url <docs.qq.com sheet url> --class <class keyword>",
    "",
    "Options:",
    "  --date <YYYY-MM-DD|M月D日|MM-DD>  Force report date",
    "  --timezone <tz>                  Timezone for today's date, default Asia/Shanghai",
    "  --latest-filled                  Use latest filled date instead of today's date",
    "  --chrome <path>                  Chrome executable path",
    "  --rows <n>                       Rows to read, default 450",
    "  --cols <n>                       Columns to read, default 130",
    "  --wait-ms <n>                    Page load wait, default 14000",
    "  --json                           Print detailed JSON",
  ].join("\n");
}

function excelSerialToDate(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n)) return null;
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function normalizeDateValue(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;

  const serialDate = excelSerialToDate(value);
  if (serialDate && Number(value) > 30000) {
    return {
      key: serialDate.toISOString().slice(0, 10),
      label: `${serialDate.getUTCMonth() + 1}月${serialDate.getUTCDate()}日`,
    };
  }

  let match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const y = match[1];
    const m = String(Number(match[2])).padStart(2, "0");
    const d = String(Number(match[3])).padStart(2, "0");
    return { key: `${y}-${m}-${d}`, label: `${Number(m)}月${Number(d)}日` };
  }

  match = value.match(/^0?(\d{1,2})[-月](\d{1,2})(?:日)?$/);
  if (match) {
    const m = String(Number(match[1])).padStart(2, "0");
    const d = String(Number(match[2])).padStart(2, "0");
    return { key: `${m}-${d}`, label: `${Number(m)}月${Number(d)}日` };
  }

  return null;
}

function todayInTimezone(timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dateMatches(target, candidate) {
  if (!target) return false;
  const normalized = normalizeDateValue(target);
  if (!normalized) return false;
  return (
    candidate.key === normalized.key ||
    candidate.key.endsWith(normalized.key) ||
    candidate.label === normalized.label
  );
}

function statusCategory(status) {
  if (status === "在校住宿") return "campus";
  if (status === "在家") return "home";
  if (status === "校外住宿") return "offCampus";
  if (!status) return "missing";
  return "other";
}

function describeChange(row, previous, current) {
  if (!previous || !current || previous === current) return null;
  if (previous === "在校住宿" && current !== "在校住宿") return `${row.name}离校`;
  if (previous !== "在校住宿" && current === "在校住宿") return `${row.name}返校`;
  return null;
}

function buildSummary(result) {
  const parts = [
    `${result.classLabel}在校情况更新：${result.counts.campus}人在校`,
    `${result.counts.home}人在家`,
    `${result.counts.offCampus}人校外居住`,
  ];
  if (result.missingNames.length > 0) {
    parts.push(`${result.missingNames.join("、")}联系不上`);
  }
  let sentence = `${parts.join("，")}`;
  if (result.changes.length > 0) {
    sentence += `，相较于昨天，${result.changes.join("，")}`;
  } else if (result.previousDate) {
    sentence += "，相较于昨天无变化";
  }
  return `${sentence}。`;
}

async function readSheetValues({ url, chrome, rows, cols, waitMs }) {
  let playwright;
  try {
    playwright = require("playwright");
  } catch (error) {
    throw new Error(
      "Cannot find Playwright. Set NODE_PATH to the bundled node_modules path, for example: " +
        'NODE_PATH="/Users/hzzzz./.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules"'
    );
  }

  const executablePath =
    chrome ||
    (fs.existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : undefined);

  const browser = await playwright.chromium.launch({
    headless: true,
    executablePath,
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => window.SpreadsheetApp && window.SpreadsheetApp.e2eTools, null, {
      timeout: 60000,
    });
    await page.waitForTimeout(waitMs);

    return await page.evaluate(
      ({ rows: rowCount, cols: colCount }) => {
        const app = window.SpreadsheetApp;
        const sheet = app.workbook.activeSheet;
        const sheetId = app.workbook.activeSheetId;
        const GridRange = app.e2eTools.GridRange;
        const convert = app.e2eTools.getValueAndTypeFromCell;
        const cells = app.e2eTools.getCellsAtRange(
          sheet,
          new GridRange(sheetId, 0, rowCount - 1, 0, colCount - 1),
          () => true,
          true
        );
        return cells.map((row) =>
          row.map((cell) => {
            try {
              const converted = convert(cell);
              if (converted && converted.value !== undefined && converted.value !== null) {
                return String(converted.value).trim();
              }
            } catch (_) {
              // Keep cells that do not expose values as blanks.
            }
            return "";
          })
        );
      },
      { rows, cols }
    );
  } finally {
    await browser.close();
  }
}

function analyze(values, classQuery, options = {}) {
  const headerRow = values.findIndex(
    (row) => row.includes("序号") && row.includes("姓名") && row.includes("班级")
  );
  if (headerRow < 0) throw new Error("Could not find the sheet header row.");

  const header = values[headerRow];
  const classCol = header.indexOf("班级");
  const nameCol = header.indexOf("姓名");
  const dateRowIndex = Math.max(0, headerRow);
  const firstDateCol = classCol + 1;

  const dateColumns = [];
  for (let col = firstDateCol; col < (values[dateRowIndex] || []).length; col += 1) {
    const date = normalizeDateValue(values[dateRowIndex][col]);
    if (date) dateColumns.push({ ...date, col });
  }
  if (dateColumns.length === 0) throw new Error("Could not find date columns.");

  const classRows = [];
  for (let rowIndex = headerRow + 2; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex] || [];
    const className = row[classCol] || "";
    if (!className) continue;
    if (className === classQuery || className.startsWith(classQuery) || classQuery.startsWith(className)) {
      classRows.push({
        rowIndex,
        name: row[nameCol] || `第${rowIndex + 1}行`,
        className,
        row,
      });
    }
  }
  if (classRows.length === 0) throw new Error(`No rows matched class "${classQuery}".`);

  const filledCount = (col) => classRows.filter((entry) => entry.row[col]).length;
  const targetDate = options.forcedDate || options.today;
  let currentDate = options.latestFilled
    ? [...dateColumns].reverse().find((date) => filledCount(date.col) > 0)
    : dateColumns.find((date) => dateMatches(targetDate, date));
  if (!currentDate) {
    throw new Error(
      options.latestFilled
        ? "No filled date column found."
        : `Could not find current date column "${targetDate}". Use --date to force a date or --latest-filled to report the latest filled column.`
    );
  }

  const previousDate = [...dateColumns]
    .filter((date) => date.col < currentDate.col && filledCount(date.col) > 0)
    .pop();

  const counts = { campus: 0, home: 0, offCampus: 0, other: 0, missing: 0 };
  const missingNames = [];
  const otherStatuses = {};
  const changes = [];

  for (const entry of classRows) {
    const current = entry.row[currentDate.col] || "";
    const category = statusCategory(current);
    counts[category] += 1;
    if (category === "missing") missingNames.push(entry.name);
    if (category === "other") otherStatuses[current] = (otherStatuses[current] || 0) + 1;

    if (previousDate) {
      const previous = entry.row[previousDate.col] || "";
      const change = describeChange(entry, previous, current);
      if (change) changes.push(change);
    }
  }

  const classLabel = classRows[0].className.replace(/\d+$/, "") || classQuery;
  const result = {
    classLabel,
    matchedClassNames: [...new Set(classRows.map((row) => row.className))],
    today: options.today,
    reportDate: currentDate,
    previousDate,
    totalRows: classRows.length,
    counts,
    otherStatuses,
    missingNames,
    changes,
    summary: "",
  };
  result.summary = buildSummary(result);
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url || !args.class) {
    console.error(usage());
    process.exit(2);
  }

  const values = await readSheetValues({
    url: args.url,
    chrome: args.chrome,
    rows: Number(args.rows || 450),
    cols: Number(args.cols || 130),
    waitMs: Number(args["wait-ms"] || 14000),
  });
  const timeZone = args.timezone || "Asia/Shanghai";
  const today = todayInTimezone(timeZone);
  const result = analyze(values, args.class, {
    forcedDate: args.date,
    latestFilled: Boolean(args["latest-filled"]),
    today,
  });
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.summary);
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
