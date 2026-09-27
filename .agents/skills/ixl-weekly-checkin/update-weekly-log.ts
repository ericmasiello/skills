#!/usr/bin/env -S node --experimental-strip-types
// Writes IXL check-in data into the family's tracker sheet. Two independent
// write modes, chosen by which top-level key the payload carries:
//
//   "entries" — one or more raw per-skill-entry rows into a child's own tab
//     (tab name = child name, e.g. "Hunter"/"Avery"). Columns: Date | Subject
//     | Questions Answered | Questions Missed | Time Spent | Category
//     (Math/ELA) | Week Of. Each entry is matched against existing rows by
//     (Date, Subject) — if a row for that exact skill on that exact day
//     already exists, only its currently-blank cells are filled in (never
//     overwrite a value already there); otherwise a new row is appended.
//
//     If the payload also includes "weekOf" (the same date used for that
//     child's "summary" call below), this also (re)writes a "— Week Total —"
//     row for the 7-day window ending on that date — Questions Answered /
//     Questions Missed / Time Spent summed across every real entry in that
//     window (Math + ELA combined), with the window's end date repeated in
//     the new "Week Of" column so the rollup row is easy to find/filter.
//     Unlike real entries, this rollup row is fully recomputed and
//     overwritten every time (never fill-blanks-only) — it's a derived
//     total, not a human-editable record, so it must always match what's
//     actually in the tab today, even if a past entry gets hand-edited later.
//
//     Every call also re-sorts the whole tab by Date ascending afterward
//     (including any prior data — this only needs to happen once for
//     existing out-of-order rows to self-heal), so entries and rollups alike
//     land in chronological order regardless of what order they were
//     collected in during the check-in.
//
//   "summary" — one weekly row into the shared "Weekly Summary" tab (not
//     per-child — one tab, a Child column distinguishes rows). Columns: Week
//     Of | Child | Math Level | ELA Level | Anomalies | Notes. Matched by
//     (Week Of, Child) with the same fill-blanks-only semantics.
//
// A single invocation takes exactly one of "entries" or "summary" — call the
// script twice (once per mode) to record both for a given child's week.
//
// Usage:
//   node --experimental-strip-types update-weekly-log.ts '{"child":"Hunter","weekOf":"9/27/2026","entries":[{"Date":"9/8/2026","Subject":"PK (D.6) Choose the letter that you hear","Category (Math/ELA)":"ELA","Questions Answered":14,"Questions Missed":0,"Time Spent":1}]}'
//   node --experimental-strip-types update-weekly-log.ts '{"summary":{"Week Of":"9/13/2026","Child":"Hunter","Math Level":320,"ELA Level":"150-230","Anomalies":"...","Notes":"..."}}'
//
// Environment (see .env.example):
//   GOOGLE_SHEETS_CREDENTIALS  path to a service-account JSON key — the path,
//                              never the JSON contents. The file must live
//                              outside this repo (see SETUP.md step 4).
//   SHEET_ID                   spreadsheet ID; falls back to config.local.json's
//                              "sheetId" field when unset.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleSpreadsheet, type GoogleSpreadsheetWorksheet, type GoogleSpreadsheetRow } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const WEEKLY_SUMMARY_TAB = 'Weekly Summary';
const WEEK_TOTAL_SUBJECT = '— Week Total —';
const WEEK_OF_COLUMN = 'Week Of';

/** A single practiced-skill row for a child's raw log tab. */
interface EntryRow {
  Date: string;
  Subject: string;
  [column: string]: string | number;
}

/** A single week's diagnostic-level + anomaly row for the shared summary tab. */
interface SummaryRow {
  'Week Of': string;
  Child: string;
  [column: string]: string | number;
}

interface EntriesPayload {
  child: string;
  entries: EntryRow[];
  weekOf?: string;
}

interface SummaryPayload {
  summary: SummaryRow;
}

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));

function readSheetIdFromConfig(): string | undefined {
  const configPath = path.join(SKILL_DIR, 'config.local.json');
  if (!fs.existsSync(configPath)) return undefined;
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { sheetId?: string };
  return config.sheetId;
}

/** Parses the sheet's "M/D/YYYY" date format. Unparseable/blank input sorts
 * last rather than throwing, since a bad date shouldn't crash a whole-tab
 * resort over one row. */
function parseSheetDate(value: string): Date {
  const parts = value.split('/').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return new Date(8640000000000000);
  const [month, day, year] = parts;
  return new Date(year, month - 1, day);
}

/** Ensures the tab has a "Week Of" header column (added once, self-healing —
 * safe to call on every run even after the column already exists). Real
 * entry rows never populate it; only writeWeeklyTotal does. */
async function ensureWeekOfColumn(sheet: GoogleSpreadsheetWorksheet): Promise<void> {
  await sheet.loadHeaderRow();
  if (sheet.headerValues.includes(WEEK_OF_COLUMN)) return;
  const newHeaders = [...sheet.headerValues, WEEK_OF_COLUMN];
  if (newHeaders.length > sheet.columnCount) {
    await sheet.resize({ rowCount: sheet.rowCount, columnCount: newHeaders.length });
  }
  await sheet.setHeaderRow(newHeaders);
}

/** Re-sorts every data row in the tab by Date ascending, rewriting the whole
 * tab in one clear+append pass. Rows sharing a date keep their relative
 * order (stable sort), so a same-day "— Week Total —" row added after its
 * week's real entries stays after them. */
async function sortSheetByDate(sheet: GoogleSpreadsheetWorksheet): Promise<void> {
  const rows = await sheet.getRows();
  const headers = sheet.headerValues;
  const plainRows = rows.map((row) => {
    const values: Record<string, string | number> = {};
    for (const header of headers) values[header] = row.get(header) ?? '';
    return values;
  });
  plainRows.sort((a, b) => parseSheetDate(String(a.Date)).getTime() - parseSheetDate(String(b.Date)).getTime());
  await sheet.clearRows();
  if (plainRows.length) await sheet.addRows(plainRows);
}

/** Fill only the currently-blank cells of `values` into `row`, leaving any
 * value a human or a prior run already wrote untouched. Returns the column
 * names that were left alone because they already had a value. */
function fillBlanksOnly(row: GoogleSpreadsheetRow, values: Record<string, string | number>): string[] {
  const skipped: string[] = [];
  for (const [column, value] of Object.entries(values)) {
    const current = row.get(column);
    if (current !== undefined && current !== null && String(current).trim() !== '') {
      skipped.push(column);
      continue;
    }
    row.set(column, value);
  }
  return skipped;
}

async function upsertByKey(
  sheet: GoogleSpreadsheetWorksheet,
  values: Record<string, string | number>,
  keyColumns: string[]
): Promise<{ appended: boolean; skipped: string[] }> {
  const rows = await sheet.getRows();
  const existing = rows.find((r) => keyColumns.every((col) => String(r.get(col) ?? '').trim() === String(values[col] ?? '').trim()));

  if (!existing) {
    await sheet.addRow(values);
    return { appended: true, skipped: [] };
  }

  const skipped = fillBlanksOnly(existing, values);
  await existing.save();
  return { appended: false, skipped };
}

/** Unlike upsertByKey, always overwrites every column in `values` — for
 * derived/computed rows (the weekly rollup) that must match today's true
 * total, never a stale value fill-blanks-only would otherwise preserve. */
async function upsertRecompute(
  sheet: GoogleSpreadsheetWorksheet,
  values: Record<string, string | number>,
  keyColumns: string[]
): Promise<{ appended: boolean }> {
  const rows = await sheet.getRows();
  const existing = rows.find((r) => keyColumns.every((col) => String(r.get(col) ?? '').trim() === String(values[col] ?? '').trim()));

  if (!existing) {
    await sheet.addRow(values);
    return { appended: true };
  }

  existing.assign(values);
  await existing.save();
  return { appended: false };
}

/** Sums Questions Answered / Questions Missed / Time Spent across every real
 * entry (excluding any prior rollup row) whose Date falls in the 7-day
 * window ending on `weekOfStr`, then upserts (recompute, never fill-blanks)
 * a single "— Week Total —" row carrying that sum. */
async function writeWeeklyTotal(sheet: GoogleSpreadsheetWorksheet, child: string, weekOfStr: string): Promise<void> {
  const weekOf = parseSheetDate(weekOfStr);
  const weekStart = new Date(weekOf);
  weekStart.setDate(weekStart.getDate() - 6);

  const rows = await sheet.getRows();
  let questionsAnswered = 0;
  let questionsMissed = 0;
  let timeSpent = 0;
  for (const row of rows) {
    if (String(row.get('Subject') ?? '') === WEEK_TOTAL_SUBJECT) continue;
    const dateStr = String(row.get('Date') ?? '');
    if (!dateStr) continue;
    const date = parseSheetDate(dateStr);
    if (date < weekStart || date > weekOf) continue;
    questionsAnswered += Number(row.get('Questions Answered') || 0);
    questionsMissed += Number(row.get('Questions Missed') || 0);
    timeSpent += Number(row.get('Time Spent') || 0);
  }

  const values = {
    Date: weekOfStr,
    Subject: WEEK_TOTAL_SUBJECT,
    'Questions Answered': questionsAnswered,
    'Questions Missed': questionsMissed,
    'Time Spent': timeSpent,
    'Category (Math/ELA)': '',
    [WEEK_OF_COLUMN]: weekOfStr,
  };
  const { appended } = await upsertRecompute(sheet, values, ['Date', 'Subject']);
  console.log(
    `${appended ? 'Appended' : 'Updated'} week total: ${child} / week of ${weekOfStr} -> ${questionsAnswered} answered, ${questionsMissed} missed, ${timeSpent} min`
  );
}

async function writeEntries(doc: GoogleSpreadsheet, { child, entries, weekOf }: EntriesPayload): Promise<void> {
  const sheet = doc.sheetsByTitle[child];
  if (!sheet) {
    console.error(
      `No tab named "${child}" in this spreadsheet. Tabs found: ${Object.keys(doc.sheetsByTitle).join(', ')}`
    );
    process.exit(1);
  }

  await ensureWeekOfColumn(sheet);

  for (const entry of entries) {
    if (!entry.Date || !entry.Subject) {
      console.error(`Skipping entry missing "Date" or "Subject": ${JSON.stringify(entry)}`);
      continue;
    }
    const { appended, skipped } = await upsertByKey(sheet, entry, ['Date', 'Subject']);
    const label = `${child} / ${entry.Date} / ${entry.Subject}`;
    if (appended) {
      console.log(`Appended: ${label}`);
    } else {
      console.log(`Updated (already existed): ${label}${skipped.length ? ` — left untouched: ${skipped.join(', ')}` : ''}`);
    }
  }

  if (weekOf) {
    await writeWeeklyTotal(sheet, child, weekOf);
  }

  await sortSheetByDate(sheet);
}

async function writeSummary(doc: GoogleSpreadsheet, { summary }: SummaryPayload): Promise<void> {
  let sheet = doc.sheetsByTitle[WEEKLY_SUMMARY_TAB];
  if (!sheet) {
    console.error(
      `No "${WEEKLY_SUMMARY_TAB}" tab in this spreadsheet. Create it first with headers: Week Of, Child, Math Level, ELA Level, Anomalies, Notes.`
    );
    process.exit(1);
  }

  const { appended, skipped } = await upsertByKey(sheet, summary, ['Week Of', 'Child']);
  const label = `${summary.Child} / week of ${summary['Week Of']}`;
  if (appended) {
    console.log(`Appended summary row: ${label}`);
  } else {
    console.log(`Updated summary row (already existed): ${label}${skipped.length ? ` — left untouched: ${skipped.join(', ')}` : ''}`);
  }
}

async function main(): Promise<void> {
  const payloadJson = process.argv[2];
  if (!payloadJson) {
    console.error(
      'Usage: node --experimental-strip-types update-weekly-log.ts \'{"child":"Hunter","entries":[...]}\' OR \'{"summary":{...}}\''
    );
    process.exit(1);
  }

  const payload = JSON.parse(payloadJson) as Partial<EntriesPayload & SummaryPayload>;

  const credsPath = process.env.GOOGLE_SHEETS_CREDENTIALS;
  const sheetId = process.env.SHEET_ID || readSheetIdFromConfig();
  if (!credsPath) {
    console.error('Missing GOOGLE_SHEETS_CREDENTIALS — see .env.example and SETUP.md step 4.');
    process.exit(1);
  }
  if (!sheetId) {
    console.error('Missing SHEET_ID — set it in .env or config.local.json.');
    process.exit(1);
  }

  const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8')) as { client_email: string; private_key: string };
  const auth = new JWT({ email: creds.client_email, key: creds.private_key, scopes: SCOPES });

  const doc = new GoogleSpreadsheet(sheetId, auth);
  await doc.loadInfo();

  if (payload.entries) {
    if (!payload.child) {
      console.error('Payload with "entries" must also include "child".');
      process.exit(1);
    }
    if (!Array.isArray(payload.entries)) {
      console.error('"entries" must be an array.');
      process.exit(1);
    }
    if (payload.entries.length === 0 && !payload.weekOf) {
      console.error('"entries" is empty and no "weekOf" was given — nothing to do.');
      process.exit(1);
    }
    await writeEntries(doc, payload as EntriesPayload);
    return;
  }

  if (payload.summary) {
    if (!payload.summary['Week Of'] || !payload.summary.Child) {
      console.error('"summary" must include "Week Of" and "Child".');
      process.exit(1);
    }
    await writeSummary(doc, payload as SummaryPayload);
    return;
  }

  console.error('Payload must include either "entries" (with "child") or "summary".');
  process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
