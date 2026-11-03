# Rules sweep

A focused audit: each of the owner's universal rules checked across every
section at once, cheaper than a full audit and run between them. Report
only (adding tests is allowed). Read `docs/audits/strategy/RULES.md` first.
Being asked to run this prompt is the owner asking you to run the app (via
the probes and one-off scripts per `TOOLKIT.md`).

Argument: a subset of the missions below, or a page; default all, whole
app.

## You are the lead — target under 50 tool calls

1. **Baseline.** Read CLAUDE.md once. Record commit and version. `npm run
   check`; `npm run probe -- pages` in the background (its text scan
   covers NaN, "−0", cut-off text, sideways scroll at 1366 and 1920).
2. **Missions (helpers, in parallel).** Each brief: the mission, the
   CLAUDE.md rule text quoted in full, the run folder for its findings
   file, and "follow `docs/audits/strategy/RULES.md`; stop at 40 tool
   calls". Every mission works the same way:
   - **Machine checks first:** the rule's own tests pass (name them), then
     grep for code that goes around the rule's shared helper.
   - **The built app as text,** on every page and overlay in scope, in
     each Data View, with Understat on and off.
   - **Make it machine-checked:** for a rule (or part) no test enforces,
     propose one; where a breach exists now, add it as `it.fails` with the
     finding ID.

| Mission | Rule(s) | Look for |
|---|---|---|
| **1. Minimum minutes** | "Minimum minutes — one rule" | A floor where the user sets minutes, or none where they can't; a hand-written floor check instead of `isUnderMinimum`; the stopwatch missing, a different symbol, amber when nothing shown is under; a Hide button missing where criteria pick players; a Historic Average counting a season under 855 or reaching past 4 |
| **2. Colouring** | "Comparative colouring — one rule" | Rank taken from filtered rows, across positions, or with players under the fixed floor; price/ownership the wrong way round; a club's played, draws or style stats coloured; a colour not via `percentileTint`/`percentileColour`; the palette switch missing one; green or red as a series or decoration |
| **3. Figures** | "Whole numbers", null not 0, 0-minute players | Hard-coded decimals (`toFixed`) instead of `columnForMode`; a count with decimals; a small count's Historic Average not 1 decimal; 0 shown where there is no data; a 0-minute player with any figure but "—" |
| **4. Look** | Whole words, selected state, three fonts, same layout at every size, few full headings | A box narrower than its longest word; a picked thing not soft green or with a green outline (bar the three owner-kept exceptions); a font outside the three tokens; gaps that grow with the window; a heading with under 5 items, or an empty one showing (check with Understat on) |
| **5. Separation** | Team/player separation, Understat separation, one player-xGC rule | A player figure on a team page (beyond current-season line-ups and DEF/GK shots faced); an Understat figure outside violet columns or the toggle; FPL code importing Understat code; a player's Understat xGC or shots faced not from `playerXGC.ts`/`onPitch.ts` |
| **6. Same thing, same way** | "Same thing, same way, everywhere" | One concept coded more than once (a formula, a rank, a rounding, a picker, a toggle); the same control behaving differently on two pages |

3. **Verify and write.** Re-run the cheapest piece of each High or
   Critical finding yourself. New run folder
   `docs/audits/results/<YYYY-MM-DD>-rules-sweep/`; `1-audit.md` in the
   Phase 1 output format, plus a section "Rules not yet machine-checked"
   with the proposed tests. Add its row to `docs/audits/README.md` "Past
   runs"; commit report, row and tests: "Rules sweep <date>: report". The
   owner fixes findings with `/audit 2`.
