import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Disable ESLint during builds for development
    ignoreDuringBuilds: true,
  },
  images: {
    domains: [
      'cards.scryfall.io', 
      'c1.scryfall.com',
      'img.scryfall.com',
    ],
  },
};

export default nextConfig;
