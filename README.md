# Chrono.exe

A phone-first, local-only calendar web app. Vanilla HTML/CSS/JS ES modules,
no frameworks, no build step. All data lives in the browser (IndexedDB).

## Run

Serve the folder statically (any static server works):

```
python3 -m http.server 8000
# or
npx serve .
```

Open http://localhost:8000. The app is designed for ~360-430px screens.

## Tests

```
npm install          # dev-only dependency: fake-indexeddb
node --test tests/
```

The app itself still runs without `npm install`.

## Status

| Milestone | Status |
| --- | --- |
| 1. Scaffold, tokens, header shell | done |
| 2. Date/timezone/recurrence logic + tests | done |
| 3. IndexedDB + settings | done |
| 4. Month view + navigation | done |
| 5. Event sheet | done |
| 6. Week/day views | done |
| 7. Recurrence UI | done |
| 8. Image generation + settings | done |
| 9. Export/import | done |
| 10. PWA + offline | done |
| 11. Accessibility + polish | done |

## Development

- Fonts (Inter, JetBrains Mono) and icons are self-hosted under `fonts/` and
  `icons/`; no CDN requests.
- Optional dev-only tooling (ESLint/Prettier) may be added later; the app
  never requires `npm install` to run.
- `npm install` is only for the test runner's fake-indexeddb shim.

## Notes

- All-day events and date-only queries render on their stored date;
  timed events are converted to the viewer's timezone and may land on a
  different day.
- The year-month picker includes an exact "jump to date" input (HTML date
  field) in addition to the grid-based month/year selection.
- Event chips in the month grid show color + title; the tiny image thumbnail
  lands with the event image feature (milestone 8).
- The timezone picker uses a native searchable input (datalist of
  Intl.supportedValuesOf("timeZone")).
- For recurring events, deletion asks "this event only" vs "the whole
  series"; the delete commits after the undo toast expires (undo cancels
  the pending commit rather than restoring data).
- Recurring edits are series-only by design: editing a repeating event
  shows a "SERIES EDIT" notice and applies to every occurrence; skipped
  dates stay skipped. `validateEventDraft` now owns all recurrence rule
  validation (freq, interval, until format, until >= start), shared by
  the event form now and import later.
- Week view: 7-day strip (tap to select) above the full week's agenda
  grouped by day with event dot previews; day view: all-day well plus a
  24-hour timeline with cards positioned at the viewer's converted time
  and a "now" line on today. Both share the agenda-card component.
- Chrome is single-purpose: the bottom nav is the only month/week/day
  switcher; the header gear is the only settings entry. On the settings
  screen the same header button renders as a back chevron ("Back to
  calendar") returning to the last calendar view. The router is the
  single writer of `state.view`, which drives the subtitle and period
  title (week shows the "OCT 12 – OCT 18" range, day the exact date).
- Image generation: new events (auto-art on) start with imageStatus
  "pending"; an idle-time job POSTs {prompt, steps} to a CORS-enabled
  Cloudflare Worker bridge (bridge/ in the repo) that runs Workers AI
  flux-1-schnell server-side; the app resizes to <=512px WebP into the
  images store, then
  flips status ready/failed (one retry). Detail banners show the stored
  blob when ready, GEN_FAILED + [ REGENERATE ] when not; generation
  failure never blocks any other functionality.
- Settings screen: art bridge URL + shared secret (password field with
  reveal, device only, never logged or exported), week start, default
  duration, 24-hour time toggle, auto-art toggle, storage estimate, and
  a guarded "reset database" (custom confirm sheet; wipes events +
  images).
- Export/import: the backup envelope is `{app: "calendar", version: 1,
  exportedAt, events, images}` with images as base64; import validates
  every record with validateEventRecord and upserts by id, reporting
  skips. The bridge URL and secret are never exported or logged.
- The events-status/image pairing means an import of "ready" events
  brings its own artwork blobs along (or falls back to placeholders if
  the envelope has none).
- PWA/offline: `sw.js` precaches the versioned shell (`chrono-shell-v5`)
  and serves it cache-first; image-generation API calls are never
  intercepted and POSTs bypass the worker. Updates activate immediately
  (skipWaiting on install) and an upgraded page reloads itself once via
  controllerchange. Icons ship
  as self-hosted PNG (192/512 + maskable renders of the SVG icon).
  Verified by loading the whole app from cache with the network
  disabled.
- Accessibility (milestone 11): sheets move focus in on open (dialog
  focusable, first Tab lands on the first control, focus restores to
  the opener on close); form captions are real `<label for>` elements
  and every input is ≥16px so iOS won't zoom on focus; month cells
  respond to Enter/Space in addition to click (Enter picks open the
  strip, Space selects); a skip link jumps straight to the calendar
  content; the day view's "now" line is aria-hidden (decorative);
  month-cell today badge bumped to 9px. Contrast was audited: accent
  deepened (#b93a95, 5.12:1 vs white both directions), the faint ink
  token darkened to pass 4.5:1 on the surface plate, event red
  adjusted (#d9333b), and `inkForBackground` now picks whichever ink
  gives the higher contrast instead of a bare luminance threshold so
  chip titles pass 4.5:1 on every swatch. Known remaining limitation:
  compact event chips in the month grid stay under 44px tall by
  design; the density is deliberate and the chips remain tappable.
