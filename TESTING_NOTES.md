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
11. **Undo must handle every record in a spot, not just one.** Normally
    each spot on a schedule holds one job, but if the app lets a user put
    two jobs in the same spot on purpose (e.g. a "Schedule Anyway"
    option), undo/redo has to track and restore both of them. Undo code
    written as if a spot can only ever hold one record will quietly lose
    track of the second one and can delete it for good. Test undo/redo
    specifically on a doubled-up spot.

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
4. ✅ **FIXED. Move-caused budget shortfall** (bug #6): auto-extend.
   `computeItemPlan` now returns `{plan, remaining}` (previously just the
   plan) — `remaining` is whatever budget couldn't be placed on any of the
   item's existing days. A new `extendItemIfShort(subItemId, pool, token)`,
   called only after Move's and Copy's own `recalculateItem` (single-entry
   and group, both), checks for that leftover and if found, continues the
   schedule forward from the item's last existing day using the exact same
   coordinated day-by-day walk (`buildGroupAutoFill`) a brand-new schedule
   uses — picking up with whoever has a real, unlocked entry on that last
   day, at their already-established slots, until the shortfall is fully
   placed. The new entries share the *same* undo token as the move/copy, so
   undoing it also undoes the extension in one click. A brief message
   ("Extended by N days to cover the full Xh budget") shows so the new
   entries aren't a silent surprise — flagged as easy to drop later if it
   feels unnecessary in practice. Deliberately NOT wired into Delete or a
   plain manual edit — shrinking the schedule is the user's explicit intent
   there, not something to compensate for automatically; this is explicitly
   different treatment from decision #3 above (cross-item conflict stays
   manual/flagged) — the user confirmed these two scenarios get different
   treatment. Verified live via Playwright with the exact Laundry W
   numbers: a group move that swaps in two lower-capacity staff across the
   same two days comes up 8h short: the fix adds a third day split
   proportionally between the two continuing staff (4.5h + 3.5h), landing
   the item back at its exact 30h test budget.
5. **Item-total-badge display bug** (bug #10): needs fixing so entries show
   their own real hours, not a static total repeated across days. Code
   location not yet found — pending investigation.

### 2C. Agreed fix order
1. ✅ Zero-hours manual edit → delete (contained, low risk).
2. ✅ Undo/redo engine fixes (biggest lift; stabilizes everything tested
   from here on, since further testing depends on undo/redo being
   trustworthy).
3. ✅ Cross-item conflict display + modal-unblock fix.
4. ✅ Move-caused budget shortfall auto-extend.

All four agreed fixes are shipped. The remaining open item is #5 in 2B (the
item-total-badge display question) — see 2D below; it turned out to be more
nuanced than first thought (see the note under 2D #1), so it needs a fresh
look rather than being folded into any of the four above.

### 2E. Logged for a later fix batch (not yet fixed)

1. **FIXED. (Was: HIGH PRIORITY - CONFIRMED REAL DATA LOSS.) Undo/redo can't correctly
   represent a deliberately-duplicated cell, and can now permanently
   delete one of the two entries with no recovery path.** The undo/redo
   engine (`applyEntriesSnapshot`, `cellKey`) diffs snapshots by
   `staffId|dateStr|slot`, assuming at most one entry per cell - true for
   every normal mutation, but the app has a separate, intentional feature
   (`saveEntry`'s "new" branch, the `conflictAlert`/"Schedule Anyway" confirm
   dialog) that lets a user deliberately create a SECOND entry in an
   already-occupied cell, shown in the grid as `⚠ Conflict`
   (`conflictKeys`/`entriesByKey` already track this - keyed by the same
   cell string, with more than one entry per key). When a cell holds two
   entries, `cellKey`-based diffing can only "see" one of them (a `Map`
   silently keeps the last one written), so undoing/redoing an action that
   touches that state drops the other entry from consideration instead of
   restoring both.
   Originally reproduced against a pre-fix group move (see 2A/2B below,
   "group-move destination collision") that left two entries stacked in
   one cell - Undo could not cleanly separate them back to their
   original, distinct positions.
   RE-CONFIRMED LIVE, WORSE THAN ORIGINALLY SCOPED: with a genuine
   Conflict pair on the grid (two entries sharing one cell via "Schedule
   Anyway"), dragging ONE of them to a new slot worked correctly. But
   clicking Undo twice afterward made the OTHER entry (the one that
   caused the conflict, never touched by the drag) vanish outright - a
   real `DELETE`, not a display glitch: Job Summary confirmed its whole
   item as fully unscheduled again. The Undo button then greyed out
   with no further Undo/Redo available to recover it - permanent data
   loss with the stack exhausted. This time the missing entry was a
   disposable test entry so nothing needed manually restoring, but a
   real production entry lost this way would need to be manually
   recreated from memory, with no way to recover the original via the
   app itself.
   Likely fix direction: key the diff by entry `id` instead of by cell
   whenever `conflictKeys` shows more than one entry sharing that cell (a
   plain per-cell diff for the common case, falling back to id-based
   matching only for the cells that are actually doubled up).
   - What shipped: `applyEntriesSnapshot` (undo/redo's "make the DB
     match this snapshot" sync) no longer builds one-entry-per-cell
     `Map`s. A new `matchEntriesByCell` groups both snapshots by cell
     and matches each cell's entries as a LIST: first by `id`, then by
     what the entry is (`entryIdentity`: job/item/note + `created_at`,
     which survives the id churn of a delete+recreate), then pairs off
     whatever is left in order. Leftover current entries are deleted,
     leftover target entries recreated (original `created_at` kept). For
     an ordinary one-entry cell this is exactly the old cell-for-cell
     behaviour, so normal undo/redo is unchanged; a doubled cell no
     longer collapses to one entry.
   - Root cause confirmed against a pre-fix baseline (worktree + second
     vite port): Conflict pair A+B in one cell, drag B away, Undo ->
     the cell `Map` only "saw" B, so the sync DELETEd B at its new spot
     and PATCHed A's row into a copy of B - A (never touched by the
     drag) was gone from the DB. Same flaw could also DUPLICATE an
     entry when undoing the "Schedule Anyway" creation itself.
   - Tests: `test-dupcell-undo.mjs` (seeded Conflict pair: drag, undo,
     redo, undo, reload - both entries and their scheduling order
     survive) and `test-dupcell-undo-ui.mjs` (the exact live repro via
     the UI: Schedule Anyway -> drag -> Undo x2 -> Redo x2, DB checked
     exactly at every step). Both FAIL on the pre-fix baseline, PASS on
     the fix. `test-undo-regression.mjs` (single move, edit, delete,
     auto-fill create, group move - undo/redo each exact incl.
     `created_at`) passes on both baseline and fix.
   - Unblocks re-adding "Schedule Anyway" to the "No Room That Day"
     prompt (see item 7 below) - not done in this fix, separate change.

2. **Multi-entry group copy doesn't auto-open the ESE modal for a Catch-up
   result.** `performGroupCopy` and the single-entry ctrl+drag copy path
   now both correctly land a copy that would push its item over an
   already-fully-used budget as Catch-up Hours (`is_catch_up:true`)
   instead of silently zeroing it out and deleting it. For a single-entry
   copy, the ESE modal auto-opens on the new Catch-up entry so the number
   can be checked right away. A multi-entry GROUP copy (several selected
   entries pasted at once) that mixes in one or more Catch-up results
   currently does NOT auto-open anything for them - they're correctly
   tagged and excluded from budget math, just left to be found and
   reviewed later like any other entry. Low priority: the reported
   scenario was always a single-entry copy.

3. **Dragging (moving) a Catch-up entry recalculates its hours to the
   destination staff's max instead of leaving it untouched.** Reproduced
   live: dragged Jenny's Wed-14 Catch-up entry to a new day/staff (Mary) -
   it landed recalculated to Mary's max hours instead of keeping its
   original fixed number. Root cause: `handleDrop`'s single-entry move
   branch (`src/App.jsx` ~line 2439, the `newHours` snap-to-cap logic for
   `wasCappedByOldSibling||wasOldStaffFullDay`) doesn't check `isCatchUp`
   at all - a Catch-up entry's hours are a deliberate fixed number, never
   derived from any staff's cap, same as a locked entry. Likely fix:
   skip the whole `newHours` recalculation and keep `entry.hours` as-is
   whenever `entry.isCatchUp` is true.

4. **Living W, TJ, Slot 1, Wed 14th shows 46h on the grid - should show
   its real 3.5h (matches the ESE modal).** Not yet known when this
   started. Live-tested: dragging the entry to a new day made it display
   the correct 3.5h; dragging it back to its original position brought
   the wrong 46h back. User's correction on the move-behavior test this
   was found during (2C item #3 test): this entry is a SIBLING entry
   (shares a day/budget split with another staff member on the same
   item) - it should NOT recalculate to the destination staff's max on a
   plain move, regardless of whether the destination looks "empty".
   Needs investigation: likely the flat "total budget" placeholder
   display (`computeJobEntryMeta`/`totalBudget`) picking up a wrong
   number for this item/entry, and separately the move's `newHours`
   logic possibly misjudging this as a non-shared move in some case
   `sharedItemAtDest` doesn't catch.

5. **Manual (non-autofill) multi-staff entry can overcommit a staff member
   past their own daily cap.** Reproduced live: selected 3 staff with
   different productive-hours caps (7.5h, 6h, 4.5h) for one manual entry,
   used "First Available" - it landed all three on the same day at the
   SAME 7.5h figure, exceeding the 6h and 4.5h staff's own caps. The
   manual multi-staff path applies one shared hours value to everyone
   instead of capping each person to their own `productiveHours`. User's
   own assessment: unlikely combo in real use (multi-staff + manual entry
   + mismatched caps), so low priority. Needs investigation into where
   the manual (non-autofill) multi-staff save path builds each staff's
   row - likely needs the same per-person capping `buildGroupAutoFill`
   already does for the autofill case.

6. **FIXED.** `effectiveEntryHours` only ever shrank a non-"completing"
   entry's hours, never re-derived them upward - so a staff efficiency
   edit could permanently corrupt stored hours, including on OTHER
   staff's entries in a shared item, with no way back once the
   constraint that shrank them was lifted again.
   - Live repro that confirmed it: David's productive hours dropped
     7h→6h - his entry got PATCHED (persisted, not just displayed) down
     to 6h by the ambient pass. Raising it back to 7h did NOT restore
     it - still stuck at 6h. Also rippled into Mark's unrelated entries
     on a shared item ("Overcommitted"/"X under" with Mark himself
     never touched).
   - Product decision (superseding the original "recalculate shared
     items on a staff edit" intent, after discussing the real cost of
     making that fully correct for every case): a staff hours edit, up
     or down, now touches NOTHING already on the grid, ever - only
     scheduling created from that point forward uses the new number.
     The existing ambient correction pass (`useEffect` at `App.jsx`,
     deps now `[entries,subItems,canEdit]` - `staff` deliberately
     removed) no longer runs just because a staff record changed.
   - That pass still runs - using whatever staff data is CURRENT at the
     time - for actual schedule changes (drag, copy, delete, new entry),
     same as always. Fixed there too: `oneCorrectionPass`'s non-special
     capping step can now re-derive an entry's hours UPWARD as well as
     down, but ONLY when it's the sole unlocked, non-special entry in
     its item (see `regrowableIds` in `App.jsx`) - growing it when a
     second such entry exists in the same item (e.g. two staff
     splitting one day's worth of an item's budget) risked double-
     counting hours against that other entry's own share, so that case
     deliberately keeps the old shrink-only behaviour.
   - An entry's stored hours can now legitimately exceed a staff
     member's CURRENT cap for a while (until the next grid action
     corrects it) - deliberate, confirmed with the user: no popup, no
     display change for this case. The on-screen label already
     recalculates live from current staff data regardless (unchanged),
     it's only the STORED value that stays put until something else on
     the grid touches it.
   - Shipped in PR #57, with dedicated tests `test-staff-hours-no-
     retroactive.mjs` (hours edit alone = zero effect) and
     `test-staff-hours-rule2-grid-trigger.mjs` (a later grid action
     correctly shrinks AND grows back). Also fixed a latent bug in the
     shared test helper `date-helpers.mjs` found along the way:
     `businessDay(0)` and `businessDay(1)` could collide on the same
     date whenever "today" is a weekend.

7. **FIXED.** Auto-fill silently walked past the requested start day if
   it was occupied, instead of flagging a conflict. `buildAutoFill`
   (`App.jsx` ~line 316) treats "day/slot is taken → try the next day"
   as one blanket rule with no distinction between the STARTING day
   (what the user actually picked/clicked) and later days within a
   multi-day spread. Live repro: manually picked Mark, Slot 1, 01 Oct
   (already occupied), Auto-fill left ON (the default), hit Save - no
   conflict prompt at all, the entry silently landed on 13 Oct instead,
   with nothing telling the user it had skipped two weeks forward.
   - Mid-spread skipping (day 3 of a 5-day spread being occupied, skip
     to day 4) is correct and stays exactly as-is - only "First
     Available" should ever cause the search itself; that's not this.
   - When the START day/slot (the one actually selected in the form) is
     occupied, a new pre-check (`personalBlockFits`/`nextAvailableDate`,
     both pre-existing helpers) now raises a "⚠ No Room That Day"
     `ConfirmModal` before any save happens, instead of silently
     continuing the search.
   - Shipped with only TWO options: "Schedule First Available (dd/mmm)"
     (computes and uses the real next open day/slot) and "Go Back". The
     originally-discussed THIRD option, "Schedule Anyway" (deliberately
     creating a Conflict-pair entry at the occupied slot), was dropped
     for now - confirmed with the user - because item 1 above (HIGH
     PRIORITY, duplicate-cell undo data loss) makes deliberately
     creating a new Conflict pair unsafe until that's fixed. Re-add
     "Schedule Anyway" once item 1 ships.

8. **Mobile layout shows wrong hours/labels for Catch-up entries -
   desktop is correct, phone is not.** Not yet investigated (logged
   raw, per explicit instruction to stop mobile testing here and keep
   desktop the focus for now). `JobBlock`'s `hoursLabel` calculation is
   shared code (not inside the `isMobile` branch), so on paper mobile
   and desktop should show identical values - the fact that they don't
   means there's a real discrepancy somewhere not yet found. Four live
   examples, all Wed-14th-ish entries in the "Living W"/"Laundry"
   items, desktop (correct) vs phone (wrong):
   - Ian, Laundry, Slot 2, 13 Oct: desktop "Catch-up 2h" → phone
     "Overrun", no hours shown at all.
   - Mary, Living, Slot 1, 14th: desktop "4h" → phone "0.5h".
   - Mary, Living, Slot 2, 14th: desktop "Catch-up 2h" → phone "46h"
     (the item's flat total-budget placeholder number).
   - TJ, Living, Slot 2, 14th: desktop "Catch-up 1.5h" → phone "46h"
     (same item-total placeholder).
   Needs investigation into why/how the mobile render path is landing
   on a different `computeJobEntryMeta`/`isCatchUp` result than desktop
   for the exact same entries - possibly a stale/cached mobile-specific
   render, a viewport-driven recompute ordering issue, or a genuinely
   separate code path not yet found. Explicitly deferred until desktop
   is fully tested and stable - do not start mobile work before then.

9. **FIXED (locked-blocker PR). (Was: group move stripped a displaced
   entry's lock and overwrote its manually typed hours.)** Found while rebuilding the regression suite.
   PR #42 says a group move's displaced entry (the one moved to the
   day's other slot to make room) keeps its lock and hours exactly as
   they were - and the displacement PATCH itself does (`{slot}` only).
   But `performGroupMove` (`App.jsx` ~line 2260) then adds the displaced
   entry's own item to `byItemArrivals`, so `unlockAllLocksInItem` clears
   its lock and `recalculateItem` re-derives its hours, replacing a
   deliberately typed number.
   - Live repro (`tests/known-bug-group-move-displace-keeps-lock.mjs`):
     Ian has Laundry locked at a manual 5h in slot 1. Group-move two
     Kitchen days onto Ian's slot 1 row. Laundry correctly moves to slot
     2, but is unlocked and changed 5h -> 8h.
   - Knock-on, timing-dependent (seen on one run, not the next): the two
     items recalculate in parallel against the same starting state, so
     Kitchen sized its day around Laundry's 5h while Laundry grew to 8h -
     stored hours for Ian that day added up to 11h on an 8h day (the
     on-screen numbers are recalculated live, so the screen looked right;
     the stored value was stale).
   - Fix direction: re-settle the displaced entry's item WITHOUT clearing
     its locks (add it to `byItem` for the recalculation, not to
     `byItemArrivals`), so a locked displaced entry keeps its number and
     the rest of its item settles around it. Expected to also remove the
     knock-on, since that only happens when the lock is lost.
   - USER'S RULE (replaces the fix direction above): first booked takes
     priority, then second, then third; a moved entry always counts as
     the newest, so it comes last. A LOCKED entry in the way is never
     moved, unlocked or changed. Agreed example: Mark 6.5h/day, Wed:
     Kerrigan 4h locked in slot 1; a 6.5h Harries day lands on Mark's
     slot 1 -> Kerrigan stays in slot 1 at 4h, Harries goes into slot 2
     with the 2.5h left, its other 4h is added further out. With 0h left,
     the Scheduling Conflict pop-up asks first (2E #12).
   - What shipped: `performGroupMove` - when the entry in the way is
     locked, the incoming entry takes the person's other slot instead of
     displacing it (an unlocked entry in the way is still moved aside, as
     before). The rest is the existing recalculation/auto-extend and the
     2E #12 pop-up.
   - Test: `test-group-move-locked-blocker.mjs` (replaces the old
     known-bug file) - fails on main (Kerrigan displaced and unlocked),
     passes after.

10. **FIXED (PR #60). (Was: HIGH PRIORITY, live on main.) Batch 6's "regrow" rule
    rewrites correct stored hours just by opening the app.** Found while
    rebuilding the regression suite. Introduced by PR #57 (Batch 6).
    `oneCorrectionPass` (`App.jsx` ~line 2634, `regrowableIds`) grows the
    sole unlocked, non-final entry in an item straight up to the person's
    full available day (`maxPossibleHours`) with NO check against the
    item's budget. The ambient pass runs on every entries change,
    including the initial page load, and PATCHes the result.
    - Live repro 1 (shared day): item 11.5h, Mary 8h + TJ 3.5h on the
      same day, TJ's entry created first. Opening the app PATCHes TJ to
      8h and then Mary to 3.5h - their hours are swapped and saved, with
      no user action at all. (If Mary's entry was created first, nothing
      happens - it depends on creation order.)
    - Live repro 2 (zeroed entry): item 8h, Mark 8h + Ian 0h same day.
      Opening the app PATCHes Ian to 8h - the item now has 16h stored
      against an 8h budget and Ian's entry shows "over-run" instead of
      "0h".
    - Confirmed against the pre-Batch-6 baseline (`c03b969~1`): neither
      repro changes anything there.
    - Since Batch 6 is merged to main, real schedule data may already
      have been changed this way whenever the app was opened since.
    - Fix direction (needs a decision): either (a) remove the regrow rule
      (back to the old shrink-only behaviour - loses Batch 6 rule 2's
      "grows back" half), or (b) cap the regrow so the item can never go
      over its budget (grow only by what the item still actually needs).
    - User's decision: fix B (keep the grow-back, but make it safe), plus
      the app must never recalculate just from being opened.
    - SHIPPED in PR #60 (squash-merged to main as 902134f, verified on main):
      1. The background check skips the schedule exactly as loaded from
         the database (`loadedStateRef` in `App.jsx`), so opening the app
         or pressing Refresh never saves anything. Every load is
         remembered, not just the latest, because two loads can overlap
         (seen in testing; a double-clicked Refresh would do the same).
      2. The grow-back now only applies to an entry on an EARLIER day
         than the item's finishing entry (people sharing the finishing day
         are a split, so growing one just swapped their numbers), and can
         never grow past the item's budget. The grown value is worked out
         before the finishing entry's own hours, so the finishing entry
         takes exactly what's left (down to 0h) in the same step - a first
         version that skipped this left a 5h item at 6h (caught by test).
      - Tests: `test-no-change-on-open.mjs` (open, reopen, Refresh save
        nothing; Mary/TJ not swapped and 0h stays 0h even after a grid
        action; a genuinely too-big entry still shrinks) and
        `test-regrow-budget-cap.mjs` (item can't go over budget). Both FAIL
        on current `main`, PASS on the fix. `test-batch6-staff-hours.mjs`
        (grow-back still works) and `test-core-labels.mjs` (0h label) pass.

11. **FIXED (copy Catch-up PR). (Was: copy onto an item with SOME budget
    left became all Catch-up.)** The copy rule added in PR #48 (`performGroupCopy` and
    `handleDrop`'s ctrl-copy, `App.jsx` ~lines 2355, 2470) marks a copy
    Catch-up whenever `used + copy hours > budget` - so an item with 4h
    of 16h left, given an 8h copy, gets the WHOLE 8h as Catch-up and the
    remaining 4h of budget never gets filled. The PR #48 description, the
    code's own comment and 2E #2 all say this should only apply to an
    item whose budget is ALREADY FULLY used. Before PR #48, such a copy
    re-balanced the item to its budget instead.
    - Needs the user's call: (a) only use Catch-up when the budget is
      already fully used (copy otherwise re-balances, as before), or
      (b) split it - fill what's left, rest as Catch-up, or (c) keep as is.
    - USER'S DECISION: (a). Catch-up is judged per item only (that item's
      own budget) - a different item with budget left schedules normally.
    - What shipped: both copy paths (`performGroupCopy`, `handleDrop`'s
      ctrl-copy) now mark a copy Catch-up only when its item's budget is
      ALREADY fully used before that copy. Otherwise it's a normal entry
      and the item's own recalculation settles it to the budget. A group
      copy tracks usage per item as it goes, so the copy that fills the
      last of the budget is normal and any after it are Catch-up.
    - Test: `test-copy-partial-budget.mjs` (was the known-bug file) -
      fails on main before this change, passes after.

12. **FIXED (no-room conflict PR). (Was: adding work to someone with no
    hours left that day never warned - except auto-fill.)** Found by a read-only check (pretend data): David
    (7h/day) has a full 7h in slot 1 on a day; work is put into his empty
    slot 2 six different ways:
    1. New entry, auto-fill off: Hours box locks at 0, saving creates an
       empty 0h entry. No warning.
    2. New entry, auto-fill on: "No Room That Day" pop-up, nothing saved.
       (The only one that warns.)
    3. Drag one entry: lands at 7.5h (over his max), is then recalculated
       to 0h and DELETED, and auto-extend quietly creates a replacement
       entry back on the original person's row. Looks like nothing
       happened. No warning.
    4. Ctrl-drag copy: saves an empty 0h Catch-up entry. No warning.
    5. Group move: the full day's placement is quietly dropped and the
       work moved to later days instead. No warning.
    6. Group copy: saves an empty 0h Catch-up entry. No warning.
    - USER'S DECISION (the rule): a person can never be booked over their
      daily max without being asked. Every one of these paths must show
      the existing "⚠ Scheduling Conflict" pop-up (Schedule Anyway / Go
      Back). Go Back = nothing saved. Schedule Anyway = the work is saved
      at its hours, the person is over their max that day, both entries
      show the red "⚠ Conflict" until someone fixes it by hand, and the app
      never shrinks or deletes either of them on its own.
    - Same rule applies to item 9 (group move onto a LOCKED entry): show a
      conflict, never displace it. The 0h auto-delete (separate branch
      `claude/auto-delete-zero-hours`) then only ever applies to an entry
      emptied by its own item's budget being used up elsewhere - never to
      one squeezed out by a different job, since that's now a conflict.
    - Agreed case by case with the user (Mon 5 Oct example: David 7h/day,
      slot 1 full 7h; work put into his empty slot 2):
      1. New manual entry: the Hours box accepts the typed number; Save
         shows the pop-up. Go Back = back to the form, nothing saved.
         Schedule Anyway = saved at the typed hours (David 11h).
      2. Drag one entry: pop-up on drop. Go Back = entry stays where it
         was. Schedule Anyway = it moves, keeping its full hours.
      3. Ctrl-drag copy: pop-up on drop. Go Back = no copy. Schedule
         Anyway = copy made at full hours (Catch-up only if its item's
         budget is already full - 2E #11).
      4. Group move: ONE pop-up for the whole group listing every full
         day. Go Back = nothing moves. Schedule Anyway = whole group moves;
         full-day ones keep their hours. All or nothing, never split.
      5. Group copy: same as 4, for copies.
      In every Schedule Anyway case: both of that person's entries that day
      show the red "⚠ Conflict", and the app never shrinks or deletes
      either one.
    - Some room but not enough (e.g. 2h left, 7.5h entry dragged in): stays
      as today - cut to the 2h that fits, the other 5.5h added as a new day
      at the end of the item's schedule ("Extended by 1 day" message). The
      pop-up is only for 0h left. (User: "Try that".)
    - What shipped: `noRoomDays`/`askNoRoom` in `App.jsx`, called from all
      5 paths before anything is saved (saveEntry's new branch,
      handleDrop's move and copy, performGroupMove, performGroupCopy).
      Schedule Anyway saves those placements `hours_locked:true` at their
      full hours; `unlockAllLocksInItem` skips them (new `keepIds`) and a
      new entry's sibling slot isn't unlocked, so nothing shrinks or
      deletes either entry. `overMaxDays` shows the red "⚠ Conflict" on
      both of the person's entries that day (both slots filled, a locked
      entry among them, stored hours over their daily max). The entry
      form's Hours box accepts a number for a NEW entry on a no-room day
      (`hoursInputMax`); with some room it's still capped to what fits.
    - Test: `test-no-room-conflict.mjs` (all 5 ways x Go Back / Schedule
      Anyway, red conflict, still intact after a later grid action, and
      the some-room case unchanged) - fails on main before this change
      (no pop-up anywhere), passes after. `test-group-move-displace.mjs`
      updated: its blocker now leaves room that day (a full-day blocker is
      now this pop-up).

13. **FIXED (PR #61). An entry left with 0h now deletes
    itself** - the user's rule, restoring the behaviour that existed for
    one day on 22 Sep (added in 0a46bf8, reverted in 38ae3f8 with no
    reason recorded, replaced by a plain "0h" label).
    - What shipped: after any real change on the grid, the background
      hours check deletes every UNLOCKED entry whose hours come out at 0
      (just reduced to 0, or already sitting at 0). Never on opening the
      app (see 10), never a locked entry, never a past-dated entry
      (history). A colleague's edit using up an item's whole budget
      already deleted the emptied entry before this (manual-edit path);
      this covers every other 0h entry.
    - Undo brings back everything that had hours. An entry that was
      already 0h before the change is restored and then deletes itself
      again, by the same rule.
    - An entry squeezed to 0h by a DIFFERENT job in the person's other
      slot is meant to become a Scheduling Conflict instead (user's rule,
      not built yet) - so this rule is really for entries emptied by
      their own item's budget.
    - Test: `test-zero-hours-self-delete.mjs` (fails on main before this
      change, passes after). Full suite 34/34.

14. **RESOLVED, NO CHANGE. Moving an item's entry earlier must re-flow it
    with no gaps.**
    User's example (live schedule): David Mon 12 Oct has Kerrigan Pantry
    2h in slot 1, so 5h free in slot 2. Moving 101214 Driscoll Laundry S
    from Tue 13 onto Mon 12 slot 2 should: give it the 5h David has free
    (and show 5h), then populate every day forward from there - David's
    Tue 13 filled again (no gap) - and recalculate every other staff
    member on Driscoll Laundry S too. The user expects this would usually
    be done as a GROUP move (all Driscoll Laundry S entries), which
    shifts every day back together; a single-entry drag today leaves Tue
    13 empty and adds the leftover at the end of the schedule instead.
    - Checked with the exact situation (pretend data): a GROUP move of all
      6 Driscoll Laundry S entries one day earlier gives David Mon 12 5h,
      Tue 13 7h, Wed 14 4.5h and Ian Mon 12 7.5h, Tue 13 7.5h, Wed 14 4.5h
      - exactly 36h, no gaps. Already works as the user wants. (Dropping
      the group on slot 2 moves every entry in it to slot 2.)
    - A single drag of David's Tue 13 gives Mon 12 5h, leaves Tue 13 empty
      and grows Thu 15 for David and Ian (4.5h each) - still 36h.
    - USER'S DECISION: no change - a single drag stays as it is.

15. **FIXED (edit-over-max PR). (Was: a manual hours edit shrank the
    person's OTHER entry that day instead of flagging them as over their
    day.)** Found in the user's
    live testing (Ian, Mon 19): Ian 7.5h/day had Driscoll Laundry W 7h in
    slot 2. Copying David's same-item entry onto Ian's slot 1 correctly
    landed as Catch-up (0.5h, what fit) and opened its form; changing it
    to 4h and saving cut Ian's Laundry from 7h to 3.5h ("3.5h under")
    instead of keeping 7h and showing Ian as over his day. Recreated
    exactly on pretend data.
    - Cause: the rule from PRs #35/#39 - saving a manual edit unlocks the
      other slot's entry and re-dates it so it yields (`unlockSiblingSlot`
      in `saveEntry`), shrinking it to fit around the typed number.
    - USER'S DECISION: (b) - for EVERY manual hours edit, the other entry
      is never shrunk; if the day goes over the person's max it's flagged
      instead. This replaces the #35/#39 rule.
    - Agreed with the user: saving asks first, with the user's wording -
      "Ian has 7.5hrs max per day, these additional hours will create a
      conflict, Schedule anyway?" - plus a note that reducing the other
      entry would leave its item short (consider adding hours to the next
      day). Schedule Anyway keeps both (red Conflict); Go Back returns to
      the form. No "shrink the other entry" option.
    - What shipped: `saveEntry`'s edit branch checks the person's day
      before saving; over the max -> that pop-up. Schedule Anyway locks
      the other entry too and skips `unlockSiblingSlot`. An edit that fits
      saves straight away as before.
    - Also fixed (found while testing this): a later move of ANY entry in
      the same item cleared every lock in it (`unlockAllLocksInItem`,
      PR #20), which unprotected a Schedule Anyway pair - the Catch-up was
      then squeezed to 0h and deleted. New `keepLockAlways`: a Catch-up
      entry, or an entry on a day its person is deliberately over their
      max, is never unlocked by any automatic lock clean-up. Covers 2E #12's
      Schedule Anyway entries too.
    - Tests: `test-edit-over-max-conflict.mjs` (the Ian example: pop-up
      wording, Schedule Anyway keeps 7h + 4h - still after a later move in
      the same item - Go Back, and an edit that fits) fails on main,
      passes after. Four older tests that checked the replaced #35/#39
      rule were updated to the new rule.

16. **FIXED (Catch-up note budget PR). (Was: entry form's Catch-up note
    showed the wrong budget when editing.)**
    Found in the user's live testing (Ian, Tue 20, editing a Catch-up
    copy): the form said "+ 1h Catch-up Hours logged for this item (not
    counted in its 12h budget)" while the Joinery Item dropdown said
    "Laundry W (41h budget)". Display only.
    - Cause: `EntryModal`'s `totalHours` is `form.totalHours ||
      selectedSub.totalHours` - when editing an existing entry,
      `form.totalHours` carries some other number, so the note uses it
      instead of the item's real budget.
    - Actual cause, once traced: when editing, `form.totalHours` is the
      FIRST item on the job's budget (Driscoll's Laundry S, 12h), not the
      selected one. The same number fed the "All hours allocated / Add
      Catch-up Hours" check and its wording - and from Job Summary's
      "+ Schedule" it's the hours LEFT, so a manual entry that still fit
      the item wrongly got the Catch-up prompt (test: 30h of 41h used,
      4h entry -> prompt said "All 11h ... already scheduled").
    - What shipped: new `itemBudget` (the selected item's own budget) used
      for the note, the Catch-up check and its pop-up wording.
    - Test: `test-catchup-note-budget.mjs` (note says 41h; Job Summary
      "+ Schedule" 4h saves as a normal entry) - fails on main, passes
      after.
    - Also seen in the same test: one "Failed to save entry." that worked
      on retry. Could not be reproduced with the same steps - most likely
      a brief connection drop to the database. Watch for it recurring.

### 2G. Regression test suite (tests/)
Rebuilt from scratch this session (the old scratchpad suite was lost with
an earlier container) and kept in the repo so it can't be lost again. Run
with `tests/run-all.sh` against the app on port 5183; `tests/baseline.sh
<commit>` runs an older version on another port. Every test was checked
to FAIL on the code from just before the fix it covers and PASS after.
Coverage: every fix from PR #28 onward (one or more tests each), plus the
core behaviours from before the QA pass - moves (full-day restore, shared
days), labels (0h, locked, Misc), manual edits (stick, rebalance a
colleague), copies, auto-fill (capacity-aware, slot-consistent),
multi-staff auto-fill and its stagger confirmation, past entries locked,
First Available keeping the chosen slot, stale locks cleared on a move,
and the server's safety checks (`test-api-safety.mjs`: API key, signed
sessions, role rules, no unfiltered update/delete, no SQL injection,
hashed passwords never sent back, no leaked database errors).

### 2F. UI/UX changes logged for a later batch (not yet built)

1. **Default view on opening should be 4 Weeks, not 2 Weeks.**
   `App.jsx` line ~1180: `const [viewWeeks,setViewWeeks]=useState(2);` → change
   the initial value to `4`. One-line change, low risk.

2. **Add Job modal's default colour should skip one instead of cycling
   sequentially, to make consecutive jobs more visually distinct.**
   Currently 10 colours (`JOB_COLOUR_PRESETS`, `App.jsx` ~line 592-601:
   red, orange, lime, green, yellow, cyan, blue, violet, fuchsia, pink),
   picked in strict order by `nextPreset()` (~line 2665):
   `JOB_COLOUR_PRESETS[jobs.length%JOB_COLOUR_PRESETS.length]`.
   RESOLVED DESIGN (supersedes the earlier "add an 11th colour" idea):
   no new colour needed. Walk all 5 even-indexed colours first (0,2,4,6,8
   - red,lime,yellow,blue,fuchsia), then all 5 odd-indexed (1,3,5,7,9 -
   orange,green,cyan,violet,pink), then repeat. Every consecutive job
   still gets a maximally-separated colour, and all 10 get used before
   any repeat. Fix direction: build a fixed order array
   `[0,2,4,6,8,1,3,5,7,9]` and index into it with
   `JOB_COLOUR_PRESETS[ORDER[jobs.length%10]]`.

3. **New rule: a job cannot be marked Completed while it has entries
   scheduled forward of today.** Not a bug found in testing - a new
   business rule from the user. Reasoning: a job is never actually
   finished if there's still future work scheduled against it, so
   completing it in that state doesn't reflect reality. Fix direction:
   `toggleJobCompleted(id,completed)` (`App.jsx` ~line 1978) - when
   `completed` is being set to `true`, check `entries` for any row on
   this job (`jobId===id` or, for items, `subItemId` under this job)
   with `dateStr>=todayStr`; if any exist, block the action and show an
   error naming how many/which, instead of calling the PATCH.

4. **Users button's little head icon should match the button's text
   colour.** `App.jsx` ~line 2744: `👥 Users` - the button already sets
   `color:theme.heading` on itself, but an emoji glyph renders in its
   own native colour regardless of CSS `color`, so the icon and text
   don't match. Fix direction: swap the emoji for an inline SVG people-
   icon using `fill="currentColor"` (or `stroke="currentColor"`), which
   inherits the button's `color` exactly like the text does.

5. **Admin needs the ability to set/change password for an existing
   user.** Currently `UserManagementModal` (`App.jsx` ~line 924+) only
   sets a password at creation time (`form.password`, "Add New User"
   section) - the existing-users table above it (~line 1020) has only a
   role dropdown and Remove, no way to view or reset a password once
   set. Fix direction: add a password field + save action to each
   existing user's row (or a small edit affordance opening one), wired
   to a `PATCH` on `user_roles` for that user's `id`.

6. **Prompt to close a job once its most recent scheduled date is a
   month old, instead of just silently archiving it.** Currently a job
   whose latest entry is >1 month old just moves to the passive
   "Archived Jobs" section of Job Summary (`App.jsx` ~line 1440-1457,
   `oneMonthAgo`/`archivedJobs`) - nothing actively tells the user. Do
   NOT auto-archive/auto-complete - keep the existing passive archived
   bucket exactly as-is, this is an ADDITIONAL prompt on top of it.
   Same visual style as the existing `ConfirmModal` component (`App.jsx`
   ~line 683, e.g. the Catch-up Hours pop-up). Exact wording:
   "Job {jobNo}, {jobName} most recent scheduled date is {date, e.g.
   dd/mmm}. Do you want to close this Job?" - Confirm marks it
   Completed (same as `toggleJobCompleted`), Cancel dismisses and
   leaves it as-is (presumably not re-prompted again this session, to
   avoid nagging - needs a decision on whether to re-prompt on every
   load or just once per job).

7. **FIXED (two-entry day PR). Show real hours when a person has two
   entries on one day.** User's
   request (from a live review of 309 Harries, which looked over-booked
   but wasn't): when a staff member has entries in BOTH slots on a day,
   each entry shows its own assigned hours, not the item's total-budget
   placeholder. Example: Tue 6 Oct, 309 Harries Mudroom W showed "14h"
   for both David and Mark - it should show David 5h and Mark 3h (their
   real saved hours; David's other slot has Laundry 2h, Mark's 3.5h).
   A day with only one entry keeps the current display. Changes 2D #1's
   "placeholder is intentional" rule for this case.
   - What shipped: `computeJobEntryMeta` treats an entry as showing its
     real hours (`isGenuinePartial`) whenever the same person has an entry
     in their other slot that day, as well as the existing partial-day
     case. Display only - no saved hours change.
   - Test: `test-two-entry-day-real-hours.mjs` (the Harries numbers) -
     fails on main (shows 14h), passes after.

### 2D. Resolved questions
1. ✅ **RESOLVED, NO CHANGE. Item-total-badge display (2A #10).** Discussed
   with the user: the flat "total budget" placeholder on an ordinary,
   non-final, full day is **intentional** — it lets anyone glance at any
   entry for an item and immediately see how many hours the item needs in
   total, which was judged more valuable than showing that one day's real
   number. `computeJobEntryMeta` already shows an entry's own real hours
   whenever it's the item's completing entry, under-cap, a person's own
   personal last entry, locked, or Overcommitted-with-shortfall (fix #3) -
   the placeholder only applies outside those cases. No longer an open
   item; nothing to fix here.
