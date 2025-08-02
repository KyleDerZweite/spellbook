/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  images: {
    domains: [
      'cards.scryfall.io',
      'c1.scryfall.com', 
      'gatherer.wizards.com'
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  },
  // Enable strict mode for better development experience
  reactStrictMode: true,
  
  // Optimize for production
  swcMinify: true,
  
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