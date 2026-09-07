import type { NextConfig } from "next";

const backendInternalUrl = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@security-portal/shared"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendInternalUrl}/api/:path*`
      }
    ];
  }
};

export default nextConfig;
