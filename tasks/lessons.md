# UI verification lessons

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
