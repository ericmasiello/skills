#!/usr/bin/env -S node --experimental-strip-types
// Writes one week's row for a child into their own tab (tab name = child
// name — this sheet has no shared "Weekly Log" tab). Column values are
// matched by header name, not position. If a row with a matching "Week Of"
// date already exists, only its currently-blank cells are filled in (so a
// value Eric already typed in by hand is never silently overwritten) —
// otherwise a new row is appended. "Math Pace (sec/q)" and "ELA Pace
// (sec/q)" are sheet formulas, not values this script writes directly (see
// PACE_FORMULAS below) — any such keys in the payload are ignored.
//
// Usage:
//   node --experimental-strip-types update-weekly-log.ts '{"child":"Avery","row":{"Week Of":"9/7/2026","Math Level":230,"ELA Level":160,"Math Questions":40,"Math Time (hr)":0.5,"ELA Questions":20,"ELA Time (hr)":0.3,"Anomalies":"...","Notes":"..."}}'
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
import { GoogleSpreadsheet, type GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

/** One week's row as sent by the caller — every column is optional except
 * "Week Of", since a run may only have data for one subject, or none yet
 * for a first-ever week. */
interface WeeklyLogRow {
  'Week Of': string;
  [column: string]: string | number;
}

interface UpdatePayload {
  child: string;
  row: WeeklyLogRow;
}

interface PaceFormulaSpec {
  questions: string;
  time: string;
}

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));

// Each pace column is derived from its own questions/time columns, resolved
// by header name (not a hardcoded column letter) so this survives the sheet
// being reordered by hand.
const PACE_FORMULAS: Record<string, PaceFormulaSpec> = {
  'Math Pace (sec/q)': { questions: 'Math Questions', time: 'Math Time (hr)' },
  'ELA Pace (sec/q)': { questions: 'ELA Questions', time: 'ELA Time (hr)' },
};

function columnLetter(zeroBasedIndex: number): string {
  let n = zeroBasedIndex + 1;
  let letters = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function readSheetIdFromConfig(): string | undefined {
  const configPath = path.join(SKILL_DIR, 'config.local.json');
  if (!fs.existsSync(configPath)) return undefined;
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { sheetId?: string };
  return config.sheetId;
}

async function ensurePaceFormulas(sheet: GoogleSpreadsheetWorksheet, rowNumber: number): Promise<void> {
  const headers = sheet.headerValues;
  await sheet.loadCells(`A${rowNumber}:${columnLetter(headers.length - 1)}${rowNumber}`);

  for (const [paceHeader, { questions, time }] of Object.entries(PACE_FORMULAS)) {
    const paceIndex = headers.indexOf(paceHeader);
    const questionsIndex = headers.indexOf(questions);
    const timeIndex = headers.indexOf(time);
    if (paceIndex === -1 || questionsIndex === -1 || timeIndex === -1) continue;

    const cell = sheet.getCell(rowNumber - 1, paceIndex);
    if (cell.formula) continue; // already has a formula — never overwrite it

    const questionsCol = columnLetter(questionsIndex);
    const timeCol = columnLetter(timeIndex);
    cell.formula = `=IFERROR(${timeCol}${rowNumber}*3600/${questionsCol}${rowNumber},"")`;
  }

  await sheet.saveUpdatedCells();
}

async function main(): Promise<void> {
  const payloadJson = process.argv[2];
  if (!payloadJson) {
    console.error(
      'Usage: node --experimental-strip-types update-weekly-log.ts \'{"child":"Avery","row":{"Week Of":"9/7/2026",...}}\''
    );
    process.exit(1);
  }

  const { child, row } = JSON.parse(payloadJson) as Partial<UpdatePayload>;
  if (!child || !row || !row['Week Of']) {
    console.error('Payload must include "child" and a "row" object with at least "Week Of".');
    process.exit(1);
  }

  const values: WeeklyLogRow = { ...row };
  for (const paceHeader of Object.keys(PACE_FORMULAS)) {
    if (paceHeader in values) {
      console.error(`Ignoring "${paceHeader}" in payload — it's a sheet formula, not a written value.`);
      delete values[paceHeader];
    }
  }

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

  const sheet = doc.sheetsByTitle[child];
  if (!sheet) {
    console.error(
      `No tab named "${child}" in this spreadsheet. Tabs found: ${Object.keys(doc.sheetsByTitle).join(', ')}`
    );
    process.exit(1);
  }

  const rows = await sheet.getRows<WeeklyLogRow>();
  const existing = rows.find((r) => String(r.get('Week Of')).trim() === String(values['Week Of']).trim());

  if (!existing) {
    const newRow = await sheet.addRow(values);
    await ensurePaceFormulas(sheet, newRow.rowNumber);
    console.log(`Appended a new row for ${child}, week of ${values['Week Of']}.`);
    return;
  }

  const skipped: string[] = [];
  for (const [column, value] of Object.entries(values)) {
    const current = existing.get(column);
    if (current !== undefined && current !== null && String(current).trim() !== '') {
      skipped.push(column);
      continue;
    }
    existing.set(column, value);
  }
  await existing.save();
  await ensurePaceFormulas(sheet, existing.rowNumber);

  console.log(`Updated existing row for ${child}, week of ${values['Week Of']}.`);
  if (skipped.length > 0) {
    console.log(`Left untouched (already had a value): ${skipped.join(', ')}`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
