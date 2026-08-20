import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VTC Truck Hub – Virtuelle Speditionen",
    short_name: "VTC Truck Hub",
    description: "ETS2- und ATS-Speditionen, Fahrten, Events und Live-Map.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0d202d",
    theme_color: "#22d3c5",
    lang: "de",
    orientation: "any",
    categories: ["games", "productivity", "social"],
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
