# Hermes Daily LINE OA Workflow Design

Date: 2026-05-16

## Goal

Every morning, the owner asks Hermes to summarize yesterday's LINE OA workday. The workday window is 08:00 Asia/Bangkok to 08:00 the next day, not calendar midnight. Hermes should analyze the current workday activity plus unresolved older cases, then produce a practical morning report.

The system must keep running even when LINE OA chat-history CSV backups are not available. CSV backups are optional enrichment for shop-side replies, not a hard dependency.

## Current Constraints

- LINE webhook logs currently contain inbound customer events only.
- Existing raw logs live under `Y:\raw_logs`.
- Existing media backups live under `Y:\media`.
- Admins may reply from LINE Official Account Manager or the LINE OA mobile app.
- Admins will not switch to a custom reply app.
- LINE OA chat-history CSV backups will be downloaded manually by the owner when available.
- Daily analysis runs inside the shop LAN through Hermes.

## Data Directories

```text
Y:\raw_logs              # webhook inbound logs from Supabase
Y:\media                 # downloaded media/images from Supabase Storage
Y:\line_oa_backups       # manually downloaded LINE OA chat-history CSV files
Y:\normalized_logs       # local merged message store built from raw logs + CSV
Y:\case_state            # Hermes-maintained case state
Y:\reports               # generated Hermes context and morning reports
```

## Source Roles

`Y:\raw_logs` is the primary near-real-time source. It is expected to include customer messages and media references from the LINE webhook.

`Y:\line_oa_backups` is optional. When new CSV files are present, the importer should merge them into normalized logs and record which backup files were already imported. When no CSV is present, the daily workflow must continue without error.

`Y:\normalized_logs` is the read-optimized local timeline Hermes uses. It should preserve message direction when known:

- `customer` for webhook inbound rows.
- `shop` for rows imported from LINE OA chat-history CSV when the CSV identifies shop/admin messages.
- `unknown` when direction cannot be reliably inferred.

## Case State

Hermes maintains a local case-state file, initially:

```text
Y:\case_state\cases.json
```

Supported statuses:

- `open`: needs follow-up.
- `watch`: still active, but not necessarily urgent.
- `closed`: completed; skip in future daily contexts unless new activity appears inside the current 08:00-to-08:00 window.
- `needs_owner`: Hermes is not confident and needs the owner to decide.
- `ignored`: not a work case; skip in future contexts.

Closed and ignored cases are skipped when building daily context. A closed case with new activity inside the current daily window should be included as a reactivation candidate. Open, watch, and needs_owner cases can be included for up to 90 days.

When Hermes closes a case automatically, it must write evidence, not just a status:

```json
{
  "status": "closed",
  "closed_at": "2026-05-16T08:25:00+07:00",
  "closed_reason": "Found clear completion wording.",
  "closed_evidence": [
    "2026-05-15 16:20 customer: ติดตั้งเรียบร้อยแล้วค่ะ"
  ]
}
```

## Automatic Closing Rules

Hermes may mark a case `closed` without asking the owner only when completion evidence is clear. Examples:

- installation is confirmed complete.
- work has been delivered.
- the customer cancelled.
- the case is explicitly closed.
- payment is complete and there is no remaining question or production/delivery issue.

Hermes must not close automatically when the only evidence is vague politeness such as `ขอบคุณ`, especially after payment, deposit, quote, or production wording.

When confidence is low, Hermes should set or keep the case as `needs_owner` and include the question in the morning report.

## Daily Context Build

The daily context window is:

```text
previous day 08:00 Asia/Bangkok -> current day 08:00 Asia/Bangkok
```

For each run, the context builder includes:

- all conversations with activity inside the daily window.
- closed cases only when they have new activity inside the daily window.
- all `open`, `watch`, and `needs_owner` cases with relevant activity in the previous 90 days.
- media paths when present, especially image messages after payment/deposit wording.
- CSV-imported shop messages when available.
- a note when no recent CSV enrichment is available.

The context builder does not discard conversations because they look low priority. It may tag and group them, but Hermes makes the final judgment.

## Report Behavior

Hermes produces a morning report ordered by priority, using money, urgency, waiting time, production state, and customer follow-up signals.

Required report sections:

- `ต้องดูทันที`: payment/slip/deposit/urgent cases and obvious high-risk follow-ups.
- `ควรตรวจ`: cases likely to need owner/admin review.
- `เฝ้าดู`: production, waiting-for-customer, or waiting-for-material cases.
- `ถามเจ้าของร้าน`: unclear cases Hermes should not decide alone.
- `ปิดงานอัตโนมัติวันนี้`: short audit list of cases Hermes closed automatically.

When shop-side logs are missing, the report should say:

```text
ไม่พบคำตอบฝั่งร้านในข้อมูลที่มี
```

It should not state as fact that the shop did not reply.

## Failure Handling

- Missing `Y:\line_oa_backups` should not fail the daily run; create it or skip it.
- Missing CSV backups should produce an informational note only.
- Malformed CSV files should be skipped with a warning and left for review.
- Missing `cases.json` should initialize an empty case state.
- Missing media files should not fail analysis; report the missing path if relevant.
- The raw logs must never be modified by the daily workflow.

## Implementation Boundaries

The next implementation should add a daily workflow script rather than expanding the existing report-only analyzer into unrelated responsibilities. The new workflow can reuse analyzer helpers where practical.

Initial implementation targets:

- scan and import optional CSV files from `Y:\line_oa_backups`.
- maintain an import manifest to avoid duplicate CSV imports.
- build normalized local timelines.
- build `hermes-daily-context-YYYY-MM-DD.md`.
- write generated context and report files under `Y:\reports`.
- initialize and read `Y:\case_state\cases.json`.
- provide clear instructions in the generated context so Hermes can update `cases.json` after analysis.
