/**
 * The alert system's GitHub calls, shared by every alert script
 * (alert.ts, workflow-alert.ts, watchdog.ts).
 *
 * An alert is a GitHub issue that @mentions the owner, so GitHub emails
 * them. One open issue per key, found by a hidden marker in its body:
 *  - raising when none is open opens one (one email);
 *  - raising while one is open just refreshes its text (no email, so a
 *    problem lasting a week doesn't email every day);
 *  - resolving comments and closes it (one "resolved" email).
 *
 * Needs GITHUB_TOKEN (issues: write; actions: read for run history) and
 * GITHUB_REPOSITORY, which every workflow run has.
 */

export const OWNER_HANDLE = "requiemalex";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} isn't set (alerts only run inside a GitHub workflow)`);
  return v;
}

export async function gh(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`https://api.github.com/repos/${env("GITHUB_REPOSITORY")}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env("GITHUB_TOKEN")}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${path}: HTTP ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const marker = (key: string) => `<!-- alert:${key} -->`;

async function openAlert(key: string): Promise<{ number: number } | null> {
  const issues = (await gh(`/issues?state=open&per_page=100`)) as { number: number; body: string | null; pull_request?: unknown }[];
  return issues.find((i) => !i.pull_request && (i.body ?? "").includes(marker(key))) ?? null;
}

/** The link to the workflow run doing the alerting, for the issue text. */
export function currentRunUrl(): string {
  return `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${env("GITHUB_REPOSITORY")}/actions/runs/${env("GITHUB_RUN_ID")}`;
}

export async function raiseAlert(key: string, title: string, text: string): Promise<void> {
  const existing = await openAlert(key);
  const body = `${marker(key)}\n@${OWNER_HANDLE}\n\n${text}\n\n_Last checked: ${new Date().toUTCString()}._`;
  if (existing) {
    await gh(`/issues/${existing.number}`, { method: "PATCH", body: JSON.stringify({ title, body }) });
    console.log(`Updated alert #${existing.number} for ${key} (no new email).`);
  } else {
    const created = (await gh(`/issues`, { method: "POST", body: JSON.stringify({ title, body }) })) as { number: number };
    console.log(`Opened alert #${created.number} for ${key}.`);
  }
}

export async function resolveAlert(key: string, note: string): Promise<void> {
  const existing = await openAlert(key);
  if (!existing) {
    console.log(`No open alert for ${key} — nothing to resolve.`);
    return;
  }
  await gh(`/issues/${existing.number}/comments`, { method: "POST", body: JSON.stringify({ body: `✅ **Resolved.** ${note}\n\n@${OWNER_HANDLE} — nothing for you to do; closing this.` }) });
  await gh(`/issues/${existing.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed", state_reason: "completed" }) });
  console.log(`Resolved alert #${existing.number} for ${key}.`);
}

interface Run {
  id: number;
  status: string;
  conclusion: string | null;
  created_at: string;
  event: string;
}

/** A workflow's recent runs, newest first. */
export async function workflowRuns(workflowFile: string, perPage = 10, query = ""): Promise<Run[]> {
  const data = (await gh(`/actions/workflows/${workflowFile}/runs?per_page=${perPage}${query}`)) as { workflow_runs: Run[] };
  return data.workflow_runs;
}

/** How the run before this one ended ("success", "failure"…), or null if there wasn't one. */
export async function previousConclusion(workflowFile: string): Promise<string | null> {
  const current = Number(process.env.GITHUB_RUN_ID);
  const runs = await workflowRuns(workflowFile);
  return runs.find((r) => r.id !== current && r.status === "completed")?.conclusion ?? null;
}

/** "active", or "disabled_inactivity" / "disabled_manually". */
export async function workflowState(workflowFile: string): Promise<string> {
  return ((await gh(`/actions/workflows/${workflowFile}`)) as { state: string }).state;
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function args(name: string): string[] {
  return process.argv.flatMap((a, i) => (a === `--${name}` && process.argv[i + 1] !== undefined ? [process.argv[i + 1]] : []));
}
