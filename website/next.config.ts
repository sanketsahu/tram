import type { NextConfig } from "next";

// On GitHub Pages this is a project site served under /jetplane, so the build
// sets NEXT_PUBLIC_BASE_PATH=/jetplane. Local dev and other hosts leave it unset
// (root path). Keep this the single source of truth for the subpath.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  // Static export — GitHub Pages serves plain HTML/CSS/JS.
  output: "export",
  // Emit /docs -> /docs/index.html so GitHub Pages serves it cleanly.
  trailingSlash: true,
  // GitHub Pages can't run the default next/image optimizer.
  images: { unoptimized: true },
  // undefined (not "") when no subpath — Next requires basePath to start with "/".
  basePath: basePath || undefined,
};

export default nextConfig;
