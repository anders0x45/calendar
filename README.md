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

## Status

| Milestone | Status |
| --- | --- |
| 1. Scaffold, tokens, header shell | done |
| 2. Date/timezone/recurrence logic + tests | pending |
| 3. IndexedDB + settings | pending |
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
- Run tests with `node --test tests/` (arrives with milestone 2).

## Notes

- Placeholders: PWA icons currently use the SVG app icon; PNG icons are the
  milestone-10 replacement. The service worker is a stub until milestone 10.
