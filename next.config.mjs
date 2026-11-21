const EXPORT = process.env.NEXT_OUTPUT === 'export'; // set by scripts/build-mobile.mjs (the Android app bundles the pages)

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  ...(EXPORT ? { distDir: 'out', output: 'export', trailingSlash: true, images: { unoptimized: true } } : {}),
  webpack: config => {
    config.resolve.fallback = { ...(config.resolve.fallback || {}), fs: false, path: false, crypto: false }; // sql.js (Anki import) mentions these for Node only
    config.resolve.alias.canvas = false; // pdf.js optionally imports node-canvas; the browser build does not need it
    return config;
  },
  ...(EXPORT ? {} : {
    async headers() {
      const cors = [
        // the Android app runs on https://localhost and calls these routes; no cookies are used (the owner token is sent as a header)
        { key: 'Access-Control-Allow-Origin', value: '*' },
        { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
        { key: 'Access-Control-Allow-Headers', value: 'content-type,authorization,x-ai-key,x-user-token' },
        { key: 'Access-Control-Max-Age', value: '86400' }
      ];
      return [
        { source: '/api/:path*', headers: cors },
        { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
        { source: '/vendor/:path*', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }, { key: 'Cache-Control', value: 'public, max-age=86400' }] },
        { source: '/models/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' }] }
      ];
    }
  })
};
export default nextConfig;
