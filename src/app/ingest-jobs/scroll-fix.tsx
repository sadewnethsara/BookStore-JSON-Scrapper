"use client";

import { useEffect } from "react";

/** `globals.css` sets `body { overflow: hidden }` for the swipe UI; restore scroll on ingest routes. */
export function IngestJobsScrollFix() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyHeight = body.style.height;
    const prevBodyMinHeight = body.style.minHeight;

    html.style.overflow = "auto";
    body.style.overflow = "auto";
    body.style.height = "auto";
    body.style.minHeight = "100vh";

    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBodyOverflow;
      body.style.height = prevBodyHeight;
      body.style.minHeight = prevBodyMinHeight;
    };
  }, []);

  return null;
}
