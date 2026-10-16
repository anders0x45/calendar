---
name: Tactile Retro Chrono
colors:
  surface: '#fcf9f8'
  surface-dim: '#dcd9d9'
  surface-bright: '#fcf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f2'
  surface-container: '#f0eded'
  surface-container-high: '#eae7e7'
  surface-container-highest: '#e5e2e1'
  on-surface: '#1b1b1c'
  on-surface-variant: '#54424b'
  inverse-surface: '#303030'
  inverse-on-surface: '#f3f0ef'
  outline: '#87717c'
  outline-variant: '#d9c0cc'
  surface-tint: '#a42b83'
  primary: '#a12881'
  on-primary: '#ffffff'
  primary-container: '#c0439b'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffaede'
  secondary: '#5f5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e2dfde'
  on-secondary-container: '#636262'
  tertiary: '#006c45'
  on-tertiary: '#ffffff'
  tertiary-container: '#008858'
  on-tertiary-container: '#ffffff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffd8ec'
  primary-fixed-dim: '#ffaede'
  on-primary-fixed: '#3b002d'
  on-primary-fixed-variant: '#86076a'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1c1b1b'
  on-secondary-fixed-variant: '#474746'
  tertiary-fixed: '#81faba'
  tertiary-fixed-dim: '#63dda0'
  on-tertiary-fixed: '#002112'
  on-tertiary-fixed-variant: '#005233'
  background: '#fcf9f8'
  on-background: '#1b1b1c'
  surface-variant: '#e5e2e1'
typography:
  display-lg:
    fontFamily: JetBrains Mono
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: JetBrains Mono
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: JetBrains Mono
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: JetBrains Mono
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-lg:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.06em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 0.75rem
  gutter-desktop: 1rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system channels the tactile immediacy of early personal computing workstations (Classic Macintosh, System 7, and Windows 95) re-engineered through a modern mobile design lens. The aesthetic rejects decorative blur, fluid gradients, and sterile flat surfaces in favor of mechanical authenticity, physical extrusion, and immediate tactile feedback.

Targeted at organized professionals, creatives, and digital nostalgists who crave structure, physical affordances, and zero-latency interaction models, the interface evokes the feel of a precision physical desktop accessory: clicky, chunky, authoritative, and dependable.

Key stylistic tenets:
- **Mechanical Tactility:** Elements possess tangible simulated thickness using hard dual-tone bevel borders and hard-edged 0-blur drop shadows.
- **Physical Depress:** State changes mimic actual mechanical push-buttons via border reversal and directional translation (`translate(2px, 2px)`).
- **Early Computing Warmth:** Warm putty and paper-cream foundations offset by stark ink typography and purposeful, vivid 8-bit-inspired event markers.
- **Strict Geometric Precision:** High-contrast lines, crisp 4px corners, and structural alignment reinforce predictability and thumb ergonomics.

## Colors

The palette is rooted in early computing plastics and off-white display casings, punctuated by functional primary ink and distinct categorical color markers.

### Palette Architecture
- **Canvas / Background (`#dedede`):** Muted neutral base tone mimicking computer bezel plastics.
- **Surface Plate (`#f7f4ea`):** Cream-tinted surface for sunken panels, secondary wells, and inactive toolbar states.
- **Surface Raised / Card (`#ffffff`):** High-brightness card face engineered to maximize contrast against bevel highlights and inks.
- **Ink Primary (`#1e1e1e`):** Deep charcoal ink, used for typography, borders, and crisp mechanical shadows.
- **Bevel Highlight (`#ffffff`):** Hard 2px top and left edge treatment simulating overhead ambient illumination.
- **Bevel Shadow (`#1a1a1a`):** Low-contrast dark bottom and right edge treatment simulating chamfered chassis falloff.
- **Action Accent (`#c3469e`):** Vibrant pink-magenta reserved strictly for current-day indicators, selected dates, primary actions, and focused states.
- **Tertiary Accent (`#44c086`):** Fresh mint green utilized for positive status indicators, completion tags, and supplementary highlights.

### Category Event Colors
Solid, punchy tokens with zero transparency for calendar event tagging and block schedules:
- Red: `#E5484D`
- Orange: `#5b9e11`
- Yellow: `#F2C230`
- Green: `#3DA35D`
- Teal: `#2BA3A0`
- Blue: `#3B6FE0`
- Purple: `#8B5CD6`
- Pink: `#E05A9C`

### Strict Usage Rules
- Shadows and bevels must remain opaque solid colors. Alpha transparency, gradients, and directional blurs are forbidden.
- Event colors must always be enclosed in a solid 1px or 2px `#1e1e1e` outline to maintain separation from cream or white surfaces.

## Typography

The typographic strategy pairs mechanical precision with contemporary legibility:

1. **JetBrains Mono** serves as the structural display and numerical backbone. Used for dates, times, days of the week, view-switchers, and status tallies. Its tabular figures guarantee strict vertical alignment across calendars, timelines, and agenda listings without horizontal jitter.
2. **Inter** acts as the utilitarian body typeface. Applied to event descriptions, titles, participant details, settings, and modal dialogues to keep dense data clusters fluid and effortlessly readable.

### Formatting Conventions
- **Dates and Numerical Callouts:** Always format day numbers, time stamps, and hour intervals (`09:00`, `14:30`) in uppercase `JetBrains Mono`.
- **Labels & Micro-headers:** Set in `label-sm` or `label-md` with uppercase transformation to evoke industrial chassis engravings.

## Layout & Spacing

The layout is built around mobile-first utility with a 7-column calendar matrix and a single-column fluid agenda architecture.

### Grid & Ergonomics
- **Calendar Grid:** The monthly/weekly matrix partitions available canvas width into 7 equal columns with `space-xs` (4px) or `space-sm` (8px) internal cell gutters, bordered by hard outlines.
- **Touch Target Threshold:** All tap zones (day cells, navigation chevrons, quick-add buttons) strictly honor a minimum dimension of 44×44px to maintain hardware-grade usability.
- **Agenda View:** Vertically sequenced cards using `space-md` gaps. Sticky hour markers align to the left rail in a 64px fixed column.

### Responsive Breakpoints
- **Mobile (< 640px):** Single-column stacked layout, full-bleed calendar table bordered with `margin` (16px), bottom-docked quick-action bar.
- **Tablet & Desktop (≥ 640px):** Two-pane interface. The persistent 7-column monthly overview settles on the left (320px fixed or 40% width), while the daily breakdown/agenda expands fluidly across the remaining right pane. Margins expand to 32px (`margin-desktop`).

## Elevation & Depth

Visual hierarchy is constructed entirely through pseudo-3D edge channelling and hard mechanical drop shadows. Surfaces do not blur or fade; they snap into physical planes.

### Depth Planes
1. **Recessed / Well (Sunken Layer):**
   - Background: `#f7f4ea` or `#dedede`
   - Border-top: `2px solid #1e1e1e`
   - Border-left: `2px solid #1e1e1e`
   - Border-bottom: `2px solid #ffffff`
   - Border-right: `2px solid #ffffff`
   - Box Shadow: `none`
   - Application: Input fields, unselected day cells in monthly matrix, search bars, track wells.

2. **Raised Plateau (Resting State):**
   - Background: `#ffffff` or `#f7f4ea`
   - Border-top: `2px solid #ffffff`
   - Border-left: `2px solid #ffffff`
   - Border-bottom: `2px solid #1a1a1a`
   - Border-right: `2px solid #1a1a1a`
   - Box Shadow: `2px 2px 0px #1a1a1a`
   - Application: Event cards, modal dialogs, date pickers, floating toolbar buttons.

3. **High Extrusion (Hero Interactive):**
   - Background: `#c3469e` or `#ffffff`
   - Border-top: `2px solid #ffffff`
   - Border-left: `2px solid #ffffff`
   - Border-bottom: `2px solid #1a1a1a`
   - Border-right: `2px solid #1a1a1a`
   - Box Shadow: `4px 4px 0px #1a1a1a`
   - Application: Primary "+ New Event" floating action button (FAB), urgent notifications.

4. **Depressed / Active State (Pressed State):**
   - Transform: `translate(2px, 2px)` (or `translate(4px, 4px)` for High Extrusion)
   - Border-top: `2px solid #1a1a1a`
   - Border-left: `2px solid #1a1a1a`
   - Border-bottom: `2px solid #ffffff`
   - Border-right: `2px solid #ffffff`
   - Box Shadow: `0px 0px 0px transparent`
   - Application: Applied to all active click/tap states instantly on touch-start.

## Shapes

The design system uses a strict **Soft (Level 1)** geometric standard. 

- **Base Radius:** `4px` (`0.25rem`) applied to buttons, calendar cells, inputs, cards, and modal dialogs.
- **Capsule Restriction:** Full pill-shapes (`border-radius: 9999px`) are restricted exclusively to small status tags and counter bubbles to maintain the boxy industrial silhouette.
- **Corner Discipline:** Rounded corners combined with 2px solid bevels produce an authentic, precision-molded ABS plastic appearance. Sharp 0px corners are reserved solely for nested calendar grids to keep grid lines seamless.

## Components

### Buttons
- **Primary:** Background `#c3469e`, text `#ffffff`, top/left border `2px solid #e178c1`, bottom/right border `2px solid #1a1a1a`, shadow `2px 2px 0px #1a1a1a`.
- **Secondary / Standard:** Background `#f7f4ea`, text `#1e1e1e`, top/left border `2px solid #ffffff`, bottom/right border `2px solid #1a1a1a`, shadow `2px 2px 0px #1a1a1a`.
- **Pressed (All):** Transform `translate(2px, 2px)`, shadow `0px 0px 0px`, invert bevel borders (dark top/light bottom).
- **Height & Spacing:** Minimum 44px tall; inline horizontal padding `space-lg` (16px).

### Input Fields
- **Container:** Recessed styling. Background `#ffffff`, text `#1e1e1e`, top/left border `2px solid #1a1a1a`, bottom/right border `2px solid #ffffff`.
- **Focus State:** Replace border with `2px solid #c3469e` and an outer high-contrast outline offset.
- **Typography:** `JetBrains Mono` for time/date pickers; `Inter` for title and multi-line notes.

### Calendar Day Cell
- **Resting:** Square or uniform box; background `#ffffff`, outer border `1px solid #dedede`. Day number pinned top-right in `label-sm`.
- **Current Day:** Background `#f7f4ea`, border `2px solid #c3469e`.
- **Selected Day:** Inset/depressed styling, background `#c3469e`, text `#ffffff`, top/left border `2px solid #1a1a1a`, bottom/right border `2px solid #e178c1`.
- **Event Indicators:** Solid 6×6px squares or 4px thick bars using the 8 event colors. No circular soft dots.

### Event Cards (Agenda & Timeline)
- **Container:** Background `#ffffff`, outer frame `1px solid #1a1a1a`, bottom-right shadow `3px 3px 0px #1a1a1a`.
- **Category Stripe:** Left border has an 8px solid block using one of the 8 event colors (e.g. Red `#E5484D`).
- **Layout:** Start time in `JetBrains Mono` (`label-md`), event title in `Inter` (`headline-sm`), location/attendees in `Inter` (`body-sm`) with a secondary ink tint.

### Segmented View Switchers (Day / Week / Month)
- **Chassis:** Recessed frame (`#dedede`), top/left border `2px solid #1a1a1a`, bottom/right border `2px solid #ffffff`, padding `2px`.
- **Inactive Tab:** Flat background transparent, text `#1e1e1e`, no shadow.
- **Active Tab:** Raised bevel plate, background `#ffffff`, shadow `1px 1px 0px #1a1a1a`, text `#c3469e` in bold monospace.

### Checkboxes & Toggles
- **Checkbox:** 20×20px square. Unchecked is recessed (`#ffffff` fill, bevel shadow top/left). Checked displays a thick `#c3469e` or `#1a1a1a` pixelated checkmark.
- **Toggle:** Track is a recessed rectangular slot. Thumb is a raised 20×20px beveled mechanical slider that shifts laterally with a hard `1px 1px 0px #1a1a1a` shadow.