import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Garde-fou réactivé : le build échoue en cas d'erreur de type TypeScript.
  // (Auparavant ignoreBuildErrors: true laissait passer des bugs réels.)
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
