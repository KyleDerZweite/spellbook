/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cards.scryfall.io',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'c1.scryfall.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'gatherer.wizards.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  },
  // Enable strict mode for better development experience
  reactStrictMode: true,
  
  // Configure redirects for better UX
  async redirects() {
    return [
      {
        source: '/',
        destination: '/search',
        permanent: false,
      },
    ]
  },
}

module.exports = nextConfig