# nksha UI and UX overhaul brief

## Purpose

This document is the implementation brief for a complete UI and UX overhaul of nksha. The worker may change layouts, navigation, component structure, route composition, visual styling, and interaction patterns. Preserve the product's domain rules, imported data, and local-first architecture.

The result should feel like a personal atlas that someone wants to revisit, not a set of database tools placed beside a map.

## Non-negotiable repository rules

Read `AGENTS.md`, `CONTEXT.md`, and the ADRs before editing code.

- Do not add network calls. The existing permitted map-tile behavior remains the only exception. Do not add analytics, remote fonts, remote images, geocoding, telemetry, or hosted icon services.
- Do not add a dependency unless a linked GitHub issue explains why the platform APIs and current packages cannot do the job.
- Do not use real location history in fixtures, screenshots, tests, or examples. Use clearly synthetic places and coordinates.
- Do not weaken the import, archive, privacy, accessibility, bundle-budget, or no-egress checks.
- Do not change the meanings of Visit, Place, Trip, Home, Movement, Import, or Archive from `CONTEXT.md`.
- Do not hide or remove AI-assistance disclosures. All final work must land through a human-reviewed PR with DCO-signed commits.

## Product direction

### The product promise

Use this sentence to settle design choices:

> nksha turns private location history into a personal atlas you can explore, understand, and replay without sending it anywhere.

Every primary screen should answer one of these questions:

1. Where have I been?
2. What story does this period tell?
3. What patterns are hidden in my history?

Import, backup, map style, and data maintenance support those questions. They must not compete with them in the main navigation.

### Design character

Aim for a modern editorial atlas with restrained cartographic detail.

- Warm paper and ink in light mode.
- Midnight blue, parchment, and amber in dark mode.
- Large maps and clear data, with quiet chrome around them.
- A serif display face from the local system stack for names and story moments. Use the system sans stack for controls and dense data.
- Fine contour lines, route traces, coordinate ticks, and map labels as useful motifs. Do not cover every card with a texture.
- Use color to encode meaning, not to decorate every surface.
- Prefer fewer, larger surfaces over many small bordered cards.
- Avoid dashboard-template styling, glass everywhere, excessive pills, tiny uppercase labels, and rows of equal-looking actions.

The current brand mark and the idea of "personal cartography" are worth keeping. Refine them instead of replacing the identity with a generic travel app.

## Problems in the current experience

The current implementation has a sound feature set, but its structure makes the user do too much interpretation.

- Seven routes have similar visual weight. Explore, Story, Dashboard, Heatmap, Trips, Import, and Settings look like separate products.
- The map is the strongest part of nksha, but Heatmap and Playback create separate map worlds with different controls.
- Important setup tasks are scattered. Home is set from a map pin or Trips, import is another route, and backup is under Settings.
- The first-run page explains privacy well but asks the user to understand Google Takeout before showing a convincing product story.
- Many pages are stacks of same-size bordered cards. The hierarchy between the main result, supporting context, and maintenance actions is weak.
- Controls are hand-styled in each route. Button heights, radii, labels, confirmation patterns, and feedback vary.
- Small text is overused. `text-xs`, 10 px labels, and compact pills make the app feel dense even when there is little content.
- Map overlays can compete for the same space. Search, result panels, year chips, summaries, detail cards, notices, and mobile navigation all sit above the map.
- Dashboard data is useful but visually flat. It reads as a list of calculations rather than a story about the user's life.
- Trips mixes prerequisites, inference, manual creation, editing, and the trip list in one continuous form.
- Playback exposes range presets, chapters, scrubber, speed, dates, follow mode, stats, and export in one control area. The story gets buried under controls.
- Empty states often repeat "import first" but do not guide the user through one shared setup flow.
- Settings exposes a custom style URL as a normal user preference. This is an advanced and potentially confusing control.
- Some semantic patterns need cleanup. Do not nest a `button` inside a `Link`. Dialog-like overlays need complete focus handling and Escape behavior.

## New information architecture

Reduce the primary product navigation to three destinations.

### 1. Atlas

This is the default and main screen. It combines the current Explore map and Heatmap.

- Map and place browsing
- Search
- Time filtering
- Visits and place details
- Standard pins or dwell-heat layer toggle
- A useful no-map list view

### 2. Stories

This combines Trips and Playback around the idea of a time-bounded story.

- Story and trip library
- Suggested trips awaiting review
- Manual story creation
- Story detail
- Playback
- Video export

Use `Trip` in data and domain copy where the object is a Trip. Use "Stories" only for the product destination that helps users view and replay Trips.

### 3. Insights

This contains the current dashboard and connects each result back to the Atlas.

- Year summary
- Time away from Home
- Top places
- Distance by movement mode
- Countries
- Calendar or month patterns
- Farthest place

### Utilities

Place Import and Settings in a utility area, not in the primary navigation.

- Desktop: a compact utility group at the bottom of a left rail, or at the right side of a top bar if the viewport cannot support a rail.
- Mobile: an avatar-free "More" sheet opened from the header. Do not add a fake user profile.
- Keep Import easy to find. After data exists, show it as "Add timeline data" in context and "Import" in utilities.
- Surface Archive backup status where it matters. Do not require users to remember that it exists in Settings.

Route compatibility matters. Existing URLs should redirect or continue to work:

- `/` stays Atlas.
- `/heatmap` may redirect to `/?layer=heat`.
- `/trips` becomes the Stories library.
- `/playback` may remain as a playback route or become a child of a selected Trip.
- `/dashboard` remains Insights.
- `/import` and `/settings` remain directly addressable.

## App shell

### Desktop

Use a slim left navigation rail on wide screens. It gives the map more vertical space and makes the three main destinations easy to scan.

- Width near 72 px when collapsed and 216 to 240 px when expanded.
- Brand at the top.
- Atlas, Stories, and Insights as icon plus label items.
- Import and Settings near the bottom.
- A small local-data status near the bottom, such as "Stored on this device". It must be factual and must not imply cloud sync.
- Keep the selected state obvious through shape, text weight, and color. Do not rely on color alone.
- Allow the rail to collapse, but persist the choice only locally.

At medium widths, use a compact icon rail. At mobile widths, use a bottom bar with Atlas, Stories, and Insights. Put Import and Settings in the header's More sheet.

### Mobile

- Respect safe-area insets at the top and bottom.
- Keep bottom navigation to three destinations. Four equal tabs plus a separate menu is too much for this product.
- Use a 48 px minimum touch target for important controls and 44 px as the absolute minimum.
- Present details and filters as bottom sheets that can expand to nearly full height.
- A sheet must have a visible title, close button, sensible initial focus, Escape support when a keyboard exists, and restored focus after close.
- Only one major sheet can be open at a time.
- Never let map controls sit behind the bottom navigation or a sheet handle.

### Page headers

Non-map pages use one standard header pattern:

- Eyebrow only when it provides real context.
- One clear `h1`.
- One short explanatory sentence when needed.
- One primary page action at most.
- Secondary actions go in an overflow menu or lower on the page.

## Visual system

### Design tokens

Replace one-off route styling with named tokens in `src/index.css`. Keep tokens semantic so light and dark themes stay aligned.

Add or refine tokens for:

- Canvas, raised surface, sunken surface, and map-overlay surface
- Primary text, secondary text, and disabled text
- Brand accent, positive, warning, destructive, and information states
- Hairline border and strong border
- Small, medium, and large radii
- Low, medium, and overlay shadows
- Standard content widths
- Header, rail, bottom-nav, and sheet dimensions
- Motion durations and easing

Test contrast with the actual computed colors. Target WCAG 2.2 AA. Normal text needs at least 4.5:1 contrast. Large text and meaningful non-text UI need at least 3:1.

### Type scale

Stop using 10 px text for meaningful information.

- Display: 40 to 56 px on large story moments, responsive on mobile.
- Page title: 28 to 36 px.
- Section title: 18 to 22 px.
- Body: 15 to 17 px with a comfortable line height.
- Supporting text: 13 to 14 px.
- 12 px is reserved for short metadata. Do not put instructions, error details, or essential values below 13 px.
- Use tabular numbers for dates, durations, distances, and counts.

### Spacing and shape

Use a four-pixel spacing base and a restrained radius scale.

- Prefer 16, 24, and 32 px gaps for page structure.
- Prefer 8 to 12 px gaps inside compact controls.
- Use a 12 px card radius and a 16 to 20 px sheet radius.
- Do not make every control a pill. Pills are for filters, tags, and compact state only.
- Reduce visible borders. Use spacing and surface tone to group content. Reserve strong borders for input, selection, and separation over maps.

### Elevation

Use three levels only.

1. Page surface with no shadow.
2. Raised card or toolbar with a soft low shadow.
3. Popover, menu, dialog, or map sheet with an overlay shadow.

Avoid stacking translucent surfaces over one another. `backdrop-filter` should be a small enhancement, not the only way text stays readable.

### Icons

Continue with Lucide and the inline brand mark.

- Use one icon size per control class.
- Pair unfamiliar icons with text.
- Tooltips must not carry information that keyboard and touch users cannot get.
- Do not use emoji as functional icons. Replace the text close glyph in `VisitDetailCard` with the existing Lucide `X`.

### Motion

Motion should explain change.

- 120 to 180 ms for hover and pressed states.
- 180 to 240 ms for sheets and panels.
- 300 to 600 ms for intentional map camera moves.
- Avoid scale-on-hover for large surfaces and avoid decorative looping animation.
- Keep the existing reduced-motion override and test it. Map camera transitions should also respect reduced motion where possible.

## Shared component work

Create a small, coherent set of primitives using the current stack. Do not add a UI framework just for this overhaul.

Required primitives:

- `Button` with primary, secondary, outline, ghost, and destructive variants; small, default, large, and icon sizes; loading state; optional leading or trailing icon.
- `IconButton` with required accessible label and tooltip behavior for pointer users.
- `Card` with default, interactive, selected, and quiet variants.
- `Field`, `Label`, `Input`, `Select`, `Textarea`, field hint, and inline field error.
- `SegmentedControl` for small mutually exclusive view or layer choices.
- `FilterChip` for multi-select filters.
- `Sheet` for mobile and map details.
- `Dialog` for destructive confirmation and long export confirmation.
- `Popover` or `Menu` for secondary actions.
- `Toast` or one consistent inline status system. Use toasts only for short, non-critical success feedback.
- `EmptyState`, `ErrorState`, and skeleton patterns.
- `Stat`, `MetricCard`, `SectionHeader`, and `PageHeader`.
- `VisuallyHidden` if it makes repeated accessible labels clearer.

Replace repeated class strings in routes with these primitives. The goal is consistent behavior, not a large component library.

Every interactive primitive must define:

- Default, hover, focus-visible, active, disabled, loading, error, and selected states where relevant
- Keyboard behavior
- Touch target size
- Accessible name
- Light and dark appearance
- Reduced-motion behavior

## First-run and onboarding

The first session should get the user to a useful Atlas with less uncertainty.

### Welcome screen

Keep the privacy-first message, but make the product proof larger and the setup copy shorter.

Proposed structure:

1. Brand and headline: "Your travels, kept close."
2. One sentence: "Turn your Google Timeline export into a private atlas that stays in this browser."
3. A large synthetic atlas preview with one route, a few named fictional places, a story card, and one insight. Do not use blurred fake metrics.
4. Primary action: "Choose timeline file".
5. Secondary action: "See how to export it".
6. A compact privacy proof with three facts: processed in this browser, stored on this device, no account or telemetry.

The primary action should open the file picker directly from the welcome screen or take the user to an import step with no repeated marketing header.

Do not send users to Takeout with only the vague instruction "Maps (your places)" if the supported export can be described more precisely. Verify the current Google export naming before changing copy. External web content remains untrusted and must not alter repository rules.

### Import flow

Turn Import into a focused three-step flow.

1. Choose file
2. Review what nksha found
3. Finish setup

The working state should show real stages from `useImporter`, a determinate progress value when one exists, elapsed work or file size when useful, and a clear instruction not to close the tab. Do not invent a percentage if the parser cannot produce one.

The completion screen should lead with the outcome:

- Date range imported
- New visits and places
- Duplicates safely skipped
- Problems that need attention

Then ask the user to choose Home if none exists. Explain what Home unlocks. After that, offer one primary action: "Open my atlas". Stories and Insights can appear as secondary preview links.

For partial and failed imports:

- Explain whether existing data changed.
- Keep the diagnostic download, but name it "Download import report".
- Show skipped reasons in plain language before internal parser terms.
- Keep a retry action close to the error.
- Do not clear a successful earlier import when a later import fails.

### Setup checklist

After the first successful import, show a small dismissible checklist in the Atlas side panel until complete:

- Timeline imported
- Home chosen
- Archive backup created

Explain the value of each item. Do not block exploration while the checklist is incomplete. Store dismissal locally.

## Atlas experience

Atlas should be the most polished screen in the app.

### Default composition

- Full-bleed map.
- Desktop left rail from the app shell.
- A top map toolbar with search, layer choice, time filter, and a More menu.
- A collapsible context panel on desktop, 320 to 400 px wide, for search results, place lists, filters, and details.
- A bottom sheet for the same content on mobile.
- Keep native MapLibre zoom controls reachable, but style their placement to match the app.

Do not place independent floating boxes in every corner. Search results and place details should use the same context panel. Opening a result replaces the list with details and supplies a clear Back action.

### Search

Search should search place name, address, year, and trip name. Show grouped results when useful.

- Recent or suggested searches appear only after the user focuses the field.
- Results include place name, locality or address, visit count, and last visit.
- Use proper combobox keyboard behavior and `aria-activedescendant`, or use a simpler list of links if full combobox behavior is not implemented correctly.
- Do not close results on `blur` before click handling finishes.
- Show active search as a removable filter after the result panel closes.
- "No results" must leave a one-click path to clear filters.

### Layers

Use one segmented control:

- Places
- Dwell heat

Heat becomes an Atlas layer, not a separate product destination. Preserve the current heat-weight logic and date/intensity controls. Put detailed controls in a Filters sheet or panel. Keep the visible legend beside the map.

### Time control

Replace the long row of every year with a compact range control.

- Default: All time
- Quick options: This year and recent years
- Custom date range
- A horizontal year strip is acceptable only when there are few years.
- Active time range should remain visible in the toolbar.
- Provide "Clear" or "All time" without horizontal scrolling.

The worker should preserve deep links such as `?month=YYYY-MM` or migrate them with tests.

### Place detail

The Place is the main object. A selected Visit is one part of its history.

Place detail should show:

- Place name, address, Home status, and edit action
- Visit count and total time
- First and most recent Visit
- A reverse-chronological visit history with expandable rows
- Related Trips
- Actions: rename, set or change Home, and play visits around this Place when supported

Use an inline edit or a small dialog for rename. Give Home a clear icon and explanation. If changing Home replaces an existing Home, confirm the effect in plain language.

### Place list

The no-map list is a first-class accessibility and browsing mode, not a hidden fallback.

- Sort by most recent, most visited, longest time, or name.
- Filter by year or Trip.
- Show the same selection and detail model as the map.
- Do not call it "no-map browsing" in user copy. Call it "List".

### Offline map state

When tiles fail, keep Places usable through the list and detail panel.

- Show one persistent but unobtrusive banner: "Map tiles are unavailable. Your saved places are still here."
- Provide "Open list" and "Retry map" actions.
- Do not imply that imported data failed or disappeared.

### Surprise action

Keep "Surprise me" as a delightful secondary action, but label it in the More menu or context panel. A dice icon alone is too obscure for a central toolbar.

## Stories experience

### Library

The Stories landing page should be visual and chronological.

- Hero card for the most recent or selected Trip.
- Year groups with Trip cards.
- Each Trip card shows name, date range, duration, visit count, a small synthetic-safe map preview generated from local data, and provenance.
- Use "Suggested" and "Created by you" instead of "auto-suggested" and "yours".
- Suggested Trips need clear Accept, Edit, and Dismiss actions. Do not treat an inferred Trip exactly like a confirmed user Trip.
- Search and filter by year.
- Put "Create trip" in a button that opens a focused form or sheet. Do not keep the creation form permanently above the library.

### Prerequisites

When Home is missing, show one concise setup card with an embedded searchable Home picker. After selection, run inference and replace the setup card with the result. Do not make users go back to the map.

When there are no Visits, show the shared Import empty state. When Visits exist but no Trips match, explain manual creation without suggesting that import is still missing.

### Create and edit Trip

- Name is optional and the UI should say how the default name will be chosen.
- Date fields show a live duration and Visit count.
- Show overlap errors beside the date range before submission when possible.
- Use one date-range field group, not two disconnected controls.
- On mobile, open native date inputs or the current platform picker. Do not add a date-picker dependency without an issue.
- Destructive deletion uses a Dialog with the Trip name and a direct consequence statement.
- Dismissing a suggestion and deleting a confirmed Trip are different actions and need different copy.

### Story detail

Selecting a Trip should open a dedicated detail page or panel before playback.

- Large title and date range
- Route preview
- Summary: days, Visits, Places, distance when present
- Ordered Place timeline
- Rename and date-edit actions
- Primary action: "Play story"
- Secondary action: "Export video"

This gives users a reason to care about a Trip before entering the playback controls.

## Playback experience

Playback should feel cinematic at first and controllable after that.

### Entry

Keep the title-card idea. Improve it with the Trip name, date range, Place count, and a small privacy-safe local map preview. Use "Play story" instead of "Begin the trip" when the selected range may span many Trips.

### Controls

Use a two-level control model.

Always visible:

- Play or pause
- Large scrubber with current date
- Current Place or movement state
- Time remaining or end date
- Exit or Back to Story

Secondary controls in an expandable panel:

- Playback speed
- Follow movement
- Custom range
- Chapters
- Export

Keep desktop controls in a centered bottom transport. Use a bottom sheet on mobile. Avoid wrapping many tiny controls into unpredictable rows.

### Timeline and chapters

- Put event marks on the scrubber for major arrivals if this stays readable.
- Highlight the current chapter.
- Selecting a chapter must update the map, scrubber, date, and announcement together.
- Announce play and pause state to assistive technology without announcing every animation frame.
- Keyboard: Space toggles play when focus is not in an input, Left and Right step by a documented interval, Home and End go to bounds. Do not override browser shortcuts outside the playback screen.

### Export

Move Export out of the main transport.

- Explain resolution, estimated duration, and rough workload before export.
- Long-export confirmation must be a real modal Dialog with focus trapping and restoration.
- Show progress with a progress element and numeric frames or percentage.
- Keep Cancel available.
- Explain browser capability failures and give a next step.
- Never imply that export uses a server.

## Insights experience

Insights needs hierarchy and narrative, not more cards.

### Overview

Start with a year selector and an editorial summary. Default to the most recent year with enough data, while preserving an All time view.

Proposed order:

1. Year or All time selector
2. A sentence-led summary with the strongest two or three facts
3. Hero metric pair, such as days away and distance travelled
4. Time pattern visualization
5. Top Places ranking
6. Movement modes
7. Countries and farthest Place

Do not put every statistic in an identical bordered box.

### Data visualization

Use CSS, SVG, and existing browser APIs. Do not add a chart package without a linked issue.

- Top Places: horizontal bars with rank, duration, and Visit count.
- Movement: proportional bars or a compact ring only if labels remain readable.
- Months: a 12-column strip with full month labels where space allows. Color intensity needs a text or pattern alternative and a visible legend.
- Countries: a clean list or chips ordered by first visit, frequency, or name. Explain manual entries without exposing ISO codes as the main task.
- Farthest Place: show distance and link to focus it in Atlas.

Every chart needs a text equivalent or accessible table. Do not rely on hover for values. Every data block should link to the relevant Atlas filter where that action makes sense.

### Home

If Home is missing, provide the searchable Home picker directly in Insights. Do not tell the user to hunt for a map pin. After Home is set, reveal Home-dependent results without a page reload.

### Empty preview

Remove blurred sample numbers. They look like hidden user data and do not explain the product. Use an illustrated synthetic example clearly labelled "Example", or use a compact list of questions Insights will answer.

## Settings and data care

Divide Settings into clear groups.

### Appearance

- Light, Dark, and System theme choices with visual previews.
- Separate app theme from map style if they can differ. If they cannot, say that clearly.
- Show the built-in map choices as preview tiles instead of a plain select.
- Move Custom MapLibre style URL into an Advanced disclosure. Explain that it can contact the configured host and may affect privacy. Preserve no-egress and allowlist rules.
- Rename "Reset to default" to "Discard changes" when it only resets an unsaved draft. "Reset to default" means something different.

### My data

- Show counts and the date of the most recent Import.
- Explain that browser storage can be cleared by the browser or operating system.
- Primary action: "Download Archive backup".
- Secondary action: "Restore Archive".
- Before restore, preview counts and clarify that restore merges and does not delete current data.
- After restore, link to Atlas.

### Privacy

Create a short, readable privacy section:

- Timeline records stay in this browser.
- The app has no account and no telemetry.
- Basemap tiles come from the configured tile provider.
- A custom style may contact its host.

Do not repeat the same privacy paragraph at the bottom of every page. Use a consistent privacy indicator and put the full explanation here and during import.

### Destructive data controls

If a future or existing control clears local data, place it in a separate danger area. Require the user to confirm the exact effect. Never combine clear-data behavior with Archive restore.

## Copy guidelines

Use plain, calm language. The app handles sensitive personal history, so trust comes from precision.

- Say "stored in this browser" rather than the broader "stays on this device" when browser storage is the exact mechanism.
- Say "Import" for the domain action. Use "Choose file" for the control that opens a picker.
- Say "Archive backup" on first mention, then "Archive".
- Use "Home" only for the declared Place object.
- Use sentence case for headings and buttons.
- Use active voice.
- Avoid unexplained technical terms such as MapLibre, GeoJSON, ISO A3, parser, and inference in main flows.
- Do not use internal issue references in user-facing copy.
- Avoid ellipses in button labels unless the action opens a system picker or needs more user input.
- Error messages say what happened, whether data changed, and what the user can do next.
- Success messages say what changed. Do not use vague copy such as "Done".

Preferred examples:

| Current or weak copy | Preferred copy |
| --- | --- |
| Import your timeline | Choose your timeline file |
| View your map | Open my atlas |
| Re-run suggestions | Find trips again |
| auto-suggested | Suggested |
| yours | Created by you |
| Add manually | Add country |
| Reset to default | Discard changes |
| Export my data | Download Archive backup |
| Nothing to play back yet | Choose a Trip or import timeline data to play a story |

## Accessibility requirements

Meet WCAG 2.2 AA as a release requirement, not a final polish task.

### Structure and navigation

- One `h1` per page or full-screen view.
- Logical heading levels.
- Keep the skip link.
- Mark the active destination with `aria-current="page"` through `NavLink`.
- Use landmarks for navigation, main content, complementary panels, and search.
- Set a useful document title for each route and selected Trip or Place.
- On route change, move focus to the page heading or main region when appropriate. Do not steal focus during map interaction.

### Keyboard and focus

- Every feature must work without a pointer, including map alternatives.
- Focus order must match visual order.
- All sheets, popovers, menus, and dialogs support Escape and restore focus.
- Use a real focus trap for modal dialogs. A visually modal `div` is not enough.
- Do not put interactive elements inside other interactive elements.
- Do not remove controls from the tab order while leaving them visible and unexplained.
- Map markers need an equivalent list. The canvas itself does not need to expose every marker if the list provides full access.

### Forms and feedback

- Every field has a persistent visible label.
- Hints and errors connect through `aria-describedby`.
- Mark invalid fields with `aria-invalid`.
- Put the error beside the affected field and add an error summary for multi-field forms.
- Use `role="status"` for non-critical completion and `role="alert"` only for urgent failures.
- Use native `progress` where progress is known.

### Color, text, and zoom

- All text and controls meet contrast targets in both themes.
- Selected, error, chart, route, and year states do not rely on color alone.
- The app must remain usable at 200 percent browser zoom at 1280 by 720 CSS pixels.
- Support 320 px width without horizontal page scrolling.
- Do not clip text after OS text-size increase.

### Motion

- Respect `prefers-reduced-motion` for CSS animation, sheet transitions, playback embellishment, and map camera movement.
- Playback remains usable without automatic camera following.

## Responsive requirements

Design and test these widths as real compositions, not scaled desktop pages:

- 320 by 568
- 390 by 844
- 768 by 1024
- 1280 by 720
- 1440 by 900

Also test:

- Portrait and landscape mobile
- Browser zoom at 200 percent
- Long translated-like strings even if localization is not implemented
- Many years of data
- 10,000 or more Places in search and list behavior with synthetic data
- Very long Place and Trip names
- Missing addresses and unnamed Places
- Empty, partial, loading, offline-map, import-error, and restore-error states

## Performance requirements

Beauty must not delay the first useful interaction.

- Keep route-level code splitting.
- Keep MapLibre out of the first-run bundle until a map preview truly needs it. Prefer lightweight local SVG for welcome previews.
- Do not load playback export code until export starts.
- Keep list filtering responsive for large local datasets. Use memoized indexes and simple windowing only if profiling proves it is needed.
- Avoid rerendering the MapLibre map for panel-only state changes.
- Reserve layout space for lazy content to prevent jumps.
- Use CSS gradients and inline SVG with restraint. Do not ship large decorative raster assets.
- Continue to pass `scripts/check-bundle-budget.sh`.

Set measurable targets after recording the current baseline in a production build. At minimum, do not regress the existing bundle checks, route chunking, import responsiveness, or map interaction.

## State and interaction requirements

Every major feature needs designed states, not only a happy path.

For each screen, implement and test:

- Initial loading
- Empty before Import
- Ready with data
- Active filtering
- No filter results
- Inline edit
- Pending operation
- Success
- Recoverable error
- Offline map tiles
- Reduced motion

Preserve the user's local context where useful:

- Selected theme
- Last Atlas layer
- Last useful time range
- Rail collapsed state
- Dismissed setup checklist

Do not persist transient dialogs, search text that may expose personal data unexpectedly, or playback running state.

## Implementation map

The worker should expect to touch these areas:

- `src/routes/Layout.tsx` for the new shell and navigation.
- `src/App.tsx` for route composition and compatibility redirects.
- `src/index.css` for tokens, type, focus, motion, map-overlay, and responsive foundations.
- `src/components/ui/` for shared primitives.
- `src/routes/WelcomeView.tsx` and `src/routes/ImportView.tsx` for onboarding.
- `src/routes/MapView.tsx` and `src/routes/HeatmapView.tsx` to merge Atlas layers and panels.
- `src/features/map/VisitDetailCard.tsx` to make Place detail the main model.
- `src/routes/TripsView.tsx` and `src/routes/PlaybackView.tsx` for Stories.
- `src/routes/DashboardView.tsx` for the Insights hierarchy and visualizations.
- `src/routes/SettingsView.tsx` for appearance, data care, and privacy.
- Existing route and feature tests for behavior that must survive the layout change.

Keep domain calculations in their feature modules. Do not move statistics, Trip inference, archive parsing, or map-layer construction into UI components.

## Suggested delivery sequence

Implement this as reviewable vertical slices. Do not make one untestable rewrite commit.

### Slice 1: Foundation and shell

- Add design tokens and shared primitives.
- Build the responsive three-destination shell.
- Preserve route access and current screen behavior.
- Add shell, focus, and responsive tests.

### Slice 2: First run and Import

- Redesign Welcome.
- Build the stepped Import outcome flow.
- Add Home selection and setup checklist.
- Cover success, duplicate, partial, large-file working, and error states.

### Slice 3: Atlas

- Build the unified toolbar and context panel.
- Make Places and dwell heat layer choices.
- Improve search, time filtering, list mode, Place detail, and offline state.
- Preserve map calculations and deep links.

### Slice 4: Stories

- Build the Trip library and focused create or edit flow.
- Add Story detail.
- Simplify Playback transport and secondary controls.
- Improve export confirmation and progress.

### Slice 5: Insights

- Add year scope and narrative hierarchy.
- Add accessible data displays and Atlas links.
- Embed Home selection.
- Remove blurred placeholder metrics.

### Slice 6: Settings and full quality pass

- Redesign appearance, Archive, advanced style, and privacy sections.
- Run accessibility, responsive, performance, bundle, no-egress, test, lint, and type checks.
- Fix copy and state inconsistencies across the full app.

If these slices become issues, each issue must deliver a user-visible flow with its tests. Do not create separate issues for every primitive unless a primitive has standalone value.

## Verification plan

The worker must verify the finished UI with code checks and rendered-browser checks.

### Automated checks

Run the repository's existing commands:

```sh
npm run lint
npm run typecheck
npm test
npm run build
./scripts/check-no-egress.sh
./scripts/check-bundle-budget.sh
```

Add tests for:

- Primary navigation on desktop and mobile
- Route compatibility
- Welcome to file choice to import result
- Home selection from onboarding, Stories, and Insights
- Atlas layer and time filters
- Search keyboard behavior
- Place detail and list parity
- Offline map fallback
- Suggested Trip review and confirmed Trip deletion
- Playback title card, transport, keyboard controls, dialog behavior, and export progress
- Archive preview and restore result
- Focus entry and restoration for every modal surface
- Reduced-motion branches where logic changes

### Rendered checks

Use synthetic imported data and inspect every target viewport listed above.

For each, capture or record:

- First run
- Import working, error, partial, and success
- Atlas with no selection, search results, filters, Place detail, heat layer, list, and offline tiles
- Stories empty, missing Home, suggestions, library, detail, playback, and export
- Insights empty, missing Home, All time, and a selected year
- Settings default, dirty, invalid custom style, Archive preview, restore success, and restore error
- Light, dark, and system preference
- Keyboard-only focus path
- 200 percent zoom
- Reduced motion

Do not claim rendered or browser proof from unit tests alone.

## Definition of done

The overhaul is complete when all of the following are true:

- A new user can understand the value, choose a valid file, import it, choose Home, and open the Atlas without guessing where to go.
- A returning user sees only Atlas, Stories, and Insights as primary destinations.
- Heatmap is an Atlas layer rather than a competing destination.
- Trips have a visual library and detail step before Playback.
- Insights has a clear year scope, visual hierarchy, accessible data alternatives, and links back to Atlas.
- Import and Archive states say whether existing data changed.
- All repeated buttons, fields, dialogs, sheets, cards, and status feedback use shared behavior.
- The UI is usable at every required viewport and at 200 percent zoom.
- Keyboard and screen-reader users can complete every non-map task, and the Place list provides full access to map content.
- Light and dark themes meet WCAG 2.2 AA contrast targets.
- Reduced motion works across CSS, panels, playback, and camera changes.
- No new egress, dependency, privacy, bundle, domain, import, Archive, or data-integrity regression exists.
- Lint, type checking, unit tests, production build, no-egress check, and bundle-budget check pass.
- The PR describes the changed flows, includes synthetic screenshots at representative breakpoints, states what was not verified, keeps AI disclosure, and is ready for human review.

## Final judgment calls for the worker

When a detail is not specified here, prefer the choice that does the following:

1. Keeps the user's private atlas visible.
2. Reduces the number of simultaneous controls.
3. Makes the next action obvious without a tutorial.
4. Uses the existing platform and packages.
5. Preserves access for keyboard, touch, zoom, low vision, and reduced-motion users.

Do not preserve a weak interaction just because a test asserts its current markup. Preserve the behavior that matters, redesign the interaction, then update the test to describe the improved contract.
