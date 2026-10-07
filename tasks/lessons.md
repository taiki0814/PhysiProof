# UI verification lessons

## Fixed dialogs inside filtered cards
- Failure mode: A fixed member-profile dialog nested under `.pp-content-card` was positioned relative to the card because the card uses `backdrop-filter`. Additional content let the close button fall behind the bottom navigation.
- Detection signal: The mobile screenshot showed the close button overlapping the navigation even though the dialog had a higher z-index; viewport-width checks alone passed.
- Prevention rule: Render viewport-level dialogs in a body portal. Verify vertical bounds and close-button visibility as well as width when adding mobile dialog content.

## Save notices during form synchronization
- Failure mode: An effect resetting a form after its revision changed also cleared the success notice immediately after save.
- Detection signal: Browser verification confirmed persistence but timed out waiting for the name/number save notice.
- Prevention rule: Separate synchronization of saved values from notice lifecycle. Verify the visible success state as well as the stored record, and retain unsaved drafts when a refresh fails.
