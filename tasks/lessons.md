# UI verification lessons

## Fixed dialogs inside filtered cards
- Failure mode: A fixed member-profile dialog nested under `.pp-content-card` was positioned relative to the card because the card uses `backdrop-filter`. Additional content let the close button fall behind the bottom navigation.
- Detection signal: The mobile screenshot showed the close button overlapping the navigation even though the dialog had a higher z-index; viewport-width checks alone passed.
- Prevention rule: Render viewport-level dialogs in a body portal. Verify vertical bounds and close-button visibility as well as width when adding mobile dialog content.
