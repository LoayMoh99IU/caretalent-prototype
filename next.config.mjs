/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  // Static export so the app can be hosted on GitHub Pages (or any static host).
  // All data comes from Supabase in the browser.
  output: "export",
  basePath,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
