# UI verification lessons

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
