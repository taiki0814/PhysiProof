# Spot map retrieval reliability (2026-10-09)

### Acceptance criteria and working notes
- Preserve spot placement, public-access filtering, spacing, immutable battle rules and existing invitations. No schema/DB migration is needed: the shared invitation contract is unchanged.
- Reduce map query/output size, use at most two sequential public Overpass providers, and respect 406/429 cooldowns instead of rapid retries.
- Reuse fresh walking data for one hour and a last successful map for at most 24 hours during outages. Never invent coordinates, silently disable spots, or save a partial invitation on failure.
- Reject partial/error JSON, ignore corrupt/failed optional caches, and coalesce concurrent identical map lookups.
- Verify regression tests, full tests/typecheck/build, one bounded live public-park map lookup, then commit/push main and check the existing deployment workflow. Do not create invitations against real teams as a diagnostic side effect.

### Checklist
- [x] Inspect reported 504 failure, shared contract, current service and provider policies.
- [x] Implement resilient retrieval and update rule/help copy.
- [x] Add regression coverage and verify real map retrieval without production DB writes.
- [x] Run full verification, review the exact diff and record lessons/results.
- [ ] In progress: commit/push with the preceding author identity and verify deployment.

### Results
- Replaced the single broad Overpass query with an explicitly-public small query and two sequential, 15-second-bounded providers. Fresh/last-success caches, cooldowns, malformed/partial-response rejection and same-area in-flight coalescing preserve existing spot placement and battle rules. Added compact help copy; no schema, migration or existing data changes.
- Added 25 service regression cases and one actual Hono/SQLite invitation case proving fallback, atomic saving and fixed spot coordinates. All 725 tests, typecheck, workspace build and whitespace checks pass; existing mixed-import/large-bundle build warnings remain.
- Executed the changed generator against real public-park map data without saving a production invitation: HTTP 200 from Private.coffee, six valid spots, minimum spacing 658m, 2.6 seconds and one external query. Real production-browser submission is not verified because the browser helper was unavailable in the preceding diagnostic turn.
- Commit SHA, push and deployment outcome are reported in chat after execution. The existing main CI handles deployment; no manual production DB writes or migration are required.

# Dashboard ink-street visual pass

## Goal and acceptance criteria
- Restyle the dashboard home with a vivid, playful ink-street game atmosphere without using Splatoon logos, characters, or copied assets.
- Preserve all current actions, API calls, data, and responsive behavior.
- Keep text readable, add visible keyboard focus, and respect reduced-motion preferences.
- Run the frontend build and show the changed dashboard in the local preview.

## Working notes
- Scope: dashboard shell, home hero, home cards, and navigation styling only.
- Existing baseline: frontend build passes with existing chunk-size and mixed dynamic/static import warnings.
- Local preview at `127.0.0.1:5173` was not responding; start Vite after the edit.
- No backend, database, dependency, or asset changes.

## Checklist
- [x] Inspect current dashboard, home component, project rules, and Git status.
- [x] Run the baseline frontend build and check preview availability.
- [x] Implement the dashboard visual refresh in existing components/styles.
- [x] Verify the frontend build and HTTP preview response.
- [x] Record results and remaining warnings.

## Results
- Replaced the home brand-only header with a Japanese field-report hero and added ink-street styling to the dashboard shell, HUD cards, quick actions, and mobile navigation.
- Kept actions, API calls, and data logic unchanged; added visible keyboard focus and reduced-motion handling.
- `npm run build --workspace=@my-app/frontend` passes. Existing warnings remain for mixed static/dynamic imports and the large JS bundle.
- `git diff --check` passes. `http://127.0.0.1:5173/dashboard` responds HTTP 200; the preview was queued in the Codex panel. Automated screenshot capture was unavailable because the computer-use helper failed to start.
- No backend, D1, dependency, or deployment changes. Changes remain uncommitted.

## Multi-team battle implementation

### Goal and acceptance criteria
- A team leader can select one or more opposing teams for a single period-based battle.
- Each invited team leader responds independently; any decline rejects the event, and scoring begins only after every invited team accepts.
- Battle results show each team's raw point total; team-size normalization is intentionally not performed.
- Only verified live push-up records during the battle window count, with roster snapshots per team's acceptance.
- Local D1 only; no Cloudflare remote migration, deployment, or Git commit.

### Working notes
- Preserve the already-applied `0024_add_team_battles.sql`; add an additive `0025` migration for participant invitations and legacy backfill.
- The legacy `team_battles.team_b_id` remains as a compatibility field; new behavior uses participant rows.
- The current local implementation has user changes in dashboard/design files; avoid unrelated edits.

### Checklist
- [x] Update the shared Zod contract for multiple opposing teams and participant score/status summaries.
- [x] Add a D1 migration for participant invitation state and backfill existing battles.
- [x] Update create/respond/list APIs and keep realtime-only score accounting.
- [x] Update the team UI to multi-select opponents and show a per-team scoreboard.
- [x] Add schema regression tests and run typecheck, tests, build, local migration, and preview checks.

### Results
- Added participant-based invitations. All invited team leaders must accept before the event is scheduled; one decline cancels the event.
- The team tab now uses checkboxes (up to 50 opponents) and shows each team's raw points and invitation state. No team-size normalization is performed.
- `0025_add_multi_team_battle_participants.sql` was applied to local D1 only, with a backfill for existing two-team battles.
- `npm run typecheck`, `npx vitest run` (12 tests), `npm run build`, and `git diff --check` pass.
- Local API smoke checks passed for multi-team listing, staged acceptances, and cancellation on decline. Temporary test rows were removed.
- The local dashboard responds HTTP 200. No remote D1, deployment, or Git commit was changed.

## Running-first activity modes and team territory battles

### Goal and acceptance criteria
- A run is recorded once with its personal/team mode and the team selected at that time; later membership changes never reassign it.
- Every valid run contributes to the runner's personal distance. Only team-mode runs contribute to the snapshotted team's cumulative distance.
- Personal and team territory layers are separate. Team polygons from different members merge geometrically, with overlap counted once and member attribution retained in run records.
- Team battles use only online-accepted activity during the battle window. Distance and territory net change are reported separately; pre-existing area is not carried into the battle score.
- Existing territories become personal territories. Existing run distance is carried over only as a clearly marked best-effort estimate; it is never backfilled as team activity.
- The app displays an online-required state offline, and offline queues are not replayed as team or battle contributions.
- Local migration, typecheck, tests, build, and local-preview checks pass; no remote D1 or deployment changes.

### Working notes
- User approved battle territory scoring as team area change from battle start to end, including losses, with old area excluded.
- User approved treating all existing territories as personal and best-effort migration of existing distance.
- User wants the app itself unavailable offline. Current app stores offline run/push-up/meal queues; these must not auto-sync under the new policy.
- Current territory distances are aggregated into mutable territory polygons; add run-level records as the authoritative source for distance.
- Current territory updates can change ownership geometry; keep the personal and team layers isolated so personal mode cannot alter team battle area.
- Team battle scoring coefficients are adjustable but must be snapshotted per battle so an active battle's rules cannot change mid-event.
- Personal distance includes runs in either mode; team distance and battle eligibility are based on mode/team snapshots.

### Checklist
- [ ] Define shared Zod schemas for activity modes, run summaries, distance/area battle scores, and adjustable scoring settings.
- [ ] Add additive D1 migrations for run-level distance records, battle score events/baselines, and legacy territory/distance treatment.
- [ ] Implement authenticated online run recording with immutable mode/team attribution and idempotency.
- [ ] Separate personal and team territory mutations; preserve same-team cross-member union and unique area accounting.
- [ ] Implement battle distance and net-area scoring restricted to the accepted roster and battle window; remove push-up battle scoring.
- [ ] Add APIs for home/team profile distance summaries, current uniforms, battle score rates, and member visibility.
- [ ] Update run-mode/uniform UI, home and team member summaries, and battle scoreboard; de-emphasize strength-training UI without destructive data deletion.
- [ ] Add an app-wide online-required gate and prevent legacy offline queues from syncing.
- [ ] Add schema, API, territory, scoring, privacy, and offline regression tests.
- [ ] Apply migrations to local D1 only; run typecheck, tests, build, and preview checks.
- [ ] Record results and remaining caveats.

## Running-only missions and territory fortification removal

### Goal and acceptance criteria
- Daily missions are created and progressed only by completed online running sessions with positive distance.
- A running mission grants XP only; exercise and meal-analysis features remain usable but grant no XP, achievements, or mission rewards.
- Territory overlap always uses the same normal area subtraction, regardless of legacy fortification values.
- Remove fortification UI and claim flow without deleting the legacy database column or existing user records.
- Preserve running, team battles, territory merging, and the pending ranking text-search changes.

### Checklist
- [x] Update shared mission contract and backend mission lifecycle.
- [x] Remove fortification-dependent territory capture and merge behavior.
- [x] Remove fortification and non-running reward UI; keep exercise and meal analysis available.
- [x] Add/adjust regression tests and run typecheck, tests, build, and preview checks.
- [ ] Review diff, commit with the existing author metadata, push, and verify deployment workflow.

### Results
- Daily mission progress now comes only from a completed online run with positive distance. Claiming it grants 100 XP; push-up logging and meal analysis remain available but do not grant XP, achievements, or mission progress.
- Removed fortification effects and related UI. Territory overlap/capture follows the normal geometry rules; legacy DB columns and historical user records are preserved.
- Preserved the in-progress ranking text search and included its files in the same pending change set.
- `npm run typecheck`, `npx vitest run` (28 tests), `npm run build`, and local preview HTTP checks pass. Build reports the existing mixed-import and large-chunk warnings. No schema change was required, so no D1 migration was added.
- `packages/backend/wrangler.toml` contains a plaintext API-key-like setting. It was not changed or included; if that value has been pushed to a public remote, rotate it.

## Lifetime running titles

### Acceptance criteria and working notes
- Use personal lifetime distance, including completed personal/team runs and the existing legacy-distance carryover.
- Award the agreed 12 titles at 1, 5, 10, 25, 50, 100, 200, 300, 500, 750, 1,000, and 2,000 km.
- Before 1 km, show no earned title and progress toward the first title. Keep the highest title beyond 2,000 km.
- Show the current title, next target, and progress on Home; show member titles and their profile progress within the existing team visibility scope.
- Derive titles from the already-persisted lifetime distance; no new D1 migration or reward changes are needed.
- Commit and push using the preceding commit's author identity, then propose higher titles without implementing unapproved thresholds.

### Checklist
- [x] Inspect repository rules, lifetime-distance aggregation, and profile UI.
- [x] Implement shared title schemas/definitions, progress logic, and responsive profile displays.
- [x] Verify all milestone boundaries, initial/max states, typecheck, build, tests, and UI rendering.
- [x] Review the verified change set for delivery. Commit/push and workflow status are reported with the delivery.

### Results
- The shared definitions drive both Home and team-member views from persistent lifetime distance. No database migration is required.
- Initial typecheck, build, and all 61 tests passed, including 33 title/progress tests.
- Headless browser checks cover initial titles, exact milestones, maximum/above-maximum distance, 12-title expansion, info hints, and viewport widths 320/390/768/1365.
- Visual review caught a member-profile dialog positioned relative to a filtered ancestor; moved that dialog to a body portal and retained viewport-bounded scrolling.
- Final typecheck and full workspace build passed after the dialog correction. The existing mixed-import and bundle-size warnings remain.
- The final browser checks passed for six distance states, all four widths, expanded milestones, hint open/close, team badges, profile open/close, and vertical close-button bounds at 320px. No page JavaScript errors were recorded.

## Upper running titles

### Acceptance criteria
- Extend the agreed ladder with 3,000 km / 超越のランナー, 5,000 km / 神話のランナー, and 10,000 km / むげんのランナー.
- Preserve the existing titles. At 2,000 km, continue toward 超越; keep むげん as the highest title beyond 10,000 km.
- Home, milestone lists, and team-member profiles must show the 15-stage ladder using the same shared definitions.
- Propose further upper tiers separately from this implementation.

### Checklist
- [x] Review the compatible shared schemas, definitions, progress logic, and displays.
- [x] Extend the title definitions and boundary/progress tests.
- [x] Verify typecheck, tests, build, and responsive browser scenarios.
- [x] Review the verified changes for delivery.

### Results
- The shared ladder now contains 15 titles. The existing views automatically use the new stage count and next-title targets.
- Typecheck, full workspace build, and all 70 tests passed, including 42 title tests. Build retains its existing mixed-import/bundle-size warnings.
- Browser checks passed for 12 distance states and widths 320/390/768/1365, with all 15 milestones, member badges, profile and hint open/close, and no page JavaScript errors.

## Running titles through 30,000 km

### Acceptance criteria
- Add the approved titles at 15,000 km / 次元のランナー, 20,000 km / 宇宙のランナー, and 30,000 km / 創世のランナー.
- Continue progress beyond 10,000 km and retain 創世 as the current highest title beyond 30,000 km.
- All existing title views must use the 18-stage shared ladder without changing distance accounting.
- Commit and push the verified implementation; separately propose further thresholds and titles through 100,000 km.

### Checklist
- [x] Review current definitions, compatible schemas, and automatic title displays.
- [x] Add the three titles and update milestone/progress verification.
- [x] Verify typecheck, tests, build, and mobile/desktop browser displays.
- [x] Review the change set for delivery.

### Results
- The shared ladder now has 18 titles. Existing Home and team-member views automatically follow the new stage count and next-title targets.
- Typecheck, full workspace build, and all 79 tests passed, including 51 title tests. Existing mixed-import and bundle-size build warnings remain.
- Browser verification passed for 18 distance states and widths 320/390/768/1365, all 18 milestones, the new next-title targets, maximum-title display, hint and member-profile open/close, and viewport bounds. No page JavaScript errors were recorded.

## Running titles through 100,000 km

### Acceptance criteria
- Add the approved tiers at 40,000 km / 万象のランナー, 50,000 km / 至高のランナー, 75,000 km / 究極のランナー, and 100,000 km / 走りの化身.
- Continue progress beyond 30,000 km. At and beyond 100,000 km, retain 走りの化身 with no further target.
- Home, title milestones, and team-member profiles must use the same 22-stage ladder and existing lifetime-distance accounting.
- Deliver the verified changes with the established commit/push workflow.

### Checklist
- [x] Review compatible schemas, definitions, tests, and title displays.
- [x] Add the four title tiers and update milestone/progress coverage.
- [x] Verify typecheck, tests, build, and responsive browser scenarios.
- [x] Review the verified change set for delivery.

### Results
- The shared ladder now contains 22 titles. Existing Home, milestone, and team-member views automatically use the new stage count and next-title targets, without changing distance accounting.
- Typecheck, full workspace build, and all 91 tests passed, including 63 title tests. Existing mixed-import and bundle-size build warnings remain.
- Browser checks passed for 26 distance states and widths 320/390/768/1365, all 22 milestones, the new next-title targets, and the highest-title display at and beyond 100,000 km. Hint and member-profile open/close and viewport bounds passed, with no page JavaScript errors.

## Uniform editor

### Acceptance criteria
- Add an accessible, responsive uniform tab with original presets, separate selectable parts, colors, bounded emblem placement, name/number, front/back previews, save, and re-edit.
- Persist one personal uniform and one team common uniform in D1. Only the current team owner edits the common design; members edit their own team name/number.
- Display the selected activity uniform on Home and during running, and both uniforms on same-team member profiles. Keep avatars, map identification colors, distance and scoring unchanged.
- Use shared Zod schemas, authenticated Hono RPC, additive migrations, stable versioned assets, and revision conflict protection. No uploads or third-party brand copies.

### Checklist
- [x] Inspect existing schemas, auth, navigation, team ownership, and displays.
- [x] Implement schemas, D1 persistence, and permission-checked API.
- [x] Implement original SVG renderer, editor tab, and display integration.
- [x] Verify schemas/API authorization, persistence, conflicts, typecheck, tests, build, and responsive UI.
- [x] Summarize results and local preview; do not push/deploy without a new request.

### Working notes
- Existing app authentication uses test-token UID headers; reuse this interface without broadening this task into auth migration. This is not production-grade identity verification.
- One saved design per personal/team scope, with independent member lettering. No history/scoring changes or live run data migration.

### Results
- Added a uniform tab and six original presets; three bases, eight patterns, six line options, nine emblem choices (including none), seven editable colors, bounded emblem placement/size, three fonts, and name/number. SVG IDs are per-instance; version-1 artwork remains stable.
- Added personal/team/member-lettering persistence with authenticated identity-derived owners, same-team member viewing, leader-only common edits, guarded UPSERTs, and revision-conflict rejection. Local D1 migration 0029 applied successfully; no remote migrations/deployments or commits/pushes performed.
- Home and the running map show the activity-mode uniform; team profiles show individual/team uniforms. Avatars, distance accounting, scoring, and territory identification colors remain unchanged. Admin menu visibility now includes uniforms.
- Typecheck, workspace build, and all 234 tests passed (143 new uniform schema/API cases). Existing mixed-import and bundle-size warnings remain.
- Browser verification using the actual uniform router and an isolated SQLite database passed save/reload, personal/team separation, name/number independence, owner/member permissions, conflict preservation, validation, member galleries, and existing offline gate/reconnection. Widths 320/390/768/1365 passed; no page JavaScript errors. Mobile/desktop screenshots were inspected.
- Built-in browser automation could not start because of its Windows sandbox helper error; headless browser verification was used with synthetic identities/data, never existing user data. Preview: /dashboard?tab=uniform.

## Admin uniform template catalog

### Acceptance criteria
- Manage complete designs in Admin: create/edit/copy, metadata/category, draft/published/hidden, display order, front/back thumbnails and previews.
- Persist the catalog in D1, seed the existing six designs, show only published items to users, and support search/category/pagination for growing catalogs.
- Copy selected design values into user/team uniforms; template edits or hiding must never alter saved uniforms. No uploads/new artwork registry in this phase.
- Check admin role in the backend, validate shared schemas, reject stale updates, and retain drafts after errors. Preserve previous uniform editor work.
- Verify typecheck/tests/build, real SQLite SQL and responsive UI, then commit/push the scoped editor and catalog work using the previous author identity.

### Checklist
- [x] Review existing editor, admin routes, schemas, and deployment workflow.
- [x] Implement schemas, migration and catalog APIs.
- [x] Implement admin management and published catalog integration.
- [x] Verify permissions, publishing, copies, saved-design stability, conflicts, pagination and responsive UI.
- [x] Review the complete editor/catalog change set and prepare the verified commit/push delivery.

### Working notes
- Existing test-token auth remains a known production limitation; use DB-backed admin role checks without changing unrelated identity flows.
- main push triggers the established Cloudflare migrations/Worker/Pages workflow; do not perform separate remote data writes.

### Results
- Added DB-backed complete-design administration with create/edit/duplicate, name/category/description, draft/published/hidden states, sort order, front/back previews, filtering and pagination. The existing six designs are seeded by additive migration 0030, applied locally.
- Uniform workshop now reads only the published catalog with search/category/page controls and explicit refresh. Selection copies design values; subsequent editing/hiding of the source leaves saved personal/team designs unchanged.
- DB-backed admin checks and guarded writes protect management endpoints within the existing authentication interface; optimistic revisions reject conflicts and preserve the editing draft.
- Typecheck, workspace build, git diff whitespace checks and all 373 Vitest cases passed (139 new catalog/schema cases). Existing mixed-import and bundle-size warnings remain.
- Real SQLite verification executed the actual migrations/routers and passed seed equality, published-only visibility, literal search, ordering, pagination, revisions, duplicates and personal/team snapshot independence.
- Isolated browser checks passed new/save/publish/hide/duplicate, metadata-only save, user selection/persistence and conflict draft preservation at widths 320/390/768/1365 with no page errors. Existing uniform/team/offline checks also passed. Mobile/desktop screenshots were inspected.
- Delivery includes the previously uncommitted uniform editor and catalog work. main push uses the existing GitHub Actions Cloudflare D1 migrations/Workers/Pages workflow; the delivery SHA and deployment result are reported in the chat.

## Unified application icons (local trial)

### Acceptance criteria
- Replace mixed emoji UI decoration with the existing Lucide SVG family: consistent stroke/size, currentColor, subdued inactive state and existing neon active/recording state.
- Keep readable labels, navigation, keyboard/focus, help behavior, recording state, notification/badge meanings and map actions intact.
- Cover main dashboard/Home/map/team/rankings and secondary app/admin chrome; preserve personal avatars, user-authored content, uniform artwork, maps, API data and scoring.
- Use frontend-only presentation changes: no shared data schema/DB change or new dependency required.
- Show the local trial and inspect mobile/desktop views; do not commit, push or deploy without a new request.

### Checklist
- [x] Inspect existing icons, available dependency and repository state; propose the visual direction.
- [x] Implement the common icon language and scoped screen replacements.
- [x] Verify accessibility, navigation/actions, recording state, popover bounds, responsive rendering, typecheck/tests/build.
- [x] Inspect screenshots, request the local preview and summarize the reversible trial.

### Working notes
- Existing lucide-react 0.395 is installed; use exported Home and LineChart (not newer House/ChartLine aliases).
- This trial changes presentation only. Existing stored achievement icon strings are translated when rendered, not rewritten.

### Results
- Added a shared Lucide SVG component and replaced emoji-based UI decoration across dashboard navigation, Home/map/team/rankings, notifications/help, secondary features and admin chrome. Consistent 2px strokes and currentColor retain neon active/recording accents. Improved mobile navigation label readability; avatars, message text, uniform artwork, map data and all scoring/API behavior remain unchanged.
- Existing achievement icon metadata is translated only at rendering time, with safe own-property lookup and a neutral fallback. No shared schema, DB data or dependency change.
- Typecheck, workspace build and whitespace checks passed; all 498 Vitest tests passed, including 125 new icon SSR/accessibility/metadata regression cases. Existing mixed-import and bundle-size warnings remain.
- Isolated browser tests passed SVG rendering, accessible controls, notification text preservation, navigation, help bounds/Escape, milestone icons and red recording indicators at widths 320/390/768/1365, with no page errors. The existing actual-router/in-memory SQLite uniform suite also passed save/reload, conflicts, team permissions, member galleries and offline/reconnection behavior.
- Inspected before/after mobile navigation and mobile/desktop/admin screenshots. Native browser automation could not start due to its helper process error; verification used an isolated headless browser with synthetic data, not a physical phone or existing user records. Local frontend/API restarted; preview requested at http://127.0.0.1:5173/dashboard (Codex returned queued).
- Local trial only: no commit, push, production deployment or remote DB mutation.

## Deliver approved icon update

### Acceptance criteria
- Commit only the reviewed icon presentation changes, regression tests and task notes, using the preceding commit's author identity.
- Push main without rewriting history; the existing GitHub Actions Cloudflare workflow is triggered by that push.

### Checklist
- [x] Confirm the user's approval, scoped diff, author identity and existing deployment trigger.
- [x] Recheck tests and remote branch state, stage and review the exact delivery.
- [x] Prepare the approved normal commit/push and post-push remote/working-tree verification; report execution results in chat.

### Results
- Rechecked typecheck and all 498 tests successfully. main and origin/main matched before delivery; the staged whitespace check passed and the exact scope is 27 frontend/test/task-note files, with no generated screenshots, dependencies, backend changes or migrations.
- The earlier local-trial result describes the state before this explicit approval. The resulting commit SHA, push and remote verification are reported in chat after execution; no separate manual production deployment is requested.

## Battle-only retained territory holding points

### Acceptance criteria
- New battles score distance + signed final net territory gain + accumulated holding of positive net gain above battle-start area. Previously earned holding survives loss; loss stops future accrual and reacquisition resumes it without crediting the lost interval.
- Server-time area changes and the accepted battle window are authoritative. Old territory has no initial holding credit; no area cap, offline run upload or retrospective team reassignment is introduced.
- Normalize holding area-time by the battle's full duration; default 1,000 sqm held for the full period = 1 point. Admin-adjustable rate is snapshotted at creation alongside existing rates.
- Preserve existing battles under version 1; apply version 2 to new invitations only. Personal/team lifetime distances, territories, titles, membership, history visibility/cancellation and existing online validation remain intact.
- Persist an additive, battle-scoped area-change ledger automatically for every real team territory change, including attacks, merges and deletions. Read-only score calculation must freeze at battle end and never duplicate earned time across refreshes.
- Verify shared math/schema, real SQLite migrations/triggers/API, responsive UI and full tests/typecheck/build; apply migration locally, commit/push using prior author. Existing main CI performs production migrations/deployment.

### Checklist
- [x] Inspect scoring paths and define/export shared contracts and pure holding calculation.
- [x] Implement additive migration, authoritative event accounting and battle API integration.
- [x] Add battle breakdown/help/refresh and administrator coefficient controls.
- [x] Verify boundary/loss/recapture/concurrency/legacy/privacy cases and responsive UI.
- [x] Record verification, prepare the scoped commit/push and post-push checks; report delivery execution results in chat.

### Working notes
- Initial main/origin/main is 34ac1b90; workspace clean. This is battle-only; no new map item mechanic or general score changes.
- A holding score is earned by server-side territory ownership, not by leaving the app open. Offline recordings still cannot add distance or territory.
- At simultaneous merge events, sum area changes at the same server second before integrating; temporary row reorganization must not create holding credit.
- Area-loss audit found pre-existing partial capture writes and completed-session replay. Scope-relevant hardening: defer all opponent/own writes until validation succeeds and use a unique per-session claim in the same transaction. Notifications follow successful commit. Broader geometry hole/fragment representation and old roster/territory attribution issues remain separate follow-up work.

### Results
- Implemented shared v2 score contracts and positive-net-area holding integration, additive migration 0031 with ownership-change triggers, rule/rate snapshots, separate distance/territory/holding API fields, compact help, 30-second visible-only refresh for pending/scheduled/active battles and admin rate controls. Existing invitations/history stay v1 with zero holding points; no retrospective scoring or changes to normal running statistics/titles.
- Local D1 migration 0031 applied successfully. Team captures now atomically finalize a unique run-session claim with both sides' territory mutations; rejected captures and concurrent duplicate requests cannot leave a defender carved or duplicate ledger entries. Existing geometry representation and roster attribution are not redesigned in this task.
- Final full verification passed: all 664 tests (including 61 actual-migration/SQLite/route cases), typecheck, workspace build and whitespace checks. Real-route tests cover admin coefficient permissions/validation/persistence, frozen invitations, loss/recapture, privacy, legacy compatibility and atomic concurrent claim rollback. Existing mixed-import and bundle-size warnings remain.
- Isolated headless browser checks passed the three-part score display, legacy-rule label, help bounds/Escape, 30-second refresh, long team names/huge totals and admin save payload at 320/390/768/1365 widths, with no page errors. Inspected mobile and desktop screenshots. The computer-use browser helper failed to start; browser QA used synthetic fixtures and did not modify existing user data. Real outdoor GPS running and a physical phone are not tested.
- Local frontend responds 200 and API health reports online. The dashboard preview was requested in Codex (queued); use its Team tab to see battle cards. main and origin/main matched before delivery. The exact resulting commit SHA, push and post-push verification are reported in chat after execution; production migration/deployment uses the existing main GitHub Actions workflow, without a separate manual deployment.
