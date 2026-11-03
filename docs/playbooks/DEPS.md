# Dependencies

Update the app's dependencies safely: one group at a time, each checked
and committed on its own, a group that breaks anything rolled back. Read
`docs/audits/strategy/RULES.md` first. Being asked to run this prompt is
the owner asking you to update and commit, and to run the app for it (the
quick probe; an isolated desktop launch for Electron).

Arguments: `check` (report what's out of date and stop), `major` (take
major versions too; default minor and patch only), a group name (only
that group).

## You are the lead — target under 30 tool calls

### Step 1 — What's out of date (lead)

- `git status` must be clean (stop otherwise); `git pull --rebase`.
- `npm outdated --workspaces --include-workspace-root` and `npm audit
  --omit=dev` (security advisories in what ships), output capped.
- Group them: **1. client runtime** (React and the client's libraries),
  **2. server runtime** (Express and the server's), **3. build and
  types** (Vite, TypeScript, esbuild, tsx, `@types/*`), **4. testing**
  (Vitest, Testing Library, Playwright), **5. desktop** (Electron,
  electron-builder; always last). Security fixes for shipped code go
  first, whatever the group.
- Major versions: list each with one line on what it changes (its release
  notes), and leave them unless `major` was given. `check` given: reply
  with the table and stop.

### Step 2 — Each group in a fresh helper, one at a time

Groups share `package-lock.json`, so never in parallel. The brief: the
group's packages and target versions, RULES.md, and:

- Update with `npm install <pkg>@<version> [-w client|server]`.
- `npm run check`; for groups 1, 3 and 5 also `npm run probe -- --quick`;
  for group 5 also an isolated desktop launch (a wrapper calling
  `app.setPath("appData", …)` before `require`-ing `electron/main.js`;
  `env -u ELECTRON_RUN_AS_NODE`; never the owner's `%APPDATA%` folder):
  the window loads and the isolated log shows no error.
- `npm run legal:notices` (CLAUDE.md "Name and legal").
- All good → commit package files and notices: "Update <group>: <pkg>
  <old>→<new>, …".
- Something fails → try the group's packages one at a time to find the
  one that breaks; commit the ones that pass; restore the failing one
  (`git checkout` its package files, `npm install`). Change app code only
  for a mechanical rename the package's own notes call for; anything more
  comes back as a finding, never a weakened test.
- Stop at 40 tool calls; reply with a few lines: updated, held back, why.

### Step 3 — Report (lead)

Final `npm run check`. Reply with a table: package, from, to, result
(updated / held back and why / major left for the owner), the security
advisories before and after, then `npm run unreleased`'s output. No
release.
