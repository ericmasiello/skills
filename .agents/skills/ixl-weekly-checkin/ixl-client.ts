// Shared fetch-only IXL client, implemented once so collect-weekly-data.ts
// and validate-against-sheet.ts don't each carry their own copy. No browser,
// no Playwright: a cookie jar plus three HTTP calls authenticates as Parent,
// after which every analytics/diagnostic endpoint is a plain authenticated
// GET. See docs/adr/0012-ixl-weekly-checkin-replaces-playwright-with-fetch-only-ixl-client.md
// for why this replaced the UI-scraping approach.

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MIN_REQUEST_DELAY_MS = 600;
const MAX_REQUEST_DELAY_MS = 2400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A parent clicking through IXL's pages never fires two requests back to
 * back. Pacing every request with a random human-scale gap keeps this
 * client's traffic shape closer to that than to a script running flat out.
 * Set IXL_SKIP_DELAY to skip this during local test runs. */
async function humanPause(): Promise<void> {
  if (process.env.IXL_SKIP_DELAY) return;
  await sleep(MIN_REQUEST_DELAY_MS + Math.random() * (MAX_REQUEST_DELAY_MS - MIN_REQUEST_DELAY_MS));
}

/** Replays IXL's own parent-login flow: a cookie jar plus a fetch wrapper
 * that keeps it current across requests. */
export class IxlSession {
  private jar = new Map<string, string>();

  private applySetCookie(res: Response): void {
    const raw = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    for (const c of raw) {
      const pair = c.split(';')[0];
      const i = pair.indexOf('=');
      if (i === -1) continue;
      this.jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }

  private cookieHeader(): string {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async req(url: string, opts: RequestInit = {}): Promise<Response> {
    await humanPause();
    const res = await fetch(url, {
      ...opts,
      redirect: 'manual',
      headers: { 'user-agent': UA, cookie: this.cookieHeader(), ...(opts.headers as Record<string, string> | undefined) },
    });
    this.applySetCookie(res);
    return res;
  }

  async getJson<T>(url: string): Promise<T> {
    const res = await this.req(url);
    if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`GET ${url} did not return JSON (got ${text.slice(0, 120)}...)`);
    }
  }
}

export async function login(
  session: IxlSession,
  email: string,
  password: string,
  parentSecretWord: string
): Promise<void> {
  const signinRes = await session.req('https://www.ixl.com/signin');
  const signinHtml = await signinRes.text();
  const tokenMatch = signinHtml.match(/name="formToken"\s+value="([^"]+)"/);
  if (!tokenMatch) throw new Error('Could not find formToken on /signin — IXL may have changed its login page.');

  const ajaxRes = await session.req('https://www.ixl.com/signin/ajax/page', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ pageProductFamily: 'IXL', formToken: tokenMatch[1], username: email, password }).toString(),
  });
  const ajaxJson = (await ajaxRes.json()) as {
    subaccounts?: { isParent: boolean; subAccountEncryptedLogin: string }[];
    familyEncryptedLogin?: string;
  };
  const parentAccount = ajaxJson.subaccounts?.find((s) => s.isParent);
  if (!parentAccount || !ajaxJson.familyEncryptedLogin) {
    throw new Error(`Login step 2 didn't return a parent subaccount — response: ${JSON.stringify(ajaxJson).slice(0, 300)}`);
  }

  const subRes = await session.req('https://www.ixl.com/signin/subaccount', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secretWord: parentSecretWord,
      subAccountEncryptedLogin: parentAccount.subAccountEncryptedLogin,
      rememberUser: 'false',
      familyEncryptedLogin: ajaxJson.familyEncryptedLogin,
      onlyPickingSubUser: 'false',
    }).toString(),
  });
  const subJson = (await subRes.json()) as { redirectUrl?: string };
  if (!subJson.redirectUrl?.includes('/dashboard')) {
    throw new Error(
      `Login step 3 didn't redirect to /dashboard — likely a wrong secret word. Response: ${JSON.stringify(subJson).slice(0, 300)}`
    );
  }
}

export async function discoverChildUserIds(session: IxlSession): Promise<Map<string, string>> {
  const res = await session.req('https://www.ixl.com/dashboard');
  const html = await res.text();
  const map = new Map<string, string>();
  for (const m of html.matchAll(
    /data-userid="(\d+)"[^>]*>\s*<img[^>]*>\s*<span class="display-name js-display-name">([^<]+)</g
  )) {
    map.set(m[2].trim(), m[1]);
  }
  return map;
}

interface UsageSkill {
  skillCode: string | null;
  skillName: string | null;
  gradeShortOrdinal: string | null;
  questionsAnswered: number;
  correctAnswers: number;
  secondsSpent: number;
  isDiagnosticSession: boolean;
}
interface UsageSession {
  sessionStartLocalDateStr: string;
  skills: UsageSkill[];
}
interface UsageRunResponse {
  table: UsageSession[];
}

export interface UsageEntry {
  Date: string;
  Subject: string;
  'Category (Math/ELA)': 'Math' | 'ELA';
  'Questions Answered': number;
  'Questions Missed': number;
  'Time Spent': number;
}

/** YYYY-MM-DD -> M/D/YYYY (no leading zeros), matching how the sheet already stores dates. */
export function toSheetDateFormat(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${m}/${d}/${y}`;
}

export function minutesFromSeconds(seconds: number): number {
  if (seconds < 30) return 0.5;
  return Math.round(seconds / 60);
}

/** Fetches a child's practiced-skill entries for [startDate, endDate]
 * (YYYY-MM-DD), querying Math and ELA separately so the server does the
 * subject classification instead of a human reading each skill's name.
 * Same-day duplicate (date, subject) entries across separate IXL sessions
 * are summed into one row, matching the raw log's own dedup rule. */
export async function fetchUsageEntries(
  session: IxlSession,
  studentId: string,
  startDate: string,
  endDate: string
): Promise<UsageEntry[]> {
  const byKey = new Map<string, UsageEntry>();

  for (const [subjects, category] of [['0', 'Math'] as const, ['1', 'ELA'] as const]) {
    const url =
      `https://www.ixl.com/analytics/student-usage/run?&rosterClass=&courseId=&subjects=${subjects}` +
      `&lowGrade=-2&highGrade=12&startDate=${startDate}&endDate=${endDate}&timePeriod=6&student=${studentId}`;
    const data = await session.getJson<UsageRunResponse>(url);

    for (const sess of data.table ?? []) {
      const date = toSheetDateFormat(sess.sessionStartLocalDateStr);
      for (const sk of sess.skills ?? []) {
        if (sk.isDiagnosticSession) continue; // not practice — excluded from the raw log per SKILL.md
        const subject = `${sk.gradeShortOrdinal} (${sk.skillCode}) ${sk.skillName}`;
        const key = `${date}|${subject}`;
        const existing = byKey.get(key);
        const missed = sk.questionsAnswered - sk.correctAnswers;
        const minutes = minutesFromSeconds(sk.secondsSpent);
        if (existing) {
          existing['Questions Answered'] += sk.questionsAnswered;
          existing['Questions Missed'] += missed;
          existing['Time Spent'] += minutes;
        } else {
          byKey.set(key, {
            Date: date,
            Subject: subject,
            'Category (Math/ELA)': category,
            'Questions Answered': sk.questionsAnswered,
            'Questions Missed': missed,
            'Time Spent': minutes,
          });
        }
      }
    }
  }

  return [...byKey.values()];
}

interface DiagnosticResponse {
  subjectsInfo: {
    subjectName: string;
    overallLevels: { levelId: string; scoreRange: { score?: number; min?: number; max?: number; isDisplayable: boolean } }[];
  }[];
}

/** A still-resolving diagnostic reports `{min, max}` instead of a firm
 * `score` — rendered here as "min-max" to match the sheet's own existing
 * range-style values (e.g. "150-230"). */
export async function fetchDiagnosticLevels(session: IxlSession, studentId: string): Promise<{ math: string; ela: string }> {
  const data = await session.getJson<DiagnosticResponse>(`https://www.ixl.com/diagnostic/stats?user=${studentId}`);
  const levelFor = (levelId: string): string => {
    for (const subj of data.subjectsInfo) {
      const level = subj.overallLevels.find((l) => l.levelId === levelId);
      if (!level) continue;
      if (!level.scoreRange.isDisplayable) return '(not yet displayable)';
      if (level.scoreRange.score !== undefined) return String(level.scoreRange.score);
      return `${level.scoreRange.min}-${level.scoreRange.max}`;
    }
    return '(not found)';
  };
  return { math: levelFor('math'), ela: levelFor('ela') };
}

interface ScoreChartSkill {
  skillName: string;
  score: number;
  questionsAnswered: number;
  secondsSpent: number;
  lastPracticedLocalDateStr: string | null;
}
interface ScoreChartResponse {
  gradesModeData: {
    table: { categories: { categoryCode: string; categoryName: string; skills: ScoreChartSkill[] }[] }[];
  };
}

export interface ScoreChartEntry {
  categoryName: string;
  skillName: string;
  smartScore: number;
  questionsAnswered: number;
  timeSpentMinutes: number;
  lastPracticed: string | null;
}

/** Fetches every skill at `grade` for one subject over [startDate, endDate],
 * then filters to only the ones actually practiced (questionsAnswered > 0)
 * — the live equivalent of checking the Score Chart's own "Practiced
 * skills" checkbox, which fires no separate data request of its own; the
 * unfiltered response already has everything needed. */
export async function fetchScoreChartPracticed(
  session: IxlSession,
  studentId: string,
  subject: 0 | 1,
  grade: number,
  startDate: string,
  endDate: string
): Promise<ScoreChartEntry[]> {
  const url =
    `https://www.ixl.com/analytics/score-chart/run?subject=${subject}&standardDoc=&highscore=true` +
    `&scoresHighlighted=none&scoresDisplayed=all&scoringType=best_attempt&goalOfProficient=true` +
    `&student=${studentId}&grades=${grade}&timePeriod=6&startDate=${startDate}&endDate=${endDate}` +
    `&rosterClass=&courseId=&skillSource=1`;
  const data = await session.getJson<ScoreChartResponse>(url);

  const practiced: ScoreChartEntry[] = [];
  for (const catGroup of data.gradesModeData.table) {
    for (const cat of catGroup.categories) {
      for (const sk of cat.skills) {
        if (sk.questionsAnswered <= 0) continue;
        practiced.push({
          categoryName: cat.categoryName,
          skillName: sk.skillName,
          smartScore: sk.score,
          questionsAnswered: sk.questionsAnswered,
          timeSpentMinutes: minutesFromSeconds(sk.secondsSpent),
          lastPracticed: sk.lastPracticedLocalDateStr,
        });
      }
    }
  }
  return practiced;
}
