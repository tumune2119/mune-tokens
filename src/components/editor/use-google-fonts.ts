"use client";

import { useEffect } from "react";

/** Loads Google Fonts families into the app window so previews use the real font. */
export function useGoogleFonts(families: string[]) {
  const key = [...new Set(families.map((f) => f.trim()).filter(Boolean))].sort().join("|");
  useEffect(() => {
    for (const family of key ? key.split("|") : []) {
      const id = `gf-${family.toLowerCase().replace(/\s+/g, "-")}`;
      if (document.getElementById(id)) continue;
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      // Variable range first; static families answer 400 to it, so fall back to the plain family.
      link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/\s+/g, "+")}:wght@100..900&display=swap`;
      link.onerror = () => {
        link.onerror = null;
        link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/\s+/g, "+")}:wght@400;500;600;700&display=swap`;
      };
      document.head.appendChild(link);
    }
  }, [key]);
}
