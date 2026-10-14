import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // StrictMode double-invokes every effect in dev: each page would fire all
  // chain reads twice against the 30 req/min RPC budget. Writes are already
  // ref-guarded, so opting out only removes the duplicate read bursts.
  reactStrictMode: false,
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
