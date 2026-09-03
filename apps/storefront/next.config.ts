import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@kiln/shared", "@kiln/plugins"],
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost" },
      { protocol: "http", hostname: "127.0.0.1" },
    ],
  },
  // The admin embeds the storefront in an iframe for live preview — never send X-Frame-Options.
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }] }];
  },
};

export default nextConfig;
