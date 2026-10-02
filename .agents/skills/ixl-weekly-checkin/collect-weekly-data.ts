#!/usr/bin/env -S node --experimental-strip-types
// Replaces SKILL.md's old Playwright/UI-scraping Steps 1-2 (login, Usage
// Details log, Diagnostic levels, Score Chart) with the fetch-only client in
// ixl-client.ts (see docs/adr/0012-ixl-weekly-checkin-replaces-playwright-with-fetch-only-ixl-client.md
// for why) — no browser, no screenshots, no
// per-skill "which subject is this" judgment call (the server splits
// Math/ELA for us). Read-only: prints JSON, never writes to IXL or the
// sheet — pipe the "entries" and the diagnostic levels straight into
// update-weekly-log.ts's two payload shapes.
//
// Usage:
//   node --experimental-strip-types collect-weekly-data.ts <child> [options]
//
// Options:
//   --start=YYYY-MM-DD   defaults to 6 days before today (a 7-day window)
//   --end=YYYY-MM-DD     defaults to today
//   --grades=math:2,ela:1
//       Also run the Score Chart anomaly-scan pull for the given grade per
//       subject. Omit on a first call — read the printed diagnostic levels,
//       judge which grade(s) to check (same call SKILL.md's Step 2b already
//       documents), then re-run with this flag set.
//
// Environment (.env, see .env.example):
//   IXL_EMAIL, IXL_PASSWORD, IXL_PARENT_PASSWORD

import { IxlSession, login, discoverChildUserIds, fetchUsageEntries, fetchDiagnosticLevels, fetchScoreChartPracticed } from './ixl-client.ts';

interface Args {
  child: string;
  start: string;
  end: string;
  grades?: { math?: number; ela?: number };
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseArgs(argv: string[]): Args {
  const child = argv[0];
  if (!child || child.startsWith('--')) {
    console.error('Usage: collect-weekly-data.ts <child> [--start=YYYY-MM-DD] [--end=YYYY-MM-DD] [--grades=math:2,ela:1]');
    process.exit(1);
  }
  const opts: Record<string, string> = {};
  for (const arg of argv.slice(1)) {
    const m = arg.match(/^--(\w+)=(.*)$/);
    if (m) opts[m[1]] = m[2];
  }
  let grades: Args['grades'];
  if (opts.grades) {
    grades = {};
    for (const pair of opts.grades.split(',')) {
      const [subject, grade] = pair.split(':');
      if (subject === 'math') grades.math = Number(grade);
      if (subject === 'ela') grades.ela = Number(grade);
    }
  }
  return { child, start: opts.start ?? isoDaysAgo(6), end: opts.end ?? isoDaysAgo(0), grades };
}

async function main(): Promise<void> {
  const { child, start, end, grades } = parseArgs(process.argv.slice(2));
  const { IXL_EMAIL, IXL_PASSWORD, IXL_PARENT_PASSWORD } = process.env;
  if (!IXL_EMAIL || !IXL_PASSWORD || !IXL_PARENT_PASSWORD) {
    console.error('Missing IXL_EMAIL / IXL_PASSWORD / IXL_PARENT_PASSWORD — see .env.example.');
    process.exit(1);
  }

  const session = new IxlSession();
  await login(session, IXL_EMAIL, IXL_PASSWORD, IXL_PARENT_PASSWORD);

  const userIds = await discoverChildUserIds(session);
  const userId = userIds.get(child);
  if (!userId) {
    console.error(`No userId discovered for "${child}". Known names: ${[...userIds.keys()].join(', ')}`);
    process.exit(1);
  }

  const [entries, diagnostic] = await Promise.all([
    fetchUsageEntries(session, userId, start, end),
    fetchDiagnosticLevels(session, userId),
  ]);

  let scoreChart: { math?: unknown; ela?: unknown } | undefined;
  if (grades) {
    scoreChart = {};
    if (grades.math !== undefined) {
      scoreChart.math = { grade: grades.math, skills: await fetchScoreChartPracticed(session, userId, 0, grades.math, start, end) };
    }
    if (grades.ela !== undefined) {
      scoreChart.ela = { grade: grades.ela, skills: await fetchScoreChartPracticed(session, userId, 1, grades.ela, start, end) };
    }
  }

  console.log(JSON.stringify({ child, userId, dateRange: { start, end }, entries, diagnostic, scoreChart }, null, 2));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
