import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server minimo con le sole dipendenze usate davvero: serve al
  // Dockerfile di selfhost/ e tiene l'immagine sotto i 200 MB
  output: "standalone",
};

export default nextConfig;
