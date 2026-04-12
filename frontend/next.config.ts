import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * COOP/COEP headers required for SharedArrayBuffer support.
   */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
        ],
      },
      {
        source: "/sherpa-onnx/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },

  /**
   * Production Proxy:
   * Redirects /api/ and /audio/ requests to the internal Docker services.
   */
  async rewrites() {
    return [
      {
        source: "/api/tts/:path*",
        destination: "http://tts-api:8001/:path*",
      },
      {
        source: "/audio/:path*", // [FINAL BUGFIX] Proxy audio files from TTS engine
        destination: "http://tts-api:8001/audio/:path*",
      },
      {
        source: "/api/evaluation/:path*",
        destination: "http://backend:8000/:path*",
      },
    ];
  },

  turbopack: {},
};

export default nextConfig;
