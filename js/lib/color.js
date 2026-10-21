/**
 * Pick text ink for a background hex color (simple relative luminance).
 * Pure; used by event chips and swatches.
 */

/**
 * @param {string} hex "#rrggbb"
 * @returns {string} "#1e1e1e" or "#ffffff"
 */
export function inkForBackground(hex) {
  const match = /^#[0-9a-f]{6}$/i.exec(hex);
  if (!match) return "#1e1e1e";
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  const linear = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  // Pick whichever ink survives the contrast check; e.g. green/yellow
  // chip titles read better in dark ink even though their backgrounds
  // sit just above the old 0.35 luminance cutoff.
  const darkContrast = (luminance + 0.05) / 0.0635;
  const whiteContrast = 1.05 / (luminance + 0.05);
  return darkContrast >= whiteContrast ? "#1e1e1e" : "#ffffff";
}
