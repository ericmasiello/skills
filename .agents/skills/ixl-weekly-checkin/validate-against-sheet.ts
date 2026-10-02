#!/usr/bin/env -S node --experimental-strip-types
// DRAFT — validates the fetch-only network API (ixl-client.ts, see
// docs/adr/0012-ixl-weekly-checkin-replaces-playwright-with-fetch-only-ixl-client.md
// for why) against the data already recorded in the family's
// tracker sheet. Read-only end to end: logs into IXL via ixl-client.ts (no
// browser, no Playwright), pulls each child's usage log and current
// diagnostic levels straight from IXL's JSON endpoints, and diffs that
// against each child's existing raw-log tab and the most recent Weekly
// Summary row. Writes nothing back to IXL or the sheet.
//
// Looks back as far as the earliest Date already in each child's tab (not
// just the usual 7-day check-in window) so every row that's ever been
// logged has something to compare against.
//
// Usage:
//   node --experimental-strip-types validate-against-sheet.ts
//
// Environment (.env, see .env.example):
//   IXL_EMAIL, IXL_PASSWORD, IXL_PARENT_PASSWORD, GOOGLE_SHEETS_CREDENTIALS,
//   SHEET_ID — same as collect-weekly-data.ts and update-weekly-log.ts.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { IxlSession, login, discoverChildUserIds, fetchUsageEntries, fetchDiagnosticLevels, type UsageEntry } from './ixl-client.ts';

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEEK_TOTAL_SUBJECT = '— Week Total —';

function parseSheetDate(value: string): Date {
  const parts = value.split('/').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return new Date(8640000000000000);
  const [month, day, year] = parts;
  return new Date(year, month - 1, day);
}

async function readSheetEntries(doc: GoogleSpreadsheet, child: string): Promise<UsageEntry[]> {
  const sheet = doc.sheetsByTitle[child];
  if (!sheet) throw new Error(`No "${child}" tab in the spreadsheet. Tabs found: ${Object.keys(doc.sheetsByTitle).join(', ')}`);
  await sheet.loadHeaderRow();
  const rows = await sheet.getRows();
  const entries: UsageEntry[] = [];
  for (const row of rows) {
    const subject = String(row.get('Subject') ?? '');
    if (subject === WEEK_TOTAL_SUBJECT || !subject) continue;
    entries.push({
      Date: String(row.get('Date') ?? ''),
      Subject: subject,
      'Category (Math/ELA)': (row.get('Category (Math/ELA)') === 'Math' ? 'Math' : 'ELA') as 'Math' | 'ELA',
      'Questions Answered': Number(row.get('Questions Answered') || 0),
      'Questions Missed': Number(row.get('Questions Missed') || 0),
      'Time Spent': Number(row.get('Time Spent') || 0),
    });
  }
  return entries;
}

async function readLatestSummary(doc: GoogleSpreadsheet, child: string): Promise<{ weekOf: string; math: string; ela: string } | undefined> {
  const sheet = doc.sheetsByTitle['Weekly Summary'];
  if (!sheet) return undefined;
  await sheet.loadHeaderRow();
  const rows = await sheet.getRows();
  const childRows = rows.filter((r) => String(r.get('Child') ?? '') === child);
  if (!childRows.length) return undefined;
  childRows.sort((a, b) => parseSheetDate(String(b.get('Week Of'))).getTime() - parseSheetDate(String(a.get('Week Of'))).getTime());
  const latest = childRows[0];
  return {
    weekOf: String(latest.get('Week Of') ?? ''),
    math: String(latest.get('Math Level') ?? ''),
    ela: String(latest.get('ELA Level') ?? ''),
  };
}

interface DiffReport {
  child: string;
  matches: number;
  mismatches: { key: string; field: string; sheet: string | number; ixl: string | number }[];
  onlyInSheet: UsageEntry[];
  onlyInIxl: UsageEntry[];
}

function diff(child: string, sheetEntries: UsageEntry[], ixlEntries: UsageEntry[]): DiffReport {
  const key = (e: UsageEntry) => `${e.Date}|${e.Subject}`;
  const sheetByKey = new Map(sheetEntries.map((e) => [key(e), e]));
  const ixlByKey = new Map(ixlEntries.map((e) => [key(e), e]));

  const report: DiffReport = { child, matches: 0, mismatches: [], onlyInSheet: [], onlyInIxl: [] };

  for (const [k, sheetEntry] of sheetByKey) {
    const ixlEntry = ixlByKey.get(k);
    if (!ixlEntry) {
      report.onlyInSheet.push(sheetEntry);
      continue;
    }
    let clean = true;
    if (sheetEntry['Questions Answered'] !== ixlEntry['Questions Answered']) {
      report.mismatches.push({ key: k, field: 'Questions Answered', sheet: sheetEntry['Questions Answered'], ixl: ixlEntry['Questions Answered'] });
      clean = false;
    }
    if (sheetEntry['Questions Missed'] !== ixlEntry['Questions Missed']) {
      report.mismatches.push({ key: k, field: 'Questions Missed', sheet: sheetEntry['Questions Missed'], ixl: ixlEntry['Questions Missed'] });
      clean = false;
    }
    if (sheetEntry['Category (Math/ELA)'] !== ixlEntry['Category (Math/ELA)']) {
      report.mismatches.push({ key: k, field: 'Category', sheet: sheetEntry['Category (Math/ELA)'], ixl: ixlEntry['Category (Math/ELA)'] });
      clean = false;
    }
    // The sheet's value came from the UI's rounded "Active practice: N min" label, not
    // raw seconds, so allow ±1 minute of rounding slop before flagging a real mismatch.
    if (Math.abs(sheetEntry['Time Spent'] - ixlEntry['Time Spent']) > 1) {
      report.mismatches.push({ key: k, field: 'Time Spent', sheet: sheetEntry['Time Spent'], ixl: ixlEntry['Time Spent'] });
      clean = false;
    }
    if (clean) report.matches++;
  }

  for (const [k, ixlEntry] of ixlByKey) {
    if (!sheetByKey.has(k)) report.onlyInIxl.push(ixlEntry);
  }

  return report;
}

function readSheetIdFromConfig(): string | undefined {
  const configPath = path.join(SKILL_DIR, 'config.local.json');
  if (!fs.existsSync(configPath)) return undefined;
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { sheetId?: string };
  return config.sheetId;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function main(): Promise<void> {
  const { IXL_EMAIL, IXL_PASSWORD, IXL_PARENT_PASSWORD, GOOGLE_SHEETS_CREDENTIALS } = process.env;
  const sheetId = process.env.SHEET_ID || readSheetIdFromConfig();
  if (!IXL_EMAIL || !IXL_PASSWORD || !IXL_PARENT_PASSWORD) {
    console.error('Missing IXL_EMAIL / IXL_PASSWORD / IXL_PARENT_PASSWORD — see .env.example.');
    process.exit(1);
  }
  if (!GOOGLE_SHEETS_CREDENTIALS || !sheetId) {
    console.error('Missing GOOGLE_SHEETS_CREDENTIALS or SHEET_ID — see .env.example and SETUP.md.');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'config.local.json'), 'utf8')) as { children: string[] };

  console.log('Opening tracker sheet (read-only)...');
  const creds = JSON.parse(fs.readFileSync(GOOGLE_SHEETS_CREDENTIALS, 'utf8')) as { client_email: string; private_key: string };
  const auth = new JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const doc = new GoogleSpreadsheet(sheetId, auth);
  await doc.loadInfo();

  const sheetEntriesByChild = new Map<string, UsageEntry[]>();
  let earliestDate = new Date();
  for (const child of config.children) {
    const entries = await readSheetEntries(doc, child);
    sheetEntriesByChild.set(child, entries);
    for (const e of entries) {
      const d = parseSheetDate(e.Date);
      if (d < earliestDate) earliestDate = d;
    }
    console.log(`  ${child}: ${entries.length} existing raw-log rows`);
  }

  const startDate = `${earliestDate.getFullYear()}-${String(earliestDate.getMonth() + 1).padStart(2, '0')}-${String(earliestDate.getDate()).padStart(2, '0')}`;
  const endDate = todayIso();
  console.log(`Querying IXL for ${startDate} .. ${endDate} (earliest Date already in the sheet, through today)\n`);

  console.log('Logging into IXL (plain fetch, no browser)...');
  const session = new IxlSession();
  await login(session, IXL_EMAIL, IXL_PASSWORD, IXL_PARENT_PASSWORD);
  console.log('  Logged in as Parent.\n');

  const userIds = await discoverChildUserIds(session);
  console.log('Discovered child userIds:', [...userIds.entries()].map(([n, id]) => `${n}=${id}`).join(', '), '\n');

  const reports: DiffReport[] = [];
  for (const child of config.children) {
    const userId = userIds.get(child);
    if (!userId) {
      console.error(`!! No userId discovered for "${child}" — skipping. Known names: ${[...userIds.keys()].join(', ')}`);
      continue;
    }

    console.log(`--- ${child} (userId ${userId}) ---`);
    const ixlEntries = await fetchUsageEntries(session, userId, startDate, endDate);
    const sheetEntries = sheetEntriesByChild.get(child) ?? [];
    const report = diff(child, sheetEntries, ixlEntries);
    reports.push(report);

    console.log(`  Sheet rows: ${sheetEntries.length} | IXL rows (same window): ${ixlEntries.length}`);
    console.log(`  Clean matches: ${report.matches}`);
    console.log(`  Mismatches: ${report.mismatches.length}`);
    for (const m of report.mismatches.slice(0, 20)) {
      console.log(`    [${m.field}] ${m.key} — sheet=${m.sheet} ixl=${m.ixl}`);
    }
    if (report.mismatches.length > 20) console.log(`    ...and ${report.mismatches.length - 20} more`);

    console.log(`  Only in sheet (not found in IXL's ${startDate}..${endDate} window): ${report.onlyInSheet.length}`);
    for (const e of report.onlyInSheet.slice(0, 10)) console.log(`    ${e.Date} | ${e.Subject}`);
    if (report.onlyInSheet.length > 10) console.log(`    ...and ${report.onlyInSheet.length - 10} more`);

    console.log(`  Only in IXL (not yet logged in the sheet — likely not-yet-recorded days): ${report.onlyInIxl.length}`);
    const sample = [...report.onlyInIxl].sort((a, b) => parseSheetDate(a.Date).getTime() - parseSheetDate(b.Date).getTime());
    for (const e of sample.slice(0, 10)) {
      console.log(`    ${e.Date} | ${e.Subject} | ${e['Category (Math/ELA)']} | ${e['Questions Answered']}q/${e['Questions Missed']}miss/${e['Time Spent']}min`);
    }
    if (sample.length > 10) console.log(`    ...and ${sample.length - 10} more`);

    const diagnostic = await fetchDiagnosticLevels(session, userId);
    const latestSummary = await readLatestSummary(doc, child);
    console.log(`  Diagnostic now: Math=${diagnostic.math} ELA=${diagnostic.ela}`);
    if (latestSummary) {
      console.log(`  Latest Weekly Summary row (week of ${latestSummary.weekOf}): Math=${latestSummary.math} ELA=${latestSummary.ela}`);
      console.log(
        `  Diagnostic match? Math=${String(latestSummary.math) === diagnostic.math ? 'YES' : 'DIFFERS'} ELA=${String(latestSummary.ela) === diagnostic.ela ? 'YES' : 'DIFFERS'}`
      );
    } else {
      console.log('  No Weekly Summary row found for this child.');
    }
    console.log('');
  }

  console.log('=== Summary ===');
  for (const r of reports) {
    console.log(
      `${r.child}: ${r.matches} match, ${r.mismatches.length} mismatch, ${r.onlyInSheet.length} only-in-sheet, ${r.onlyInIxl.length} only-in-ixl (not yet logged)`
    );
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
