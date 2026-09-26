# Testing & Fix Notes

Compiled from a full manual test pass of the scheduling engine. Two parts:
**Part 1** is codebase-agnostic — it applies to any similar scheduling app
(including future ones brought up to this level) and contains no file paths
or line numbers. **Part 2** is specific to this repository's current
implementation (djcjoiner/App.jsx) and will go stale if the code around it
changes — re-verify line numbers against the file before relying on them.

---

## PART 1 — Generic Principles (portable to any similar scheduling app)

### 1A. Process rules for working on this kind of app
1. Test thoroughly; report exact pass/fail per step. Log findings and keep
   testing rather than fixing mid-batch, unless explicitly told to fix now.
2. For any nontrivial redesign, explain the design back in the requester's
   own words and get explicit confirmation before writing code.
3. Never silently remove or change a previously-agreed feature/behavior
   based on your own reasoning that it seems superseded — always ask first,
   even if the reasoning seems sound.
4. UI/visual elements must match the app's existing established design
   language exactly (e.g. the app's own styled confirm dialog, never a
   generic browser default; text weight/layout matching sibling entry
   types).
5. Verify a screenshot or data claim carefully (pixel-level or by checking
   the underlying data) before asserting it as fact. If genuinely ambiguous,
   say so and ask rather than presenting a confident-sounding guess.
6. Treat any documented code line reference as provisional — re-check it
   against the live file before trusting it, since code shifts over time.

### 1B. Design principles learned from bugs found this pass
1. **Undo/redo must re-verify, not just replay.** Restoring a stored
   snapshot of "what this record looked like before" is not the same as the
   record being *correct* afterward — a snapshot can capture an
   intermediate value from mid-cascade (valid only in a different context)
   rather than the true final state. Undo/redo should re-run the relevant
   recalculation after restoring positions, not trust snapshots blindly.
2. **Scope "grouped undo" strictly to one user action.** A shared/global
   "currently grouping steps together" flag risks merging two separate,
   unrelated user actions into a single undo click if their background work
   overlaps in time (one action's cascade still finishing when the next
   action starts).
3. **Watch identity continuity across grouped undo steps.** If one step in
   a group re-creates a deleted record and the storage layer assigns it a
   new identity/ID, any other step in the same group that still references
   the old ID will silently fail to reapply. Recreate-then-reference
   patterns inside one grouped undo need explicit ID handoff.
4. **A background self-correction pass needs to cover everything it can, or
   explicitly repair what it can't.** If it deliberately excludes a
   category of record (e.g. manually locked ones) from automatic
   correction, that exclusion needs its own separate repair path —
   otherwise those records can go permanently stale with zero self-healing.
5. **A manually-set value of zero should generally mean "remove this,"** not
   "save a locked zero." Locking a zero-value record can make it invisible
   to normal cleanup sweeps forever.
6. **Decide explicitly whether a conflict/lock mechanism reacts across
   boundaries.** A protection scoped to "within one work item" needs a
   deliberate decision about whether it should also react when a
   *different* item claims the same shared resource (e.g. a person's other
   time slot) — otherwise a protected value in item A can go silently
   invalid the moment item B changes, with no automatic or visible path
   back to correctness.
7. **An input field's computed maximum should never silently swallow every
   value typed into it.** If the cap can legitimately land at zero, the
   field needs to explain why, and/or still accept a value when the real
   fix requires two related manual edits done in sequence (each briefly
   "overcommitting" until the other side is also corrected).
8. **A rebalancing engine that only adjusts/deletes existing records (never
   creates new ones) can silently under-deliver.** If a mutation reduces
   the total capacity available across the days/slots a work item already
   occupies, the engine can run out of places to put the remaining budget
   and just drop it, with no warning. Whether the right fix is "auto-extend"
   or "flag the shortfall for a human to resolve" is a real design decision
   that can differ by scenario — decide it deliberately, don't default to
   either silently.
9. **A per-entry display badge should show that entry's own real number,**
   never a static total repeated identically across many different
   days/entries — otherwise a human can't visually audit correctness from
   the schedule at all.
10. **Batch what renders, even if the underlying writes must stay
    sequential.** If a background process can trigger several sequential
    correction passes before settling, showing each intermediate pass on
    screen creates confusing flicker that looks like several bugs
    happening in a row when it's really one process settling. Sequence the
    writes if correctness requires it; don't force the user to watch each
    intermediate render.

---

## PART 2 — djcjoiner-Specific Implementation Notes

*(All line numbers as of this writing, before any of the fixes below were
applied. Re-check against current `src/App.jsx` before use.)*

### 2A. Confirmed bugs

1. **Undo ID-swap breaks sibling steps in the same bundle.**
   `applyUndoStep`'s `deleteEntry` case (~1293-1307) re-inserts the deleted
   row via `POST`, which gets a brand-new server-assigned id. Any other step
   in the same bundle that still references the entry's *original* id (e.g.
   a `moveEntry`/`editEntry` step, ~1308-1320) can no longer find/patch that
   row and silently no-ops. Reproduced: dragging an entry onto a
   non-workable day (self-deletes + recalculates a sibling correctly) then
   Undo left the entry restored at the wrong location with un-recalculated
   (overrun) hours.

2. **`bundlingRef` is a single unscoped flag — cross-action bundling race.**
   Declared once (~1248) with no per-action scoping. Multiple call sites
   push their primary undo step *before* setting `bundlingRef.current=true`
   (e.g. `handleDrop` pushes `moveEntry` at ~2494, sets the flag at ~2510;
   `saveEntry`'s edit branch pushes `editEntry` at ~2000, sets the flag at
   ~2003; `performGroupMove` pushes `moveMultiple` at ~2218, sets the flag
   at ~2283). If one action's async cascade is still inside its
   `bundlingRef=true` window when a separate, later action starts and
   pushes its own primary step, that step merges into the still-open bundle
   from the earlier action instead of starting its own. Reproduced as
   "undo undid two edits in one click" / a manual edit "linking to the
   previous entry."

3. **Manual edit to zero hours locks instead of deleting.**
   `saveEntry`'s edit branch (~1978-2021) always sets
   `hoursLocked = data.entryType!=="misc"` (~1990) regardless of the hours
   value — no check for `data.hours<=0`. A manually-zeroed entry gets
   PATCHed to `hours:0, hours_locked:true` instead of being removed via the
   same path `removeEntry` (~2027) uses. Because `computeItemPlan`
   (~1762-1799) excludes locked entries from its day-by-day walk entirely,
   the locked zero-hour entry becomes permanently invisible to cleanup.

4. **Cross-item lock isolation.**
   `unlockStaleLocksAt` (~1810-1821) and `unlockAllLocksInItem`
   (~1848-1856) are both scoped by `subItemId` — they only reconsider a
   locked entry belonging to the *same* item. When a different item's entry
   fills a staff member's other slot on the same day and consumes their
   full remaining capacity, an existing locked entry for the first item is
   never revisited, even though it's now impossible. Reproduced live: one
   staff member with Slot 1 = Job A (locked, flagged "Overcommitted") and
   Slot 2 = Job B (using their full day) — Job A's entry has zero real room
   but stays at its stale locked value indefinitely.

5. **Edit-modal Hours field hard-blocks correction once `maxHours` hits 0.**
   `maxHours` (EntryModal, ~3293-3301) computes remaining room for one slot
   as `productiveHours − the OTHER slot's current stored hours`. The Hours
   input's `onChange` (~3499/3540) does
   `Math.min(Number(e.target.value), maxHours)`. When the sibling slot
   already claims the full day, `maxHours` is exactly 0 and every keystroke
   is silently clamped back to 0 — no message, no way to type a valid
   number. The unconditional Remove button (~3548) is the only working
   escape hatch today.

6. **Recalculation can't extend an item's schedule — silent budget
   shortfall on move.**
   `computeItemPlan` (~1762-1799, used by every mutation via
   `recalculateItem`, ~1876-1907) only redistributes hours across days that
   *already have an entry* for that item — it never creates a new day.
   `performGroupMove`'s row-offset mechanic (preserving relative staff-row
   position across a multi-entry move) can swap in lower-daily-capacity
   staff on the same set of days, reducing total available capacity below
   the item's budget with no warning. Confirmed with exact numbers: a 43h
   item moved from two staff (7h/day + 6.5h/day caps) to two others
   (6h/day + 5h/day caps) across the same 4 days landed at 22.5h + 18.5h =
   41h scheduled — 2h permanently short, flagged "under" on the last day.

7. **Undo/redo never re-run recalculation after restoring positions.**
   None of `applyUndoStep`/`applyRedoStep`/the standalone branches of
   `handleUndo`/`handleRedo` call `recalculateItem` after restoring
   staffId/dateStr/slot/hours — they only replay the exact snapshot
   captured at push time. Confirmed live: undoing a group move left a
   restored entry stuck at an hours value that was only valid in the
   *moved* context's sibling conflict, not the restored one. **Note:** for
   *unlocked* entries this self-heals within a few seconds via the
   always-on ambient correction pass (`oneCorrectionPass`/
   `computeHoursCorrections`, ~2557-2655) — but that pass explicitly skips
   locked entries (~2590), so a locked entry stuck this way has no
   self-healing path at all.

8. **Visible multi-pass flicker / slow settling on undo of multi-step
   bundles.** Bundle steps are applied sequentially with `await`
   (~1531-1534 undo, ~1620-1623 redo) — deliberately, to avoid an earlier
   race condition where concurrent PATCH/DELETE calls on the same entry
   could let the wrong one "win." Each step's `setEntries` renders before
   the next step runs, so a multi-step undo visibly flickers through
   intermediate states before settling (reported as "went through three
   different calculations," "ran very slow").

9. **Redo can silently lose steps.** When a bundle step's undo application
   returns `null` (the failure mode in bug #1), it's simply dropped
   (`if(r)redoSteps.push(r)`, ~1533) instead of surfaced. The resulting
   redo bundle then has fewer steps than the original undo bundle, so redo
   runs out one step earlier than expected. Confirmed live: redo button
   greyed out after one click when two were expected.

10. **Display: item-total badge shown instead of real per-day hours.**
    Confirmed as a real bug by direct user testing. The compact entry
    chip's second line (`{subItemName} · {hours}h`-style text) appears to
    show the *same* number (the item's total_hours) identically across many
    different days/entries for the same item, rather than that entry's own
    real stored hours — the only place a genuinely real per-entry number
    reliably shows is a person's own final/completing day for that item.
    This made visual auditing from the grid alone unreliable; real values
    had to be confirmed via the sibling-slot "X Hours Available" indicator
    or by opening each entry directly. **Exact code location not yet
    found — needs investigation during the fix pass**, since it directly
    affects how bug #4/#6's shortfall-visibility fix (below) can be shown
    to the user.

### 2B. Agreed fix decisions
1. ✅ **FIXED. Zero-hours manual edit** (bug #3): route through the same
   delete path `removeEntry` uses, instead of PATCHing
   `hours:0, hours_locked:true`.
2. ✅ **FIXED. Undo/redo engine** (bugs #1, #2, #7, #8, #9): `bundlingRef`
   replaced with a per-action `Symbol()` token threaded through every
   `pushUndo` call an action makes (directly or via `unlockStaleLocksAt`/
   `unlockAllLocksInItem`/`recalculateItem`, which now take an optional
   `token` + `silent` param) - a step only merges into the stack-top if that
   entry carries the SAME token, so two separate actions can never merge
   even if their async cascades overlap in time. `applyUndoStep`/
   `applyRedoStep` were rewritten to take and return a `pool` (this action's
   running view of the entries) instead of reading the component's own
   stale `entries` closure, and `remapStepIds` fixes up any later step in
   the same bundle that referenced an id a `deleteEntry`/`addEntries` step
   just recreated under a new one. After a bundle (or single step) finishes
   restoring positions, `resettleItemsAfterUndoRedo` silently re-runs
   `unlockAllLocksInItem`+`recalculateItem` on every item it touched (same
   as every forward mutation), instead of trusting the raw snapshots to
   already be correct. `handleUndo`/`handleRedo` now share ALL their
   per-type logic with `applyUndoStep`/`applyRedoStep` (previously
   duplicated), and a bundle's steps no longer render to the screen one at
   a time - one combined `setEntries` after the whole action settles.
   Verified live via Playwright: a drag that makes the moved entry
   self-delete + cascade a sibling's hours, then Undo/Redo, restores
   everything exactly (including the id-swap case); two genuinely separate
   actions with an artificially-overlapping in-flight network delay still
   get two independent undo entries, not one merged click.
3. ✅ **FIXED. Cross-item lock conflict** (bug #4, and the modal trap in bug
   #5): NOT an automatic cross-item cascade/auto-unlock. Instead:
   (a) `computeJobEntryMeta` now computes `itemShortfall` (the item's total
   budget minus everyone's real effective hours across it) and `JobBlock`
   shows it alongside the existing "⚠ Overcommitted" flag whenever the
   entry is locked (`⚠ Overcommitted · Nh short`), so the user has what's
   needed to decide how to resolve it manually (extra hours, overtime,
   Saturday work, etc.) without the app guessing;
   (b) the edit modal's `maxHours` no longer hard-caps based on the sibling
   slot's *current* stored value when editing an entry that's already
   locked — that's a deliberate manual correction (possibly of exactly this
   conflict), not a fresh scheduling choice, so it's capped only by the
   staff member's own daily hours instead. A warning still shows if the
   sibling slot has real hours, prompting the user to check it too. A
   brand-new or still-unlocked entry keeps the original hard cap, so it
   can't accidentally create a fresh overcommitment;
   (c) after each manual edit, only that item recalculates (already the
   existing per-item behavior in `saveEntry`'s edit branch) — no forced
   cross-item cascade.
   **Extra bug found and fixed while verifying this**: `oneCorrectionPass`'s
   final effective-hours capping step applied to every entry regardless of
   `hoursLocked`, contradicting its own documented intent (a locked entry
   is supposed to be fully protected from the ambient pass). In practice
   this meant a locked entry that lost the same-day scheduling-order
   tie-break to a sibling from a *different* item had its manually-set
   hours silently forced back down moments after being corrected by hand —
   the fix in (b) alone would have been cosmetic without this, since the
   corrected value could never actually stick. Now skipped for any locked
   entry, matching the rest of the ambient pass.
4. **Move-caused budget shortfall** (bug #6): auto-extend — recalculation
   should add new entries to cover the shortfall automatically. This is
   explicitly different from decision #3 above (cross-item conflict stays
   manual/flagged) — the user confirmed these two scenarios get different
   treatment.
5. **Item-total-badge display bug** (bug #10): needs fixing so entries show
   their own real hours, not a static total repeated across days. Code
   location not yet found — pending investigation.

### 2C. Agreed fix order
1. Zero-hours manual edit → delete (contained, low risk).
2. Undo/redo engine fixes (biggest lift; stabilizes everything tested from
   here on, since further testing depends on undo/redo being trustworthy).
3. Cross-item conflict display + modal-unblock fix.
4. Move-caused budget shortfall auto-extend (biggest redesign — bring back
   a specific design for confirmation before coding, same as the earlier
   group-scheduling rewrite this session).

*(Where the item-total-badge fix (#5 in 2B) lands in this order is not yet
finalized — it's needed for #3 above to actually show a real shortfall
number, so it likely needs to land at or before step 3.)*

### 2D. Open questions
1. Exact code location of the item-total-badge display bug (2A #10) — not
   yet found.
2. Whether the display-badge fix should be sequenced before or alongside
   the cross-item conflict fix (2C step 3), since that fix's "show the
   shortfall number" requirement depends on accurate per-entry display.
3. Exact mechanics of "auto-extend" for the move-caused shortfall case (2C
   step 4) — which staff continue the extension, what day-selection rules
   apply (likely reusing `buildGroupAutoFill`'s day-by-day coordination
   logic) — not yet designed in detail; to be brought back for explicit
   confirmation before coding, per the standing redesign-confirmation rule.
