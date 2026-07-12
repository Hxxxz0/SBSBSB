---
name: qq-docs-class-status
description: Generate Chinese class stay-away status updates from Tencent Docs online spreadsheets. Use when Codex needs to open or scrape a docs.qq.com sheet, first determine the current date, identify a class such as 崇新/崇新23, count daily statuses like 在校住宿、在家、校外住宿, compare with the previous filled day, and produce a concise update sentence.
---

# QQ Docs Class Status

## Workflow

Use `scripts/qq_docs_class_status.js` for repeatable Tencent Docs class status summaries. The script opens the Tencent Docs sheet in headless Chrome through Playwright, reads the already-decoded `SpreadsheetApp` workbook model, and outputs a formatted Chinese update.

Run from the skill directory or pass an absolute script path:

```bash
NODE_PATH="/Users/hzzzz./.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules" \
node scripts/qq_docs_class_status.js \
  --url "https://docs.qq.com/sheet/DQ29wZFNORWJ6YkZH?tab=000001&_t=1783786409538&nlc=1" \
  --class "崇新"
```

If `NODE_PATH` is already configured with Playwright, omit it. If Chrome is not in `/Applications/Google Chrome.app`, pass `--chrome /path/to/chrome`.

## Output Rules

- Match `--class` as an exact class name or prefix, so `崇新` matches `崇新23`.
- Detect date columns from the sheet date row and pair each date column with its `目前去向` values.
- First get the current date using `--timezone` (default `Asia/Shanghai`) and use that date column unless `--date` is provided.
- Use the latest date column with at least one filled status only when `--latest-filled` is explicitly provided.
- Compare against the nearest previous date column that has filled statuses. For 今日变化, only write `xx离校` when someone changed from `在校住宿` to a non-campus filled status, and only write `xx返校` when someone changed from a non-campus filled status to `在校住宿`. If there are no such changes, omit the whole `相较于昨天...` phrase.
- Count:
  - `在校住宿` as 在校
  - `在家` as 在家
  - `校外住宿` as 校外居住
  - blank latest statuses as `xx联系不上`; if nobody is missing, omit this phrase entirely
- Write the final update in this style:

```text
崇新在校情况更新：8人在校，19人在家，0人校外居住，相较于昨天，王嵩泽离校。
```

## Useful Options

- `--date 7月11日` or `--date 2026-07-11`: force a specific report date.
- `--timezone Asia/Shanghai`: timezone used to determine today's date.
- `--latest-filled`: ignore today's date and report the latest filled date column.
- `--json`: print the detailed parsed result as JSON.
- `--rows 450 --cols 130`: increase the read range if the sheet grows.
- `--wait-ms 14000`: wait longer for Tencent Docs to finish loading.

## Validation

Validate the skill basics with:

```bash
python3 /Users/hzzzz./.codex/skills/.system/skill-creator/scripts/quick_validate.py qq-docs-class-status
```

Validate the live Tencent Docs workflow by running the script against a public or accessible Tencent Docs sheet and checking that the formatted line matches the visible table.
