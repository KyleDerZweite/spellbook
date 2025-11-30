import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "rgb(var(--border) / <alpha-value>)",
        input: "rgb(var(--input) / <alpha-value>)",
        ring: "rgb(var(--ring) / <alpha-value>)",
        background: "rgb(var(--background) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        "muted-foreground": "rgb(var(--muted-foreground) / <alpha-value>)", // Use muted-foreground from new CSS
        
        primary: {
          DEFAULT: "rgb(var(--primary) / <alpha-value>)",
          foreground: "rgb(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "rgb(var(--secondary) / <alpha-value>)",
          foreground: "rgb(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "rgb(var(--destructive) / <alpha-value>)",
          foreground: "rgb(var(--destructive-foreground) / <alpha-value>)",
        },
        success: {
          DEFAULT: "rgb(var(--success) / <alpha-value>)",
          foreground: "rgb(var(--primary-foreground) / <alpha-value>)", // Using primary-foreground as success-foreground was not specified
        },
        warning: "rgb(var(--warning) / <alpha-value>)",
        error: "rgb(var(--error) / <alpha-value>)",
        info: "rgb(var(--info) / <alpha-value>)",

        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          hover: "rgb(var(--accent-hover) / <alpha-value>)",
        },
        
        card: {
          DEFAULT: "rgb(var(--card) / <alpha-value>)",
          foreground: "rgb(var(--foreground) / <alpha-value>)", // Card foreground usually same as foreground
          hover: "rgb(var(--card-hover) / <alpha-value>)", // Added card-hover
        },
        
        sidebar: {
          DEFAULT: "rgb(var(--sidebar) / <alpha-value>)",
          foreground: "rgb(var(--muted-foreground) / <alpha-value>)", // Using muted-foreground for sidebar-foreground
        },

        // MTG Mana colors (Keep existing)
        mana: {
          white: "rgb(var(--mana-white) / <alpha-value>)",
          blue: "rgb(var(--mana-blue) / <alpha-value>)",
          black: "rgb(var(--mana-black) / <alpha-value>)",
          red: "rgb(var(--mana-red) / <alpha-value>)",
          green: "rgb(var(--mana-green) / <alpha-value>)",
          gold: "rgb(var(--mana-gold) / <alpha-value>)",
          colorless: "rgb(var(--mana-colorless) / <alpha-value>)",
        },
        // Rarity colors (Keep existing)
        rarity: {
          common: "rgb(var(--rarity-common) / <alpha-value>)",
          uncommon: "rgb(var(--rarity-uncommon) / <alpha-value>)",
          rare: "rgb(var(--rarity-rare) / <alpha-value>)",
          mythic: "rgb(var(--rarity-mythic) / <alpha-value>)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        // Keep existing glow-pulse, if any
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
      },
      boxShadow: {
        // Keep existing glow, glow-lg, glow-gold, card-hover if needed
        'glow': '0 0 20px rgb(var(--accent) / 0.15), 0 0 40px rgb(var(--accent) / 0.1)',
        'glow-lg': '0 0 30px rgb(var(--accent) / 0.2), 0 0 60px rgb(var(--accent) / 0.15)',
        'glow-gold': '0 0 20px rgb(var(--mana-gold) / 0.2), 0 0 40px rgb(var(--mana-gold) / 0.1)',
        'card-hover': '0 8px 30px rgb(var(--accent) / 0.2), 0 0 60px rgb(var(--accent) / 0.1)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-mystic': 'linear-gradient(135deg, rgb(var(--background)) 0%, rgb(var(--background-secondary)) 50%, rgb(20 12 30) 100%)',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;