import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true, // Required for static export
    remotePatterns: [
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
    ],
  },
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // @anthropic-ai/sdk's CLI-credential helpers dynamically import
      // node:fs / node:path / node:buffer. Those code paths never execute in
      // the browser (the chat agent always passes an explicit apiKey), but
      // webpack still resolves them at build time and errors on the "node:"
      // scheme. Strip the scheme and stub the builtins with empty modules.
      config.resolve.alias = {
        ...config.resolve.alias,
        "node:fs": false,
        "node:path": false,
        "node:buffer": false,
      };
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        buffer: false,
      };
    }
    return config;
  },
};

export default nextConfig;
