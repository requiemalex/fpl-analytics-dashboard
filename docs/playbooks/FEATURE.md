# Feature

Build something new in three phases, each in its own fresh session, so the
owner's rules shape it before any code exists instead of being found in
the next audit. Read `docs/audits/strategy/RULES.md` first. Folder:
`docs/features/<YYYY-MM-DD>-<slug>/` (index: `docs/features/README.md`).

Phases 2 and 3 use the folder the owner names, or else the most recent
unfinished one (say which).

## Phase 1 — Spec (`/feature 1 <description>`)

No production code. Target under 30 tool calls.

1. Read CLAUDE.md once. Grep README for the sections the feature touches
   and read only those.
2. **Same thing, same way.** One helper (Explore) answers: where does the
   app already do this kind of thing, and with which shared pieces
   (components, helpers, toggles, markers, pickers, stores)? Short answer
   with file paths, stop at 40 tool calls.
3. **Inspect the live API** through the app's proxy for every field the
   feature needs; never assume a field's shape.
4. Write `1-spec.md`:
   - **What the user will see**, in plain English, and where.
   - **What it reuses** (from step 2) and anything new, with why.
   - **The owner's rules, one line each, and how each applies:** minimum
     minutes (which side: user-set or the fixed floor; stopwatch; Hide
     button), comparative colouring, whole numbers, null shown as "—" and
     0-minute players, whole words, selected state, three fonts, same
     layout at every size, few full headings, team/player separation,
     Understat separation and the one player-xGC rule, icons over text,
     no inline captions (a Help guide with keywords and a `search.test.ts`
     question), saved data (store version + `migrate()`), docs.
   - **Where it can't match the rest of the app**, flagged with why (the
     owner decides before it's built).
   - **Questions for the owner**, numbered.
   - **Tests planned** and **size** (small / medium / large, and batches).
5. Add the folder's row to `docs/features/README.md`; commit "Feature
   <slug>: spec". End by listing the questions.

## Phase 2 — Build (`/feature 2 [slug] [owner's answers]`)

Read the spec and the answers given; a question still unanswered that
changes what's built → ask, don't guess. Plan batches of related work
(short list in the reply). **Each batch in a fresh helper, one at a time:**
the brief is the spec's text for it, the rules it touches (quoted),
RULES.md and the Phase 2 rules in
`docs/audits/strategy/PHASE-2-REMEDIATION-PROMPT.md` "Rules for every fix".
The helper builds, adds tests (the rule tests — `fontRule`, `wholeWords`,
`selectedState`, `separation` — must still pass), updates README and Help
in place, and commits with a plain-language subject (the change list
shows it). `npm run check` passes before the next batch. Finally
`npm run probe -- --quick --pages=<touched>`. Write `2-build.md` once:
plain-English summary, what was built per batch, judgement calls, what's
left. Commit "Feature <slug>: build report"; end with `npm run
unreleased`'s output. No release.

`/feature 2 <slug> fix R1–R3` fixes Phase 3's findings the same way and
adds a section to `2-build.md`.

## Phase 3 — Verify (`/feature 3 [slug]`)

Try to break it; report only. Being asked is the owner asking you to run
the app (probes). `npm run check`; `npm run probe -- --pages=<touched>` in
the background. Helpers in parallel (40 calls each): **pressure** (Phase 1
audit mission A on the feature), **rules** (the spec's rule table, each
checked in the built app as text, and the same player's figures agreeing
with every other page), **docs** (Help and README true; Help search finds
it in a user's own words). Write `3-verify.md`: plain-English summary,
findings R1… with the audit severity scale and evidence, and a
recommendation: ready to release, or fix first. Commit "Feature <slug>:
verify report".
