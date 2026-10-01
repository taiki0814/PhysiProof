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
