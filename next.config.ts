import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only the hosted demo sets this; see lib/demo/mode.ts.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
};

export default nextConfig;
