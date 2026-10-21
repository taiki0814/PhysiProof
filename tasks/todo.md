# Local / production administrator screen parity (2026-10-16)

### Acceptance criteria / plan
- Compare the actual local and production admin routes and served code. Do not treat the isolated, in-memory Uniform Studio fixture as the full administrator application.
- Restore the local API and apply pending migrations only to local D1. Keep local D1/KV, credentials and sessions isolated from production; do not copy real users, tokens or production images, grant roles, or redirect local writes to production.
- Make the ordinary admin route easy to find from the diagnostic page and clearly identify synthetic data. Provide a reproducible one-command local startup that runs migrations and both required servers without logging secret bindings.
- Verify navigation/layout, fail-closed admin access, local persistence and startup errors; run regression tests/typecheck/build. This task does not authorize a new production deployment or commit/push.

### Checklist
- [x] Diagnose: local tab points at /qa/uniform-studio.html, which mounts only the component fixture; 5173 is running, 8787 is stopped. Local migrations 0033-0035 are pending. Both environments use the same AdminDashboard source; there is no DEV/PROD admin layout fork.
- [x] Clarify fixture entry, restore real local startup/migrations and normal admin route.
- [x] Verify API/proxy/storage/auth, fixture link, regression tests/typecheck/build and document results.
- [x] Human-assisted visual comparison completed after the user logged in locally. No production session copied or roles granted.

### Results / evidence
- Added npm run dev: applies pending migrations with --local, starts the real Worker and Vite, checks readiness and stops owned servers together. Uses process.execPath/argument arrays, loopback fixed ports, no production API override, no secret-binding startup output and no unrelated-process termination. Existing separate startup scripts remain available.
- Applied local migrations 0033-0035 without replacing users/designs. Local frontend/API now run at 127.0.0.1:5173/8787; Vite proxy uses the same IPv4 address. Public local catalogue reports KV ready, 3 standard models, zero local image usage; unauthenticated admin remains 401. No production data is imported or modified.
- The fixture now visibly says it is component-only/in-memory, warns that reload loses fixture data, and links to /admin?tab=uniform-templates and the actual workshop. It does not impersonate an administrator or acquire a real session.
- 811 tests (12 new), typecheck, normal and production-equivalent frontend builds passed. Production-equivalent JS exactly matches deployed index-ByDF0Ac1.js, SHA-256 3765C4F5A263AE09AC0BB3C8DBA5A9ED813657230BE07CDAADE0BFD5DA7300C8. Existing large-chunk/mixed-import warnings remain. Actual duplicate startup exits 1 without stopping the existing API; ownership/valid-PID shutdown logic is separately tested without terminating real unrelated processes.
- Native in-app browser confirmed the new fixture notice/link, real local app loading, and general-user redirect rather than an admin bypass. The user then logged in locally. Actual local/production UI comparison matches all 11 admin menus, selected tab, background and both uniform sections; local shows 3 models / 6 completed templates. Aggregate counts differ because DBs are intentionally separate.
- Imported an owned synthetic SVG through the real local file picker, saved ローカル保存確認_20261016 as a private local draft, navigated to a fresh full page, and re-fetched its 244×480 image / 98×192 thumbnail from local D1/KV. Local writes increased from 0 to 2; no other existing records were modified. Screenshot: OS temporary directory physiproof-local-admin-fixed-20261016.png. This is the ordinary app, not the in-memory fixture.
- Local changes only, not committed/pushed/deployed. Production test material from the preceding request stays a private draft; this fix performs no production writes.

# Card-free uniform image storage via Workers KV (2026-10-16)

### Acceptance criteria / plan
- User approved replacing unactivated R2 with Workers KV on the Free plan; never enter card details, activate R2, or change to a paid plan.
- Preserve D1 metadata, immutable versions, admin session checks, legacy uniforms, running and scoring. Storage adapter adds KV without reinterpreting pre-existing R2 keys.
- Represent storage/provider/usage in shared contracts; reserve upload/storage budgets atomically in D1 before KV writes. Never publish a partially uploaded version.
- Treat existing-version KV misses as temporary propagation (503, no-store, Retry-After), not permanent public 404 cache entries. Keep draft edits on failed uploads.
- Verify real workerd/D1/KV persistence, concurrency/quota/failure/privacy cases and mobile UI; provision a dedicated namespace, deploy and confirm actual remote storage.

### Checklist
- [x] Inspect implementation, previous pending changes and official KV limits/consistency.
- [x] Shared status contracts, append-only budget migration and KV adapter/API.
- [x] UI for storage readiness/limits and transient retry; preserve existing behavior.
- [x] Real KV persistence: 52 workerd checks, same 52 for legacy R2 fallback, quota/concurrency/privacy tests; dedicated free namespace created and binding configured.
- [x] Commit/push, deploy and confirm actual production KV binding, migration and frontend delivery.
- [x] Human-assisted final production upload/readback completed after the user's administrator login: created private draft 本番保存テスト_20261016, reloaded the page, re-fetched 976×1920 PNG / 98×192 thumbnail and drawing source, and matched the saved layer coordinates. Public search returns zero draft items; 45,692 stored bytes / 3 writes. No other existing production records changed.

### Working evidence
- Created only the dedicated KV namespace `my-app-backend-UNIFORM_ASSETS_KV` (ac3d9ea43b8f4d1fbb7d35a05f76b1ba) using existing approved OAuth. No R2 activation, billing change, card registration or paid plan.
- Reservations count ambiguous/failed writes conservatively and are committed with metadata in the same D1 batch. Unique keys and stored provider prefixes preserve old versions and concurrent winner objects.
- Workerd caught the installed Miniflare's older minimum cacheTtl (60 seconds); use 60 for provider caching while client retries every 30 seconds. Browser failures were not marked as completed verification.
- Final verification: 799/799 tests, typecheck, production frontend build and whitespace checks passed. Native in-app browser synthetic QA at 390px verified loaded PNG, editable image, new revision, immediate thumbnail, persistent save notice and in-bounds storage help. Runtime persistence was checked separately against real on-disk D1/KV, not inferred from the memory UI fixture.
- Current OAuth can create/list this KV namespace but direct value writes return 10000; temporary Worker deploy also lacked script-deployment access, so no temporary Worker or remote test values were created. These were bounded diagnostics only. Do not broaden permissions silently; use the established CI deployment token for the production binding and clearly separate local upload evidence from production upload evidence.
- Delivery: ffa2947e867fa902cf2d0beb4922bfc5edba9d8e pushed normally to main with the previous author. GitHub Actions run 38837667820 succeeded through D1 migration 0035, Worker and Pages deployment.
- Production public catalogue reports storage_ready:true, provider:kv, capacity_bytes:900000000 and daily_object_write_budget:900; API health is online, admin without authentication is 401, dashboard is 200 and serves index-ByDF0Ac1.js with the new storage/retry UI. Live browser confirmed the workshop and three standard models without saving/changing the current user's design.
- Storage uploads/readback/restart were verified locally in the real Worker runtime (52 checks each for KV/R2) and browser persistence flows only in the explicitly synthetic fixture; a real production administrator upload is not claimed. No subscription, card registration or existing production user-data mutation occurred.

# Uniform image registration activation (2026-10-16)

### Acceptance criteria / scope
- Enable actual image/thumbnail/editable-source persistence and subsequent reload, not only the memory-based QA fixture.
- Reuse the existing Hono Worker/D1 and versioned R2 adapter. Do not introduce an unrelated hosting service or change running/scoring/legacy uniforms.
- User approved adding workers:write for project image storage and related settings. Stop before a new paid subscription/payment registration.
- Verify PNG upload, versioned image/source retrieval, private draft access, unchanged previous versions, regression tests and deployment configuration.

### Checklist
- [x] Inspect clean baseline, implementation, cloud connection and repository lessons/rules.
- [x] Refresh approved Cloudflare authentication. First browser consent timed out; the authorization link reopened in Codex completed successfully with the approved workers:write and existing scopes.
- [x] R2 activation was blocked by 10042; user rejected card registration. Superseded by the approved card-free KV plan above; R2 activation is no longer required.
- [x] Replaced the proposed R2 production configuration with the KV plan above.
- [x] Verify local actual registration/reload (51 workerd/D1/R2 checks), all 788 regression tests and typecheck; record the external blocker.

### Working notes / evidence
- Added scripts/verify-uniform-storage.mjs: full production Worker bundled into workerd, all real migrations applied to fresh on-disk D1, R2 images and source persisted in a unique OS temporary directory. No external network requests or real users.
- Actual API verification passed 51 checks: password-issued proof, draft privacy, PNG upload/readback, source readback, full runtime restart, persistence of token/metadata/images, publication, conflict handling and old-version retention after hiding.
- This verifies the runtime/storage code, not production Cloudflare provisioning. Do not mark remote R2 connected until account/bucket/binding and actual remote access succeed.
- Cloudflare authentication successfully refreshed 2026-10-16. Read-only bucket listing then returned account activation error 10042, not the previous missing-scope 10000. Opened the account's R2 Overview for the human to complete the subscription/checkout flow. Existing production Worker, D1 data and Wrangler bindings are unchanged.

# Uniform Studio integration (2026-10-13)

### Acceptance criteria and working notes
- Integrate the friend's SVG garment renderer, front/back patterns, fabrics, lettering and administrator drawing workflow into PhysiProof. Do not copy credentials, data/admin.json, logs, ZIPs or friend-only server authentication.
- Add an explicit new design version while retaining exact legacy records/rendering. Keep personal/team separation, leader-only common edits, member-only own lettering and optimistic revisions.
- Administrators can add garment MODEL definitions as well as pattern/emblem images. Assets use immutable versions; hiding/updating a catalogue entry cannot change already-saved uniforms. Keep completed-outfit presets separate from component assets.
- Store image/thumbnail/editable-source objects in R2 and small metadata/settings in D1. Catalogue reads are paginated and exclude image payloads; only selected version resources are fetched. No new purchases/subscription changes without permission.
- Scope styles and use >=16px mobile inputs. Preserve the existing bottom-navigation keyboard behavior, running/map/scoring functionality and unsaved drafts on failed updates.
- Existing local Wrangler OAuth has account/read + D1/write but no R2 permission. Inspect the connection and request only the necessary user action while completing independent work.

### Checklist
- [x] Inspect friend code, current contracts/permissions, tests, deployment and clean Git baseline.
- [x] Define versioned shared contracts and additive immutable asset storage/migration; missing R2 fails closed.
- [x] Implement paginated APIs, source privacy, password-authenticated administrator proof and personal/team/preset reference validation.
- [x] Integrate renderer/editor and administrator asset/model/drawing UI; retain legacy renderer unchanged.
- [x] Verify actual SQLite transactions, fake R2 uploads/rollback/concurrency, PNG and renderer boundaries; 788 tests pass.
- [x] Typecheck and production build pass. Synthetic browser QA verifies pattern selection/save, model clone/publish, drawing/PNG/source reload, 390px no clipping and 16px inputs, and 1280px preview.
- [ ] Provision/bind production R2: renewal requesting workers:write was rejected by safety review; explicit permission question pending. No OAuth renewal, bucket, purchase or payment registration occurred.
- [x] Commit/push and verify deployment; image uploads remain disabled without R2.

### Verification record
- Feature commit: cbe0820715f955720d796d49568756b798f642cc, main pushed without force; same author as previous commit.
- GitHub Actions run 38350747146 succeeded, including typecheck/build, D1 migrations, Worker and Pages deploy.
- Production /dashboard returns 200, serves index-B8Y02XAE.js and index-y4DAWKbm.css; API health returns online:true.
- Local working tree matched origin/main after feature push. Test results: 788/788 passed; no old designs or running/scoring rules migrated.
- Production image uploads are NOT ready: no R2 bucket or binding has been created; explicit broader-scope permission still pending. No purchase/payment step was performed.

# Prefecture-wide battle spots (2026-10-09)

### Acceptance criteria and working notes
- Resolve the creating leader's fresh GPS to a Japanese prefecture on the server. Fix that prefecture and random public-walking-path spots per invitation; participants share the same saved layout.
- Cover the prefecture, including mapped islands, rather than the old 2km circle. Public permission and reasonable spacing remain mandatory; never fabricate spots in the sea/private land.
- Persist reusable prefecture candidate data, with bounded provider attempts, expiry and cooldown. Preparing a region must not create invitations or contact opponents.
- Additive migration and explicit scope preserve all old invitations, scoring, captures and map separation. GPS is used to resolve the prefecture, not exposed as the leader's exact location in new battle summaries.
- Keep a bounded number of well-distributed spots for mobile/scoring performance; counts may vary with public-path coverage. Do not cap territories.

### Checklist
- [x] Inspect current schemas, map/scoring services, migrations, provider constraints and repository rules.
- [x] Define contracts/migration and implement region resolution, cached candidates and saved placement.
- [x] Update leader GPS preparation UI, region labels and map overview without changing scoring.
- [x] Add real SQLite, geometric, cache/network and client regression coverage.
- [x] Verify full tests/typecheck/build and a bounded real Tokyo preparation without production invitations.
- [x] Review diff, commit/push with preceding author identity and verify normal deployment.

### Results
- Added shared region/scope contracts and additive migration 0033. A leader-only preparation endpoint resolves fresh GPS against all 47 pinned, attributed prefecture polygons; public walking-node candidates are persisted per prefecture with a daily cache, seven-day outage fallback and owned D1 leases/cooldowns.
- The invitation rechecks fresh GPS and the confirmed prefecture, then atomically fixes random county-wide spots (up to 512, minimum 500m separation). Spatial binning preserves mainland/island coverage, and 25-spot SQL chunks stay under D1's 100-bind limit. New summaries expose the prefecture/spot bounds, not exact leader GPS. Old radius invitations and scoring are unchanged.
- Updated GPS preparation/region labels, collapsed rule help and map overview. Typecheck, workspace build, whitespace checks and all 764 tests pass, including 94 actual SQLite integration cases. Existing mixed-import/large-chunk frontend warnings remain. Worker bundle verification measured about 1.56MB gzip; boundary data is not included in the browser bundle.
- Live verification with actual Tokyo public map data returned 36,362 walking nodes, 7,180 stored candidates and 467 generated spot positions spanning mainland to Ogasawara in 29 seconds; a second preparation reused storage without another map query. Each invitation's random count/layout may differ. Only public coordinates and :memory: SQLite were used, with no production invitation or DB writes.
- A live primary-provider empty-area inconsistency was caught and covered by a backup regression test. Production smartphone GPS/form submission and visual browser QA are not verified.
- Feature commit 9b3d709 was pushed to main with the preceding author identity. Deployment run 37869628388 succeeded, including typecheck/build, remote migration 0033, Worker and Pages deployment. Public dashboard returned HTTP 200 with index-BCnmYncb.js containing the region workflow; backend health remained online and the new unauthenticated region request returned HTTP 401. No real opponents were contacted for verification.

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
- [x] Commit/push with the preceding author identity and verify deployment (f27e7ef; main deployment succeeded).

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
## Smartphone administrator UI (2026-10-16)

### Acceptance criteria
- All 11 management sections remain reachable at 320/390/768/1280px without document-level horizontal overflow. Mobile navigation identifies the current section; desktop navigation remains visible.
- Uniform component assets and completed templates are clearly separated without discarding unsaved edits. Image import, drawing and drawing-source import remain available with unchanged validation/versioning/storage.
- Forms use readable 16px mobile inputs and touch-sized controls. Wide audit tables scroll inside labelled regions; filters and modal close/actions stay reachable.
- No API, schema, database, scoring, authentication or production data changes. Preserve preceding uncommitted local-start/QA changes. No commit/push/deployment requested this turn.

### Checklist
- [x] Read repository rules, inspect current components and reproduce the cramped 390px administrator layout.
- [x] Implement responsive shell/navigation, contained tables/forms/dialogs and clearer uniform editing workflow.
- [x] Add regression coverage and run tests, typecheck and build.
- [x] Verify actual local admin at mobile/tablet/desktop widths, capture screenshots and report remaining limitations.

### Working notes
- Presentation-only: shared Zod contracts and Hono RPC handlers remain unchanged.
- Baseline: long horizontal menu, browser-default material buttons, fixed-width summary grids and oversized table/filter rows. Local admin authentication exists; no production mutation needed for QA.
### Results
- Added a compact mobile section selector and desktop sidebar, a two-column mobile summary, labelled/keyboard-scrollable table regions with filters outside the scroll area, 16px mobile fields, 44px action controls and viewport-bounded scrolling dialogs with visible close controls.
- Separated component materials from completed templates while keeping both editors mounted; verified a synthetic unsaved material name survives switching views. Grouped all three existing image/drawing/source import methods, styled the material editor and added direct scroll/focus to opened editors. Storage, validation, publication, legacy rendering and API contracts are unchanged.
- All 824 tests in 25 files passed (13 new navigation/table/workspace checks); root typecheck and frontend production build passed. Existing mixed-import/large-bundle warnings remain.
- Actual authenticated local-admin browser QA passed 44 section/width combinations (320/390/768/1280px), with no document horizontal overflow or mobile fields below 16px. Verified the user table can scroll to fully visible rightmost actions, help bounds at 320px, material draft preservation, completed-template editing, drawing-editor opening and notification/user-edit dialog closure at 320x420. No real notification, deletion, publication or account edits were submitted.
- Physical iOS/Android keyboard behavior is not device-tested. Existing admin map background tiles display an API-key-required watermark; this separate, pre-existing provider issue was not altered or mistaken for a responsive-layout failure. Some local audit/API lists are empty; populated production data was not changed for QA.
- No commit, push or deployment performed. Earlier uncommitted local-start/QA changes remain intact; local dev servers stay available for review.
## Deliver administrator UI and repair basemap (2026-10-20)

### Acceptance criteria
- Replace the administrator-only unauthenticated CARTO tiles causing the API-key watermark, using the already-installed Leaflet/MapLibre/OpenFreeMap stack. Preserve territory overlays, filtering, popups and pan/zoom; do not modify running or battle calculations.
- Handle load failure/retry and component disposal safely, including switching tabs and responsive resizing. Preserve attribution and avoid new credentials or paid services.
- Reverify the pending responsive-admin and local-start/QA changes, then commit using the preceding author, push main without history rewriting and verify the existing Cloudflare deployment and production bundles.

### Checklist
- [x] Inspect repository rules, pending files, existing user-map integration and deployment workflow; verify provider documentation.
- [x] Repair and test the administrator basemap.
- [x] Run regression tests, typecheck/build and local visual checks.
- [x] Review/stage the approved changes and prepare normal commits/push; verify deployment and production after execution and report those results in chat.

### Working notes
- CARTO's current official documentation confirms the API-key watermark requirement. OpenFreeMap's official guide supports the Leaflet adapter already in this repository and requires no API key.
- Presentation/provider repair only: no shared schema, DB migration, identity or scoring changes required. No Cloudflare R2 activation, billing or credential expansion is needed.

### Verification before delivery
- Reproduced the API-key watermark on the existing authenticated production administrator map. Replaced administrator-only CARTO raster tiles with the existing Leaflet/MapLibre/OpenFreeMap Positron stack, simplifying building/POI clutter without changing the running map or territory overlay/filter/popup logic.
- Bundled Leaflet replaces the unowned CDN script/global. Background loading is abortable, has a 15-second failure notice and manual retry, and disposes its own listeners/layer on tab removal. A ResizeObserver keeps the canvas sized to the responsive container; attribution remains visible.
- All 837 tests in 26 files, including 13 new basemap success/failure/timeout/disposal/retry cases, passed. Root typecheck and production-equivalent Vite build passed; existing mixed-import/large-bundle warnings remain. Added tracked-line credential-pattern scan and whitespace checks passed.
- Actual local admin shows the Tokyo basemap at desktop and 390px width, with no watermark or document overflow, and survives zoom and switching tabs. Local D1/KV remain separate from production and no pending local migrations were needed. Deployment/production post-push results will be reported after execution.
## Original Studio uniform collection (2026-10-20)

### Acceptance criteria
- Add six visually distinct version-2 uniform templates: velocity, wave, sunset, contour, pinstripe and pixel motifs, with original emblems and editable colors/front-back/lettering.
- Preserve existing version-1 artwork, the original six templates, saved uniforms, uploaded assets and all run/battle data. No branded logos, image-generation dependency, external images or new storage costs.
- Additive shared-schema choices first, then additive catalog migration; use the actual template picker/admin preview rather than a separate replacement editor.
- Verify schemas, immutable old SVG output, new front/back rendering, actual SQLite seed preservation/idempotency, API listing/saving and local mobile/desktop visuals. No new commit/push/deployment requested this turn.

### Checklist
- [x] Inspect current studio schema, SVG renderer, catalog and repository rules; choose six original styles.
- [x] Implement additive shared definitions, original SVG artwork and catalog entries.
- [x] Add regression tests, run typecheck/build/tests and apply the local-only migration.
- [x] Visually verify the real local catalog/editor and present the designs for review.

### Results
- Added VECTOR EDGE, TIDAL FLOW, DUSK RUN, TERRAIN CLUB, MONO PACE and PIXEL RUSH as published v2 completed-template records in additive migration 0036. New six basic patterns/four emblems are editable bounded SVG, requiring no uploads, external assets or storage service changes.
- Migration 0036 applied to local D1 only; the real authenticated local administrator catalog lists 12 records (original six plus new six). No real saved user/team designs were edited. Browser test edits were restored, with the save button disabled again.
- All 871 tests in 28 files passed. New checks cover shared schema/metadata, front/back SVG IDs and safe output, SHA-256 equality with pre-change artwork for all three old model front/back fixtures, actual SQLite preservation/replay, catalog search and personal/team save/authorization APIs. Root and frontend typechecks passed; final Vite build passed with pre-existing bundle-size/mixed-import warnings.
- Actual 1280px catalog/editor and 390px administrator editor checked through computer-use. Back-only pattern changes, lettering, accent color and new emblems update the preview correctly. Found and fixed narrow vertical labels caused by inherited administrator flex rules; large choice sets now use a scoped grid (146×44px buttons at 390px) with no horizontal overflow.
- Added read-only local `/qa/uniform-collection.html` comparison using the actual collection/preview components, with sample back lettering clearly identified. It is not a production entry point. No production migration, commit, push or deployment performed this turn.

## Release Studio collection under standing Git authorization (2026-10-20)

- User authorizes future commits/pushes of requested project changes without asking again. This does not authorize unrelated changes, history rewriting, billing, destructive operations or broader access permissions.
- Scope: the preceding six-uniform collection only, including its tests, additive seed, documentation and read-only QA preview. Keep the preceding commit's author information.
- Verification: all 871 tests and root typecheck passed again; production-equivalent Vite build passed. The expected staged files are the collection implementation/tests/docs only, with no new credentials.
- Delivery steps: create a normal commit and push main without force; verify local/remote SHA. Check the existing automatic Cloudflare deployment and deployed bundle/catalog; report their actual post-commit status in chat without creating a bookkeeping-only redeployment.
## Per-part colors for uploaded uniform artwork (2026-10-20)

### Acceptance / invariants
- Administrators can prepare named color regions for uploaded PNG/JPEG/SVG patterns/emblems, using local color clustering plus connected fill, brush/erase and undo. Same-colored disconnected areas can be assigned different parts. Automatic regions are suggestions, not semantic AI recognition; no external image transfer/new paid service.
- Users independently recolor named parts of front/back patterns and emblems, reset to the original image, and save personal/team designs under existing permissions. Original alpha and unassigned pixels remain unchanged. Existing assets/designs without regions render unchanged.
- Store bounded 512px indexed region maps with the existing immutable source sidecar, privately retain drawing originals, expose only region maps for published versions, and reuse current KV reservations/limits. No DB schema or blanket rewrite needed.
- Model JSON describes garment geometry, not printed artwork; retain required model functionality and explain its purpose, without silently removing import/export.

### Checklist
- [x] Inspect schemas/storage/editor/renderer and choose a backward-compatible design.
- [x] Implement shared schemas/region algorithms and protected source/API persistence.
- [x] Implement administrator region editing and user palettes, preview/export and reset handling.
- [x] Test validation, same-color separation, alpha/immutable-version preservation, API permission/propagation and storage quotas; typecheck/build; actual mobile/desktop visual checks.
- [x] Review release scope and prepare a normal commit/push under standing authorization. Report the actual automatic deployment result after push, without a bookkeeping-only redeployment. No real user's saved kit or production artwork is overwritten for QA.

### Results / release checkpoint (2026-10-21)
- All 896 tests in 29 files passed; root and frontend TypeScript checks and the production-API Vite build passed. The build retains existing chunk-size/mixed-import warnings. Isolated real workerd with on-disk D1/KV passed 58 persistence/privacy/quota checks, including restart; the R2-compatible adapter also passed 58 checks earlier. External requests were disabled in both storage fixtures.
- Actual authenticated local administrator import showed named auto-regions for PNG and SVG. Saved one clearly named local-only draft `QA_部位カラー_20261021` (SVG compass, 6 regions) and verified names/map after a page reload, not just from client cache. Other user/team designs and production artwork were not changed. An expired admin session was handled with ordinary human re-login, never a forged proof.
- Actual administrator checked at 390px and 1280px: no horizontal overflow, 16px text inputs, 44px region tool buttons and an entirely in-bounds help popover. The separate in-memory QA page verified splitting initially identical blue stripes, independent front/back and emblem colors, reset and successful synthetic user saves; those fixture writes are not real user data.
- Images/maps are additive immutable revisions; old v1/v2 artwork tests remain passing. Private drawing originals are unwrapped only for administrators, never included in published map responses. Region summaries remain separate from pixel data; quota accounting remains 3 objects even with both drawing and map. No migration, new package, cloud provisioning, billing or image-AI service was introduced.
- Added the workflow/precision limits to `docs/uniform-studio.md` and a model-definition help button: model JSON is garment geometry and remains available as an optional advanced import/export, unrelated to artwork part colors.

## Production artwork save failure (2026-10-21)

### Acceptance / plan
- Identify the actual production failure before changing storage logic; preserve artwork, saved kits, quota accounting and password-issued administrator authorization.
- [x] Reproduce the production error and inspect the corresponding authentication/storage path.
- [x] Make the smallest safe repair, with actionable session recovery and retained unsaved artwork if the failure is authentication-related.
- [x] Add regression coverage; run tests, root/frontend types and build; verify the real authenticated save flow using a clearly named test-only draft, never overwrite existing artwork.
- [x] Review release scope and prepare a normal commit/push under standing authorization; report the actual production deployment result after push without a bookkeeping-only redeployment.

### Working notes
- Initial production material-library request displays the missing/invalid-administrator-proof error. General admin dashboard authentication is separate from the 12-hour password-issued material proof; another login rotates earlier proofs too. A 403 alone does not distinguish expiry from rotation.
- User performed ordinary production re-login after automatic credential entry was blocked by safety review; no workaround, token extraction or impersonation was used. After re-login, production listed the KV provider with ample capacity and accepted a full-size PNG with six color regions as private draft `QA_本番保存確認_20261021` v1. Existing artwork and saved user/team kits were not changed.
- Frontend-only repair adds an explicit recovery card at the failure location, a separate-tab login link, read-only recheck on button/storage/focus and a disabled save while proof is known invalid. The mounted form, image and region data are not reset. No new API, database migration, permissions or billing change.
- In-memory UI QA reproduced save-time 403, confirmed the same PNG/part names and metadata remained, then rechecked and saved v2 after simulated recovery. At 390px, the recovery card fit the viewport and both actions had 44px minimum height. These synthetic responses are not production authentication.

### Results / release checkpoint
- All 900 tests in 30 files passed; root/frontend typechecks and the production-API build passed. Existing bundle-size and mixed-import warnings remain unchanged.
- Regression covers an expired image save causing no KV/R2 writes or storage reservation, followed by successful persistence of the identical region-bearing payload after an isolated fresh proof. Component tests cover the separate-tab link, preserved-draft guidance, pending state and cleanup of cross-tab/focus rechecks.
- Production accepted and, after an actual page reload, returned private draft `QA_本番保存確認_20261021` v1 including its PNG and six-region map. The test draft is deliberately not published or deleted. No existing artwork, user/team kits, runtime auth policy, quotas, database schema or cloud settings changed.
