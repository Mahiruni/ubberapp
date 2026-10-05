import type { MetadataRoute } from "next";
import { NEXRIDE_SITE_URL } from "../lib/nexride-site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/discover", "/driver"],
      disallow: [
        "/admin/",
        "/api/",
        "/auth/",
        "/onboarding/",
        "/rider/",
        "/support/",
        "/driver/verification/",
      ],
    },
    sitemap: NEXRIDE_SITE_URL + "/sitemap.xml",
    host: NEXRIDE_SITE_URL,
  };
}
