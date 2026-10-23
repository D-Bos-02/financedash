// The public demo (a hosted copy with made-up data). Set at build time, so it's the same on server and client.
// Self-hosted installs never set it.
export const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

// Where the app is served from, e.g. "/projects/finance-dash" for the demo; "" for a normal install.
// next.config.ts sets the same value as basePath, which <Link> and the router apply by themselves;
// fetch() and plain <a> links need it added.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const REPO_URL = "https://github.com/D-Bos-02/financedash";

// Picks the demo visitor's own copy of the data (see lib/demo/visitor-db.ts).
export const VISITOR_COOKIE = "financedash_demo";
