"use client";

import { Analytics } from "@vercel/analytics/next";
import { analyticsEvent } from "@/lib/analytics";

export function SiteAnalytics() {
  // Production uses same-origin /_vercel/insights endpoints, allowed by our CSP.
  if (process.env.NODE_ENV !== "production") return null;
  return <Analytics beforeSend={analyticsEvent} />;
}
