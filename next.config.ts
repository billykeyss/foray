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
      // NOTE: keep this identical to next.config.js — that file is the one
      // Next actually loads when both exist; this mirror exists so the fix
      // survives if next.config.js is ever removed.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^node:/,
          (resource: { request: string }) => {
            resource.request = resource.request.replace(/^node:/, "");
          }
        )
      );
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
