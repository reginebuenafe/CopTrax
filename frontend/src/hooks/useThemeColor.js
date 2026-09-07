import { useEffect } from "react";

const DEFAULT_THEME_COLOR = "#fffdf7"; // cream — matches every page except the Hero

// Without this, iOS Safari's status bar and its floating bottom domain/URL
// bar default to plain white, which reads as a harsh gap ("white at the top
// and bottom") whenever the actual page content behind them is a color —
// most visibly the Hero's dark green full-bleed background. Safari tints
// both of those overlay bars to match the page's `theme-color` meta tag, so
// this hook swaps that tag's color while a colored section (like the Hero)
// is mounted, and restores the site's default cream on unmount/cleanup —
// keeping every other page (which is cream at the top already) unaffected.
export default function useThemeColor(color) {
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return undefined;

    const previous = meta.getAttribute("content");
    meta.setAttribute("content", color);

    return () => {
      meta.setAttribute("content", previous ?? DEFAULT_THEME_COLOR);
    };
  }, [color]);
}
