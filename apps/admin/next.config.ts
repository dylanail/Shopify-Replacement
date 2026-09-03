import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@kiln/shared"],
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
