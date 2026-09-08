import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sito interamente statico: `next build` produce la cartella out/ che
  // Cloudflare Pages serve cosi' com'e'. I dati sono JSON in public/dati,
  // generati dall'ETL: online non gira nessun server.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
