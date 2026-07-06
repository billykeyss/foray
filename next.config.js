/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  // Required for leaflet tiles to work in static export
  //   assetPrefix: ".",
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // @anthropic-ai/sdk's CLI-credential helpers dynamically import
      // node:fs / node:path / node:buffer. Those code paths never execute in
      // the browser (the chat agent always passes an explicit apiKey), but
      // webpack still resolves them at build time and errors on the "node:"
      // scheme. Strip the scheme and stub the builtins with empty modules.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, "");
        })
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

module.exports = nextConfig;
