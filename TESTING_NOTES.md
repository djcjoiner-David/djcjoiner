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

1. **HIGH PRIORITY - CONFIRMED REAL DATA LOSS. Undo/redo can't correctly
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

6. **HIGH PRIORITY - `effectiveEntryHours` only ever shrinks a non-
   "completing" entry's hours, never re-derives them upward - so a
   staff efficiency edit can permanently corrupt stored hours, including
   on OTHER staff's entries in a shared item.** Root cause confirmed via
   code trace, live-reproduced:
   - Editing a staff member's productive hours (Staff modal) DOES trigger
     the app's ambient background correction (`useEffect` at `App.jsx`
     ~line 2609, deps `[entries,staff,subItems,canEdit]` - runs on every
     `staff` change, not just schedule edits). This is correct/intended
     per the user (staff hours changes SHOULD recalculate shared items).
   - The bug: `effectiveEntryHours` (`App.jsx` ~line 264) computes
     `const myHours=Number(e.hours)||0;` then only ever clamps it DOWN
     (`Math.min(myHours,...)`) toward whatever the current cap allows -
     it never derives a fresh value from real current constraints for a
     non-"completing" entry. Only the ONE "completing" entry per item
     (`oneCorrectionPass`'s `specialHours` logic) gets properly re-
     derived from actual remaining budget; every other entry in that
     item is capped-down-only, permanently, even after the constraint
     that shrank it is later removed.
   - Live repro: David's productive hours dropped 7h→6h - his entry got
     PATCHED (persisted, not just displayed) down to 6h by the ambient
     pass. Raising it back to 7h did NOT restore it - still stuck at 6h,
     confirmed via reopening its own ESE modal.
   - Cross-contamination: David shares "Laundry"/"Mudroom" with Mark on
     Tue 6th, and "Mudroom"/"Pantry" with Mark on Wed 7th (same joinery
     items, different staff). Because `oneCorrectionPass` groups purely
     `bySubItem` (item), not by staff, David's edit rippled the shared
     items' recalculation into Mark's entries too - Mark's own Wed-7th
     Pantry and Mudroom entries changed to "Overcommitted" and "0.5h
     under" respectively, without Mark himself being touched at all.
     Since this ripple is built on top of David's already-wrong stuck
     6h value, some/all of Mark's new numbers may themselves be wrong
     as a downstream consequence, not a separate bug in their own right
     - needs re-checking once the root cause is fixed.
   - User's confirmed intent: staff efficiency edits SHOULD recalculate
     shared items (not be scoped to only that one staff member) - the
     fix needs to make that recalculation actually correct in both
     directions (up AND down), not disable it.
   - NOT fixed now - deliberately deferred: `effectiveEntryHours` is
     used throughout the app (undo/redo, sibling locking/capping,
     Catch-up Hours exclusions all depend on it), so a fix here has real
     regression risk across everything tested this session. Needs a
     dedicated pass with a full regression run, not a mid-session patch.
   - Fix direction (needs more thought before starting): the
     "completing entry" role's remaining-budget-based re-derivation
     already does the right thing (line 2554-2556) - the non-special
     capping step (line 2575) likely needs the same treatment: derive
     from current real constraints (what's actually left of the item's
     budget / the day's capacity) rather than clamping the entry's own
     possibly-stale stored value.

7. **Auto-fill silently walks past the requested start day if it's
   occupied, instead of flagging a conflict.** `buildAutoFill` (`App.jsx`
   ~line 316) treats "day/slot is taken → try the next day" as one
   blanket rule with no distinction between the STARTING day (what the
   user actually picked/clicked) and later days within a multi-day
   spread. Live repro: manually picked Mark, Slot 1, 01 Oct (already
   occupied), Auto-fill left ON (the default), hit Save - no conflict
   prompt at all, the entry silently landed on 13 Oct instead, with
   nothing telling the user it had skipped two weeks forward.
   Discussed and agreed design:
   - Mid-spread skipping (day 3 of a 5-day spread being occupied, skip
     to day 4) is correct and stays exactly as-is - only "First
     Available" should ever cause the search itself; that's not this.
   - When the START day/slot (the one actually selected in the form) is
     occupied, raise the existing "⚠ Scheduling Conflict" `ConfirmModal`
     instead of silently continuing the search.
   - That prompt gets a THIRD option alongside the current two: keep
     "Schedule Anyway" (proceeds there regardless, current behaviour)
     and "Go Back"/Cancel, and add "Schedule First Available (dd/mmm)"
     - computes the actual next open day/slot up front (reusing
     `nextAvailableDate`/`nextAvailableBlockDate`) and shows the real
     date in the button label, then uses it if clicked.

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
