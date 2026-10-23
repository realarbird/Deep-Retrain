import type { MetadataRoute } from "next";

/** Lets DeepRetain be installed to a home screen or dock and open without browser chrome. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DeepRetain",
    short_name: "DeepRetain",
    description: "A study notebook that brings each idea back just before you'd forget it, with a daily limit so you can't cram.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f2ec",
    theme_color: "#f4f2ec",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
