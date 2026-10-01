# Team Battles implementation plan

## Working notes
- Keep team membership singular; one battle can include the host and multiple opposing teams without adding multi-team membership.
- A battle owns its date window and score. Historical activities are excluded.
- Only live, individually submitted and validated exercise records can add score; bulk/offline sync must not.
- The current push-up endpoint is the verified real-time ingestion path. Initial score assumption: one valid repetition = one battle point.
- Do not normalize scores by team size; teams choose opponents with that trade-off in mind.

## Checklist
- [x] Define shared battle schemas and export them.
- [x] Add D1 migration for battle invitations, accepted rosters, and per-session contributions.
- [x] Add authenticated team battle APIs and real-time-only point accounting.
- [x] Add the team battle interface to the team screen.
- [x] Extend the shared contract, D1 participants, APIs, and UI for multi-team battles.
- [x] Verify with typecheck/tests/build, apply only local D1 migrations, and inspect the resulting diff.

## Acceptance criteria
- Owners can challenge one or more teams for a shared start/end window.
- Each invited team's owner can accept or reject; any rejection ends the event, and all invitations must be accepted before it starts.
- The host roster is captured when creating the event; each invited roster is captured when its owner accepts.
- Only verified `/pushups` records received by the server inside the battle window add points; `/pushups/bulk` never adds points.
- Previous exercise history never contributes; repeated requests cannot double-count a nonce.
- Every participant team's raw accumulated score and invitation state are visible; no team-size adjustment is applied.

## Results
- Added the initial two-team challenge, accept/reject, roster snapshot, score history, and team-tab panel.
- Realtime points are sourced from the single-record verified push-up endpoint; bulk/offline sync and historical records do not contribute.
- Added a participant table in migration `0025`, backfilled existing two-team events, and kept legacy battle columns for compatibility.
- All invitees must accept; any rejection cancels the event. Rosters are captured at the host's creation and each invitee's acceptance.
- The UI supports selecting up to 50 opposing teams and displays raw scores without team-size normalization.
- Typecheck, 12 Vitest tests, build, `git diff --check`, and local API smoke checks passed. Local migration `0025` was applied; remote D1, deployment, and commit were untouched.
