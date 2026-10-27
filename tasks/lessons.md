# UI verification lessons

## Component fixtures versus the real administrator screen
- Failure mode: Showing a small in-memory component fixture as a development preview made it look like local and production administrator features differed. A stopped local API and unapplied migrations further obscured the comparison.
- Detection signal: The local tab was /qa/uniform-studio.html, which mounts only UniformSection/AdminUniformAssets; production uses the full AdminDashboard. Port 8787 was down and migrations 0033-0035 were pending. Production-equivalent bundle hashes matched exactly.
- Prevention rule: Give fixtures an unmistakable synthetic-data notice and an explicit link to the real app. Use the ordinary /admin route for acceptance testing, start both API/UI and apply local migrations reproducibly. Do not solve data/session differences by copying production secrets, bypassing roles or routing development writes to production.

## Card-free KV storage and real-runtime parity
- A Free KV namespace can replace inactive R2 without billing enrollment; verify product provisioning separately from OAuth success. Never finish a checkout to unblock a free-storage request.
- Reserve metered object writes and byte capacity atomically in D1 before upload, including pending/ambiguous failed writes. Commit the reservation with immutable metadata and verify concurrent last-slot uploads, lost update cleanup and no double-counting.
- Do not cache missing saved KV objects as immutable 404s: eventual propagation needs 503/no-store/retry guidance, bounded cancelable UI retries and a local authoritative preview after upload. Keep draft privacy checks before storage reads.
- Test the actual installed workerd as well as mocks: current docs allow cacheTtl 30 but this repository's older emulator enforces 60. Use the compatible 60-second provider TTL, with independent 30-second client retries.

## Real storage verification and cloud activation
- Failure mode: Passing SQLite/fake-R2 tests proves API logic but not actual Worker stream handling or R2 persistence. A successful OAuth refresh also does not mean R2 has been activated on the account.
- Detection signal: The new workerd/on-disk D1/R2 test passed upload/readback/restart checks; the real Cloudflare bucket-list API separately returned activation error 10042 after authentication succeeded.
- Prevention rule: Verify runtime persistence and provider provisioning independently. Distinguish missing permissions (10000) from a product activation/checkout requirement (10042); do not add a production binding to a nonexistent bucket or silently complete a subscription/payment step.
- Migration harness rule: D1 exec() splits on newlines. Use complete prepared statements, with SQLite parsing for multiline triggers, when applying real migrations to the local Worker test fixture.

## Versioned uniform studio integration
- Preserve old saved artwork by dispatching an explicit design version to the unchanged legacy renderer. A new renderer is not a transparent migration; conversion requires user choice and save.
- Save immutable component references and retain published versions after catalogue hiding. Draft metadata, images and editable sources need separate access checks. Test updates, concurrent uploads, hiding and resource reuse against real SQLite transactions, not just mocks.
- Protect metered storage writes with password-authenticated administrator sessions rather than the inherited test-token identity. Hash expiring tokens in D1 and recheck current roles. This does not fix the application's unrelated prototype authentication.
- Validate PNG CRCs, bounds, allowed chunks and decompressed row size at the server even after browser conversion. Store binary images/sources outside D1 and keep list responses paginated.
- Friend render() returns SVG fragments, not a complete SVG. Preserve viewBox wrappers, unique IDs and actual thumbnail dimensions. Browser QA caught integration issues that static typing cannot detect.
- On narrow screens, inspect drawing toolbars and property panes separately; page-width checks alone can miss inner clipping. Scope CSS and keep touch text inputs at least 16px.
- Treat cloud scope expansion and paid activation as separate authority checks. Ship a clearly disabled storage state, never claim R2 is connected when login or provisioning has not succeeded.

## Prefecture-wide geographic coverage and reusable map preparation
- Failure mode: Expanding an around-radius query to an entire prefecture exceeded the old 32MB Overpass reservation; an HTTP 200 runtime remark was not a usable complete map. Keeping only the first N ways/points would also bias coverage toward one part of the prefecture.
- Detection signal: Bounded live Tokyo probes returned an out-of-memory/timeout remark, while the revised area-scoped public-way node query successfully covered both the mainland and detached islands.
- Prevention rule: Resolve fresh leader GPS against pinned, attributed administrative polygons (not nearest capitals or only bounding boxes). Prepare and persist spatially compacted public-node candidates independently of invitations, preserve every occupied geographic bin instead of prefix truncation, clip to the prefecture and fix random positions at invitation time. Do not add a territory cap or change scoring while changing placement scope.
- Operational rule: Use owned D1 leases/cooldowns across Worker instances; never clear another request's lease after losing ownership. Bound marker count, catalogue JSON, query parameters and decoded coastline memory. Index ring edges by latitude rather than scanning whole coastlines for every walking-path node.
- Provider consistency rule: A complete HTTP 200 with an empty primary area index can disagree with the backup even for Tokyo. Try the bounded backup before reporting no public candidates; reject partial remarks and never persist an empty catalogue. Only matching empty successes from both providers justify the no-candidate error.
- Privacy/compatibility rule: New summaries expose prefecture and saved spot bounds, not the creating leader's exact GPS. Additive scope metadata keeps old radius invitations unchanged. Reacquire GPS at submission and refuse a changed prefecture rather than silently switching the confirmed region.

## Fixed dialogs inside filtered cards
- Failure mode: A fixed member-profile dialog nested under `.pp-content-card` was positioned relative to the card because the card uses `backdrop-filter`. Additional content let the close button fall behind the bottom navigation.
- Detection signal: The mobile screenshot showed the close button overlapping the navigation even though the dialog had a higher z-index; viewport-width checks alone passed.
- Prevention rule: Render viewport-level dialogs in a body portal. Verify vertical bounds and close-button visibility as well as width when adding mobile dialog content.

## Save notices during form synchronization
- Failure mode: An effect resetting a form after its revision changed also cleared the success notice immediately after save.
- Detection signal: Browser verification confirmed persistence but timed out waiting for the name/number save notice.
- Prevention rule: Separate synchronization of saved values from notice lifecycle. Verify the visible success state as well as the stored record, and retain unsaved drafts when a refresh fails.

## Icon consistency and responsive verification
- Failure mode: Mixed platform emoji in navigation/actions used different visual weights and colors; an icon-only bell also lacked a useful accessible name.
- Detection signal: User feedback described a cheap-looking UI; before/after mobile screenshots showed the inconsistent navigation symbols.
- Prevention rule: Use a shared SVG icon family with a stable stroke/grid/currentColor, retain visible labels and add accessible names to icon-only controls. Translate only explicit icon metadata, never user/AI text or personal avatar art.
- Verification rule: Bound the viewport of intentionally scrolling menus and prove their controls are reachable; do not mistake clipped scroll children for document overflow. Use fixture data with the actual API field names.
- Metadata lookup rule: Whitelist own keys when translating string metadata with an object map. Names like constructor or __proto__ must use the safe fallback; SSR regression tests cover these inputs.

## Time-based battle scoring and atomic capture
- Failure mode: Integrating unsorted or individually processed same-second ownership changes can award temporary merge area; clipping only the evaluation time can still include a start event while the battle has not started.
- Detection signal: Independent holding tests failed before-start and same-server-second cases. Real SQLite route tests also exercised duplicate completed-session claims and capture rejection after defender changes were prepared.
- Prevention rule: Filter the original timestamps to the accepted start-inclusive/end-exclusive window and current server time, then sum signed deltas at the ledger's server-second precision before integrating only positive baseline growth. Earned area-time is cumulative and never decreases after loss; repeated reads do not write, and evaluation clamps at battle end. Normalize by the fixed full duration, not elapsed time.
- Capture rule: Validate before mutation, and put the unique completed-run claim, defender changes, winner changes and their automatic ledger writes in one transaction. Emit notifications only after commit. Test real migrations and SQLite rollback, including concurrent requests that both pass the initial precheck.
- Compatibility rule: Snapshot the rule version and all coefficients for new invitations. Additive migrations preserve old invitations/results; do not silently switch an ongoing battle to a new rule.

## Public walking-map dependency during battle invitations
- Failure mode: A single overloaded public Overpass service failed with 504 before an otherwise-valid spot-enabled invitation could be saved. Downloading every walking way also included thousands of paths that the explicit-public-access policy would discard.
- Detection signal: The user saw the spot map retrieval error; the original live public-park query returned a dispatcher timeout, while a filtered query on the alternate public instance returned 200 and about 94KB of data.
- Prevention rule: Apply the same public-access filter before output, bound sequential provider attempts, identify the app, respect 406/429 and Retry-After, coalesce identical in-flight lookups, and retain a bounded last-success map separately from cooldown entries. An HTTP 200 with a runtime remark is a partial/error result, not a valid empty map. Optional cache corruption/outage must not turn successful map retrieval into a failed invitation.
- Safety/verification rule: Never invent spot coordinates, silently remove enabled spots or save a partial invitation. Preserve fixed placement after creation. Test failure/fallback/recent-map expiry with real route/SQLite saving, and separately run the actual generator against public coordinates without contacting real opponents or changing production DB data.
## Administrator mobile layouts and independent scroll regions
- Failure mode: A desktop-only horizontal menu hid management sections, default material controls were too small, and fixed minimum grid widths expanded mobile cards. Pinning a wide identity column can also cover the action column after scrolling on a narrow phone.
- Detection signal: The actual local admin at 390px showed native white buttons and an off-screen active menu. A populated user table at 320/390px needed its full rightmost 230px action cell exposed, not just a document-width assertion.
- Prevention rule: Use one section registry for mobile selection and desktop navigation; contain table scrolling separately from filters, and disable pinned columns on narrow screens. Verify action bounds, short-height modal close controls, help bounds and 16px inputs as well as page overflow. Keep independent editors mounted when changing their visibility to preserve drafts; verify with synthetic unsaved input.
- Scope rule: Record an existing external map-provider error separately from UI layout validation; do not claim the map is functional merely because its container fits the viewport.
## Basemap HTTP success is not visual success
- Failure mode: The administrator-only CARTO raster source continued returning tile images, but those images contained an API-key-required watermark. The normal running map already used a separate, working provider, so changing general map configuration would not repair the administrator map.
- Detection signal: Authenticated production visual QA reproduced the watermark; CARTO's current official basemap page confirmed the key requirement. A plain HTTP success check would have missed it.
- Prevention rule: Verify the exact map component/provider and inspect actual rendered tiles, overlays and attribution. Use the already-installed key-free provider when appropriate, handle background failure/retry explicitly, and abort/dispose map initialization when tabs unmount. Keep terrain/ownership/scoring logic out of a background-provider repair.
## 2026-10-20 — Check expanded choice sets in their real parent layout
- Adding many short choices can expose inherited flex/overflow-wrap rules that were harmless with only a few choices. The administrator's `flex: 1` plus anywhere wrapping compressed Japanese pattern labels into tall single-character columns.
- Verify the actual authenticated administrator and user contexts, not only an isolated preview. For large choice sets, use a component-scoped responsive grid with sufficient specificity; confirm computed geometry and screenshots at a real 390px viewport. Restore unsaved QA changes and reset viewport overrides afterward.

## 2026-10-21 — Verify live color state and canvas save boundaries
- A browser color input can visibly change while a change-only handler has not committed the value. Verify that the actual preview and dirty/save state change, not just the input's DOM value; use live input plus committed change handling for per-part color pickers.
- Disabling a fieldset does not disable canvas pointer handlers. Explicitly guard canvas edits during conversion/save, cancel pending animation frames on unmount/stroke end, and prevent saving before asynchronous auto-region work finishes. Keep cancellation/undo consistent with the controlled region value.
- Region extraction from a sparse transparent image must not assume a regular subsample contains an opaque pixel. Fall back to a bounded opaque-pixel scan before classifying an image as empty.
- Never bypass an expired administrator proof to complete UI QA. Retain the real form draft, request ordinary re-login, and separately label synthetic in-memory tests and isolated workerd persistence checks.

## 2026-10-21 — General admin access does not prove material-save authorization
- Failure mode: The general dashboard stayed accessible after the separate password-issued artwork proof expired/rotated. Material creation was enabled before the protected catalogue loaded, and a save-time 403 appeared far above a long image/region editor without a recovery action.
- Detection signal: Production catalogue access returned the administrator-session error; ordinary human re-login restored catalogue access and a full-size PNG plus 512px region map saved successfully. Capacity/provider failure was not reproduced. A 403 alone does not distinguish expiry from another login rotating the proof.
- Prevention rule: Gate new material creation on a successfully authorized catalogue, surface re-login/recheck beside the failed save, preserve the mounted draft, and recheck after cross-tab login/focus without copying tokens or submitting automatically. Test no storage reservation/write on rejected proof, then the identical payload after a fresh isolated proof; never weaken expiry or grant new roles to resolve UI QA.

## 2026-10-21 — Bound embedded checkboxes against administrator input styles
- Failure mode: The administrator's full-width input selector overrode the region checkbox width. The checkbox element occupied the whole 411px label, pushing the anonymous text into a one-character column and inflating the row to 480px.
- Detection signal: User screenshot plus real-parent computed geometry reproduced a 411px-wide checkbox and 480px label. Checking overall page width and upper editing controls had not detected this inner flex overflow.
- Prevention rule: Give embedded checkbox labels an explicit fixed control column and a minmax(0,1fr) text span; bound checkbox min/max dimensions with component-scoped specificity. Verify the label text, click target and row height at the editor footer, not only the main form/header. Check label-text clicking and restore the original overlay state without saving artwork.

## 2026-10-22 — Privacy needs authenticated identity, not only hidden controls
- Failure mode: An arbitrary UID/unsigned JWT was sufficient for protected routes; adding a friend-only history endpoint with that identity would allow impersonation. Existing admin responses also included stored passwords.
- Prevention: Before shipping restricted location history, replace the identity boundary with password-issued hashed opaque sessions, migrate passwords incrementally, remove password disclosure, and test guessed IDs, expired sessions, pending/one-way friends, unfriend and private settings against actual SQL. Never turn a UI test into a real-account authentication bypass.
- Actual mobile QA also found the map HUD crossing the existing profile modal. Render account settings through a high-z-index portal, trap focus and verify the real map parent, not just a settings-only fixture.
- Production verification found Cloudflare delivers a weak `W/` ETag even though the Worker generated a strong tag. Exact header equality caused repeated 200 responses, so conditional GET must compare weak/strong representation tags correctly and accept a tag list. Test the deployed headers and 304, not only a local strong-tag fixture.

## 2026-10-23 — Passage trends and measured steps must mean what they claim
- A run-start histogram cannot answer when people pass a particular public place. Record consented passage time in registered coarse areas; do not infer historical routes from territories or imply an app-only sample measures actual public crowd occupancy.
- A calorie/distance-derived number is not a measured step count. Unsupported browsers must say unmeasured; Android OS sensor readings and server-plausible movement are separate totals. A client source label is not hardware attestation.
- Consent must be separate, default off and snapshotted at run start. Use a consent epoch to prevent an ongoing pre-consent run from being reattached after same-timestamp opt-in or off/on. Check consent and completion inside the atomic write, not just before it.
- GPS recovery must not credit displacement from a previously stale/future fix. Test races against normal finish, opt-out and replay. Android compilation, synthetic UI and physical-device walking/background verification are distinct evidence levels; report each honestly.

## 2026-10-27 — Verify source separation and full API snapshots
- Failure mode: Adding a battle setting to inserts/schema but omitting it from the explicit list SELECT made a persisted value disappear in the UI. Test the complete create/list/read path, not just the database row. Migration fixtures must apply all current migrations by default instead of pinning a stale latest filename.
- Detection signal: Isolated real-SQL tests caught both the missing field and a new migration causing a hardcoded latest-file assertion to fail. Use explicit old versions only in upgrade tests and check foreign keys after all current migrations.
- Health imports must never enter game session/territory/reward tables. Verify unchanged game rows even after large imports; use independent owner-only storage, explicit consent, revision plus per-operation nonce, all-or-nothing replacement and withdrawal/replay/race tests. Metadata is not device attestation.
- Older Hono body-limit wraps overflow as malformed JSON before its error detector sees it. Bound streamed bytes before the JSON validator and test actual oversized streamed requests, not just Content-Length. Keep health error responses generic.
- Native browser confirm dialogs can block automated IAB inspection without appearing to the human. Prefer an explicit accessible in-page two-step deletion confirmation for new controls. Recover with a fresh temporary tab; never dismiss unknown security dialogs or modify real permissions/health data just to finish QA.
