/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        surface: '#1a1a1a',
        'surface-variant': '#2a2a2a',
        primary: '#6366f1',
        'primary-variant': '#8b5cf6',
        'text-primary': '#ffffff',
        'text-secondary': '#a1a1aa',
        'text-muted': '#71717a',
        border: '#27272a',
        'border-accent': '#3f3f46',
        'card-rare': '#ffd700',
        'card-mythic': '#ff6b35',
        'card-uncommon': '#c0c0c0',
        'card-common': '#8b7355',
      },
      boxShadow: {
        glow: '0 0 30px rgba(99,102,241,0.25)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'), 
    require('@tailwindcss/forms')
  ],
}