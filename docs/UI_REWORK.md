# UI/UX Rework Plan — SIV HUD ("Gilded Command")

**Status:** ALL PHASES BUILT, then trimmed by playtest (2026-09-06) — P2.3 world tracker
and P2.5 situation log were REMOVED after review ("excessive"): components, tests, styles
and the UI-only eventLogSignal deleted; rally clear moved into the UnitDock. The empty
unit dock ("Select a unit or city") was also removed — the dock now only renders while
one of your units is selected, docked bottom-right. P3.3/P3.4/P3.5 built solo by integrator:
**P3.3 city focus** (`setCityFocus`, doubled-weight steering, focus pills row) with
`tests/engine/focus.test.ts` (6, incl. a 25-seed proof that focus steers real tiles);
**P3.4 rally points** (`setRally`, auto-flag on production, turn-start march, manual-order
clear, unreachable self-heal; UnitDock button + tracker row + marching markers) with
`tests/engine/rally.test.ts` (4); **P3.5 multi-queue** (`queue/dequeue/reorderProduction`,
cap 5, replace-kept `setProduction`, Up-next list + per-card +Queue) with
`tests/engine/multiqueue.test.ts` (6). Absent-when-default throughout: golden hash STILL
unchanged. Playwright review fixed nothing structural (one test-helper coordinate bug caught test-side: `neighborsOf` is absolute axial). Verify: tsc clean, vitest 185 green,
e2e 20/20 (3 new specs), baselines in tolerance.
two parallel subagent batches (file-ownership split, integrator wiring): **P2.2 empire
overview** (cities/units table, jump-to rows) + **P2.3 world tracker** (research, victory
countdown, denounce cooldowns) from batch A; **P2.5 situation log** (attention + last-12
event log with turn chips) + **P2.6 choice cards** (generic component, applied to declare-war
confirm) from batch B. **P3.1 repeat production** (`setProductionRepeat`, units only,
absent-when-off) and **P3.2 research queue** (`queueResearch`/`dequeueResearch`,
auto-advance skipping known) built by integrator with `tests/engine/queues.test.ts` (7);
golden hash UNCHANGED by design (optional fields stay absent). Integrator fixes from
rubric screenshots: attention badge grammar ("1 needs orders"), tracker integer scores,
legend wrap, settle legibility (prior note). Verify: tsc clean, vitest 169 green, e2e 17/17
(3 new specs), baselines in tolerance. Remaining: P3.3 city focus, P3.4 rally points,
P3.5 multi-queue (explicitly deferred). Phase 1 deferrals carried into Phase 2: pin-to-tracker (P1.3)
needs the World Tracker (P2.3); tooltip Tier-3 help links (P1.6) SHIPPED with Help (P2.4).
Reduced-motion ships as a `prefers-reduced-motion` guard (no animated surfaces exist yet;
toggle deferred to the first). Rubric gates: attention/toast/tech/cards/ribbon/menu by
`tests/ui/attention.test.ts` (5), e2e, and screenshot review; lenses/help by their unit
suites (27), 4 e2e specs, and screenshot review (legend wrap + settle legibility fixes).
**Rule:** no code for P3.3/P3.4/P3.5 until re-scoped.
**Validation:** every shipped screen must score ≥4/5 on each applicable rubric item (§8);
anything below ships only as a noted exception.

## 1. Goals

1. **Zero stranded decisions.** From the map, every actionable item (idle unit, empty
   production, unpicked research, expiring offer) is reachable in ≤2 clicks, with a
   camera jump. (Civ 6 blocking End Turn; Stellaris alert hierarchy; Troy to-do list.)
2. **Hover answers everything.** Every tile/unit/tech/diplo hover shows what / why /
   how-much; numbers never hide more than one click deep. (Civ 7's #1 consensus failure.)
3. **Gains ship with losses.** Any irreversible preview (production, Buy, placement,
   peace) shows the paired delta. (Civ 7 overbuilding lesson; patches 1.2.x–1.4.x.)
4. **Desktop mouse conventions everywhere.** Wheel scrolls, right-click backs out /
   moves, Esc closes topmost, empty-tile click deselects (already), drag where lists
   reorder. (Civ 7 "console port" backlash.)
5. **Glanceable map.** L1 data (yields, HP, turns-left, status) survives the squint and
   grayscale tests; color is never the sole channel. (Unciv critique; Okabe-Ito §8.)

## 2. Non-goals / constraints

- **Art direction is frozen.** Gilded Hex Seals, parchment/gold chrome, Georgia serif.
  This plan changes layout, IA, and interaction only.
- **Engine purity holds.** Phases 1–2 are read-only over `GameState` (selectors only,
  zero `dispatch` changes, golden hash untouched). Phase 3 items that need engine work
  are flagged `[ENGINE]` with the exact command/state delta.
- **Scope discipline.** No governors, no full automation, no second tree component, no
  stacked modals (one modal at a time; modals dismiss-to-inspect-map). (EL2 "Divided UI"
  postmortem; Humankind stacked-modal critique.)
- **E2E stays green.** New/changed testids listed per item; screenshot baselines
  regenerate deliberately (`--update-snapshots`) after approval, never silently.
- **Civ 7 hot takes we deliberately ignore:** the regal aesthetic debate (taste, not
  usability), age/civ-switch screens (no SIV equivalent), borderless-minimap preference
  (answer: a toggle, Phase 2).

## 3. Current-state audit (what we have)

| Surface | Now | Gap vs research |
|---|---|---|
| TopBar | civ, turn, gold big+net, science button, culture, Diplomacy btn | No alerts, no attention state, science clickable but culture/gold dead (fine — but inconsistent affordance) |
| End Turn | bare button, always arms | No blocker list, no count badge, no jump-to (Civ 6 pattern missing) |
| Notifications | bottom-center toasts, auto-dismiss 7s, sliced to 6 | No destination (no Take-Me-There), no persistence, no urgency color beyond 3 kinds, bursts unbatched |
| City panel | left dock, yields, growth, 3 prod rows, Buy, queued highlight (new) | Single slot; cards lack turns-left/upkeep; no repeat; no empire overview |
| Tech tree | 4 lanes, tooltips, lane seals (new) | No search, no turns-at-rate on node, no pin/beeline, no queue |
| Diplomacy | modal, war/peace/denounce + cooldown | No persistent ribbon; no relations-with-others preview; empty-state only pre-contact |
| Minimap | explored-bbox crop, viewport rect, click-center | No size/border toggle, no lenses, no territory shading toggle |
| Unit dock | seal, HP/MP, reach copy (new), Fortify/Sleep/Skip/Wake | All actions already expanded (good — Civ 7 rule #8 satisfied); no Next-unit button in-dock (hotkey N only) |
| Tile tooltip | terrain/elev/features/resource/river/yields/MP/owner | Good Tier 1–2; no nested Tier 3 link, no MP-cost-to-enter from selected unit |
| Menu | civ preview + trait (new), seed, size, rivals | No map-option explanations (Civ 7 setup complaint), no difficulty tooltips |
| Victory | standings + seals (new) | Fine; no defeat-by-elimination preview mid-game |
| Help | none in-game | No civilopedia/search at all (Civ 7 rule #10 violated — biggest structural gap) |

## 4. Phase 1 — attention + answers (no engine changes)

**P1.1 End-Turn attention badge.** Button shows count of actionable items
(unmoved un-fortified human units → cities with empty queue → no research → pending
diplo offers); click badge (or `N`) cycles jump-to list; `Shift+click` force-ends
(expert bypass). Read-only selectors over state. New testids:
`end-turn-badge`, `attention-list`. (Civ 6 blocker; Troy non-modal list.)
**P1.2 Toasts grow destinations.** Every toast gets optional `onClick` → select +
center camera (Take-Me-There); toasts batch bursts ("X and N more"); confirmations
stay toasts, everything actionable also lands in the Phase-2 log.
(`store.ts` notification shape gains `{tileId?, cityId?, unitId?}` — UI-only type.)
**P1.3 Tech-tree search + node math.** Autofocus search filters nodes; every node shows
`N turns at current science`. Pin-to-tracker pushes node id to World Tracker
(P2.3). Read-only (`computeCityYields` science sum exists).
**P1.4 Production cards: full math on card.** Cost/turn, turns-left at current
production, upkeep, Buy price — all on the card, no hover needed; dim (not hide)
locked/unaffordable. Read-only. (CQUI rule.)
**P1.5 Diplomacy ribbon.** Persistent strip (above minimap): met civs as seal +
relation score + status icon (war/peace/denounce-cooldown); hover = breakdown incl.
their wars; click = open modal at that leader. Read-only over
`relations/warsWith/denounceTurns`. (Civ 6 ribbon; ES2 status map lite.)
**P1.6 Tooltip Tier 3 links + selected-unit MP.** Tooltip gains "entry →" link opening
Help (P2.4) at the right anchor; when a unit is selected, shows MP cost to enter the
hovered tile (`findUnitPath` cost — already exposed). Read-only.
**P1.7 Menu explanations.** One-line descriptions under Map/Size/Difficulty/AI-count
+ difficulty yield/strength deltas from SPEC. Copy only.

## 5. Phase 2 — power tools (no engine changes; new UI state only)

**P2.1 Lens row above minimap.** Yields / Settle / Borders lenses, one active, click
or right-click clears; settler auto-suggests Settle lens on select. Renderer overlay
work only (`setRangeOverlay`-style painting + legend chip). Persists in localStorage.
(Civ 6 lenses; Old World overlay customizer lite.)
**P2.2 Empire overview (command deck).** One table modal: every city (build,
turns-left, upkeep, growth-stall warning), every unit (orders state), research
progress; click row jumps without opening city screens. Read-only + existing
`setProduction`. Kills 80% of late-game clicking. (Civ 6 GS multi-queue; SoC Kingdom.)
**P2.3 World Tracker pins (right edge).** Active research + victory ETA + ≤5
player-pinned items (tech, wonder, cooldown) with turns-remaining, click-to-open.
UI signals only. (Civ 6 tracker; ES2 pushpin.)
**P2.4 In-game Help (civilopedia-lite).** Full-text searchable overlay: yields,
terrains, units, buildings, techs, concepts (ZOC, 1UPT, drift) — generated from
content defs + a concepts file; every tooltip Tier-3 links here; never phase-locked;
Esc/right-click backs out. (Civ 7 rule #10, inverted.)
**P2.5 Situation log.** Urgency-sorted collapsible backlog (attention → expiring →
findings) replacing toasts as system of record; pinning; click jumps. Fed by the
same selectors as P1.1 + engine events already narrated. (Stellaris 4.4 log.)
**P2.6 Choice cards.** Single component for peace offers / events / confirmations:
title, trigger line ("why am I seeing this"), options with mechanical preview.
Used by diplomacy first. (Humankind cards; Old World transparency.)
**P2.7 Minimap options.** Size toggle (S/L), territory shading toggle, explored-only
vs full toggle. localStorage. (Civ 7 minimap lesson.)

## 6. Phase 3 — micro-killers (`[ENGINE]` = needs dispatch/state work + golden bump)

**P3.1 Repeat production toggle `[ENGINE]`.** `city.productionRepeat: boolean`;
engine re-queues same item on completion. Small, high-value. (SoC repeat; CQUI queue.)
**P3.2 Research queue `[ENGINE]`.** `player.researchQueue: string[]`; engine advances
on completion. (Civ 7 patch 1.2.0 concession.)
**P3.3 City focus `[ENGINE]`.** `city.focus: 'balanced'|'growth'|'production'|...`
steering worked-tile assignment; UI shows what changed and why. No full governors,
ever. (Stellaris designations, scoped.)
**P3.4 Rally points `[ENGINE]`.** `player.rallyTileId`; new units path there when able.
(SoC rally — kills unit-shuttling micro.)
**P3.5 Production queue (multi-slot) `[ENGINE]`.** Only if P2.2 proves insufficient:
`productionQueue` already an array — allow N items + drag reorder + repeat flag.
Bigger AI-planner + e2e surface; explicit decision point after Phase 2 ships.

## 7. What we explicitly will NOT build

Governors/full automation · second civic-tree codepath · stacked modals · Undo system
(deterministic-RNG replay risk) · Orders economy · grievance simulation · 3D anything ·
map pins before type-to-find search (search first, pins only on demand).

## 8. Rubric (ship gate: ≥4/5 each applicable item)

1. **5-second glance** — yields, selected-unit orders, top blocker in ≤5s (timed shot).
2. **End-Turn findability** — unaided turn-1 end turn (3 fresh players someday; until
   then scripted first-run checklist — see §9).
3. **Idle-work discovery** — any idle item ≤2 clicks from map (click-count audit).
4. **Number stability** — 10 turns, no topbar/banner reflow (record + diff).
5. **Contrast pass** — data text ≥4.5:1 on worst-case tile (checker + grayscale).
6. **Color redundancy** — desaturated mock keeps friend/foe/movable/blocked distinct.
7. **Toast discipline** — zero blocking modals for non-blocking events; bursts batch.
8. **Hint annoyance** — dismiss-once semantics specified for every new hint surface.
9. **Keyboard-only turn** — found/move/produce/end-turn mouseless with visible focus.
10. **Reduced-motion parity** — every action acknowledges ≤200ms with motion off
    (add `prefers-reduced-motion` + toggle; currently missing — P1 prerequisite).

## 9. Test/backstop plan

- Unit: extend `tests/art/registry.test.ts` pattern — new `tests/ui/` suites for
  attention-selector logic (pure functions over fixture states), search filter,
  turns-left math. No engine changes in P1–P2 ⇒ golden hash frozen.
- E2E: new specs per surface (attention badge count, toast jump, tech search,
  ribbon presence, lens toggle, overview open, help search); regenerate baselines
  once per phase via `--update-snapshots`.
- Rubric evidence per phase: clips/screenshots filed under `temp/` during work,
  summarized in AGENTS.md (§ Status).

## 10. Research ledger (why each phase exists)

- Civ 7 postmortem: hover-must-answer, gains-with-losses, no 3-click numbers, PC
  mouse conventions, search/cycle/lenses/pins, attack alerts, readable HP/borders/MP,
  unique icons, no space-saving submenus, notification destinations, ungated help,
  minimap parity, inspectable-deal modals. Full analysis in session notes 2026-09-06.
- Best-practice steals: CQUI smart banners/compress/enumerate; Stellaris outliner +
  4.4 situation log + alert hierarchy; Old World cost-visibility/trigger-transparency;
  Humankind choice cards + fame tracker; ES2 pressure bars + pushpin; SoC rally +
  honest build sizes; EL2 consolidation warning (co-locate decision + action).
- Craft principles: 3-chunk disclosure cap; tabular numerals; 2 type roles; 4–6 status
  colors + redundant encoding (Okabe-Ito; blue↔orange safest); End-Turn-as-lever;
  triage mapping (interrupt/badge/toast/log); pull-revelation onboarding; XAG checklist.

## 11. Decision needed (answer to unblock)

1. **Scope:** Phase 1 only / 1+2 / 1+2+3?
2. **P3.5 trigger:** build multi-queue now, or decide after P2.2 ships?
3. **Help depth:** content-generated reference only, or also hand-written concept
   entries (ZOC, drift, 1UPT) in v1?
4. **Minimap default:** keep top-right (current) or move bottom-right (genre norm)?
