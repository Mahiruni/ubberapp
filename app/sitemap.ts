import type { MetadataRoute } from "next";
import { NEXRIDE_SITE_URL } from "../lib/nexride-site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: NEXRIDE_SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: NEXRIDE_SITE_URL + "/discover",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: NEXRIDE_SITE_URL + "/driver",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];
}
