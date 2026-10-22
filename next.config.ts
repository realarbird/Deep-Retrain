import type { NextConfig } from "next";
import { MAX_IMPORT_BYTES } from "./lib/importLimits";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // proxy.ts makes Next buffer request bodies, and anything past this limit is silently cut off.
    // Leave room above the notes import limit for the multipart wrapper.
    proxyClientMaxBodySize: MAX_IMPORT_BYTES + 1024 * 1024,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
