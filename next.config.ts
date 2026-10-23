import type { NextConfig } from "next";

const demo = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

const nextConfig: NextConfig = {
  // Only the hosted demo sets these; see lib/demo/mode.ts.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  // The demo builds each visitor's database from the migration files, so they're deployed with it.
  ...(demo && { outputFileTracingIncludes: { "/**": ["./prisma/migrations/**/*.sql"] } }),
};

export default nextConfig;
