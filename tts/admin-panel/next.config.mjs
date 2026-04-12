/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',

  /**
   * Production Proxy:
   * Redirects /api/ and /audio/ requests to the internal Docker tts-api service.
   */
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://tts-api:8001/:path*",
      },
      {
        source: "/audio/:path*", // Proxy audio files for preview in Admin Panel
        destination: "http://tts-api:8001/audio/:path*",
      },
    ];
  },
};

export default nextConfig;
