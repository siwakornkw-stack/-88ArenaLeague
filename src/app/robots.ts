import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/dashboard", "/teams/", "/account", "/login", "/sponsors/"],
    },
    sitemap: "https://league-manager-app.vercel.app/sitemap.xml",
    host: "https://league-manager-app.vercel.app",
  };
}
