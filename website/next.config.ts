import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// On GitHub Pages this is a project site served under /jetplane, so the build
// sets NEXT_PUBLIC_BASE_PATH=/jetplane. Local dev and other hosts leave it unset
// (root path). Keep this the single source of truth for the subpath.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

// Read the jetplane package version from the repo root so the header's version
// badge stays in sync automatically on every release (no manual bump). `next build`
// runs with cwd = website/, so ../package.json is the root (published) package.
let version = "0.0.0";
try {
  version = JSON.parse(readFileSync(join(process.cwd(), "..", "package.json"), "utf8")).version;
} catch {
  // fall back to 0.0.0 if the root package.json isn't reachable
}

const nextConfig: NextConfig = {
  // Static export — GitHub Pages serves plain HTML/CSS/JS.
  output: "export",
  // Emit /docs -> /docs/index.html so GitHub Pages serves it cleanly.
  trailingSlash: true,
  // GitHub Pages can't run the default next/image optimizer.
  images: { unoptimized: true },
  // undefined (not "") when no subpath — Next requires basePath to start with "/".
  basePath: basePath || undefined,
  // Exposed to the client bundle for the header version badge (see site-nav.tsx).
  env: {
    NEXT_PUBLIC_JETPLANE_VERSION: version,
  },
};

export default nextConfig;
