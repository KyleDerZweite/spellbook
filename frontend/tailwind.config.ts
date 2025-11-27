import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--background) / <alpha-value>)",
        "background-secondary": "rgb(var(--background-secondary) / <alpha-value>)",
        "background-tertiary": "rgb(var(--background-tertiary) / <alpha-value>)",
        card: "rgb(var(--card) / <alpha-value>)",
        "card-hover": "rgb(var(--card-hover) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        "border-hover": "rgb(var(--border-hover) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        "foreground-muted": "rgb(var(--foreground-muted) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-hover": "rgb(var(--accent-hover) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        error: "rgb(var(--error) / <alpha-value>)",
        info: "rgb(var(--info) / <alpha-value>)",
        // MTG Mana colors
        mana: {
          white: "rgb(var(--mana-white) / <alpha-value>)",
          blue: "rgb(var(--mana-blue) / <alpha-value>)",
          black: "rgb(var(--mana-black) / <alpha-value>)",
          red: "rgb(var(--mana-red) / <alpha-value>)",
          green: "rgb(var(--mana-green) / <alpha-value>)",
          gold: "rgb(var(--mana-gold) / <alpha-value>)",
          colorless: "rgb(var(--mana-colorless) / <alpha-value>)",
        },
        // Rarity colors
        rarity: {
          common: "rgb(var(--rarity-common) / <alpha-value>)",
          uncommon: "rgb(var(--rarity-uncommon) / <alpha-value>)",
          rare: "rgb(var(--rarity-rare) / <alpha-value>)",
          mythic: "rgb(var(--rarity-mythic) / <alpha-value>)",
        },
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
      },
      boxShadow: {
        'glow': '0 0 20px rgb(var(--accent) / 0.15), 0 0 40px rgb(var(--accent) / 0.1)',
        'glow-lg': '0 0 30px rgb(var(--accent) / 0.2), 0 0 60px rgb(var(--accent) / 0.15)',
        'glow-gold': '0 0 20px rgb(var(--mana-gold) / 0.2), 0 0 40px rgb(var(--mana-gold) / 0.1)',
        'card-hover': '0 8px 30px rgb(var(--accent) / 0.2), 0 0 60px rgb(var(--accent) / 0.1)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-mystic': 'linear-gradient(135deg, rgb(var(--background)) 0%, rgb(var(--background-secondary)) 50%, rgb(20 12 30) 100%)',
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px rgb(var(--accent) / 0.2)' },
          '50%': { boxShadow: '0 0 30px rgb(var(--accent) / 0.4)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
