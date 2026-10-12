#!/usr/bin/env -S node --experimental-strip-types
// Fetches one child's IXL practice time for "today" and decides whether
// it clears the daily 15-minute floor — the data-collection half of the
// ixl-daily-checkin skill; SKILL.md's steps own the Skylight-chore and
// Apple-Reminder actions this script's decision feeds into.
//
// Login/fetch logic lives in ../_ixl-shared/ixl-client.ts (shared with
// ixl-weekly-checkin — see docs/adr/0014-*.md), not duplicated here.
//
// What "today" means, and the target it's checked against, depends on the
// day of the week — this script derives both from the date itself rather
// than taking a --mode flag, so a caller can never pass a mismatched mode:
//   - Mon-Fri ("weekday"): just today, target 15 minutes.
//   - Sat ("saturday"): just today, target 15 minutes — EXCEPT if zero
//     minutes are logged at all, which reports action "skip" (Saturday is
//     deliberately flexible; a busy Saturday with no practice yet isn't a
//     shortfall, it's a day not started). Any non-zero amount under target
//     is a real shortfall, same as a weekday.
//   - Sun ("sunday"): Saturday + Sunday summed together against a
//     30-minute combined target (2 x 15) — Sunday is the makeup day for
//     whatever Saturday came up short (including a skipped/zero Saturday),
//     so the two days' minutes are pooled rather than checked separately.
//     No skip-if-zero exception here; Sunday is the last chance.
//
// Usage:
//   node --experimental-strip-types collect-daily-data.ts <child> [--date=YYYY-MM-DD]
//
// --date overrides "today" (for testing a specific day's logic instead of
// whatever day it actually is right now) — every date/weekday calculation
// below is relative to it.
//
// Environment (../_ixl-shared/.env, see ../_ixl-shared/.env.example):
//   IXL_EMAIL, IXL_PASSWORD, IXL_PARENT_PASSWORD

import { IxlSession, login, discoverChildUserIds, fetchUsageEntries } from '../_ixl-shared/ixl-client.ts';

const DAILY_TARGET_MINUTES = 15;

interface Args {
  child: string;
  date: string;
}

function parseArgs(argv: string[]): Args {
  const child = argv[0];
  if (!child || child.startsWith('--')) {
    console.error('Usage: collect-daily-data.ts <child> [--date=YYYY-MM-DD]');
    process.exit(1);
  }
  let date: string | undefined;
  for (const arg of argv.slice(1)) {
    const m = arg.match(/^--date=(.*)$/);
    if (m) date = m[1];
  }
  return { child, date: date ?? todayIso() };
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** getDay(): 0=Sunday..6=Saturday. Constructed at local noon so a date-only
 * string never rolls to the adjacent day under a timezone offset. */
function dayOfWeek(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getDay();
}

function roundUpTo5(n: number): number {
  return Math.ceil(n / 5) * 5;
}

type Mode = 'weekday' | 'saturday' | 'sunday';
type Action = 'ok' | 'shortfall' | 'skip';

interface Decision {
  child: string;
  userId: string;
  mode: Mode;
  dateRange: { start: string; end: string };
  totalMinutes: number;
  target: number | null;
  shortfallMinutes: number;
  action: Action;
}

function decide(mode: Mode, dateRange: { start: string; end: string }, totalMinutes: number): Pick<Decision, 'target' | 'shortfallMinutes' | 'action'> {
  if (mode === 'saturday' && totalMinutes === 0) {
    return { target: null, shortfallMinutes: 0, action: 'skip' };
  }
  const target = mode === 'sunday' ? DAILY_TARGET_MINUTES * 2 : DAILY_TARGET_MINUTES;
  const shortfallMinutes = roundUpTo5(Math.max(0, target - totalMinutes));
  return { target, shortfallMinutes, action: shortfallMinutes > 0 ? 'shortfall' : 'ok' };
}

async function main(): Promise<void> {
  const { child, date } = parseArgs(process.argv.slice(2));
  const { IXL_EMAIL, IXL_PASSWORD, IXL_PARENT_PASSWORD } = process.env;
  if (!IXL_EMAIL || !IXL_PASSWORD || !IXL_PARENT_PASSWORD) {
    console.error('Missing IXL_EMAIL / IXL_PASSWORD / IXL_PARENT_PASSWORD — see ../_ixl-shared/.env.example.');
    process.exit(1);
  }

  const dow = dayOfWeek(date);
  const mode: Mode = dow === 6 ? 'saturday' : dow === 0 ? 'sunday' : 'weekday';
  const dateRange = mode === 'sunday' ? { start: addDays(date, -1), end: date } : { start: date, end: date };

  const session = new IxlSession();
  await login(session, IXL_EMAIL, IXL_PASSWORD, IXL_PARENT_PASSWORD);

  const userIds = await discoverChildUserIds(session);
  const userId = userIds.get(child);
  if (!userId) {
    console.error(`No userId discovered for "${child}". Known names: ${[...userIds.keys()].join(', ')}`);
    process.exit(1);
  }

  const entries = await fetchUsageEntries(session, userId, dateRange.start, dateRange.end);
  const totalMinutes = entries.reduce((sum, e) => sum + e['Time Spent'], 0);
  const { target, shortfallMinutes, action } = decide(mode, dateRange, totalMinutes);

  const decision: Decision = { child, userId, mode, dateRange, totalMinutes, target, shortfallMinutes, action };
  console.log(JSON.stringify(decision, null, 2));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
