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
| 4. Month view + navigation | pending |
| 5. Event sheet | pending |
| 6. Week/day views | pending |
| 7. Recurrence UI | pending |
| 8. Image generation + settings | pending |
| 9. Export/import | pending |
| 10. PWA + offline | pending |
| 11. Accessibility + polish | pending |

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
- Placeholders: PWA icons currently use the SVG app icon; PNG icons are the
  milestone-10 replacement. The service worker is a stub until milestone 10.
