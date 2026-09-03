import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@kiln/shared"],
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  webpack: (config, { webpack, isServer }) => {
    // @kiln/shared falls back to require("node:crypto") when globalThis.crypto is missing (never in browsers).
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(/^node:crypto$/, "crypto"));
    if (!isServer) config.resolve.fallback = { ...(config.resolve.fallback ?? {}), crypto: false };
    return config;
  },
};

export default nextConfig;
