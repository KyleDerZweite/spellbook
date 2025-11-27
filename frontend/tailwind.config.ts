/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'primary-bg': 'var(--color-primary-bg)',
        'ui-bg': 'var(--color-ui-bg)',
        'accent-primary': 'var(--color-accent-primary)',
        'accent-hover': 'var(--color-accent-hover)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'border': 'var(--color-border)',
        'focus-border': 'var(--color-focus-border)',
        'texture-accent': 'var(--color-texture-accent)',
      },
      fontSize: {
        'h1': 'var(--font-size-h1)',
        'h2': 'var(--font-size-h2)',
        'h3': 'var(--font-size-h3)',
        'body': 'var(--font-size-body)',
        'small': 'var(--font-size-small)',
      },
      fontWeight: {
        'bold': 'var(--font-weight-bold)',
        'medium': 'var(--font-weight-medium)',
        'regular': 'var(--font-weight-regular)',
      },
      lineHeight: {
        'body': 'var(--line-height-body)',
      },
      borderRadius: {
        'sm': 'var(--border-radius-sm)',
        'md': 'var(--border-radius-md)',
        'lg': 'var(--border-radius-lg)',
      },
      transitionDuration: {
        'DEFAULT': 'var(--animation-duration)',
      },
      transitionTimingFunction: {
        'DEFAULT': 'var(--animation-timing-function)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'), 
    require('@tailwindcss/forms')
  ],
}