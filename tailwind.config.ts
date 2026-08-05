import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          green: "#005B3A",
          greenDark: "#00442C",
          greenLight: "#007C5F",
          cream: "#E8E4D9",
          creamDark: "#D4CFC3",
          dark: "#0F1F13",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        heading: ["var(--font-league-spartan)", "sans-serif"],
      },
    },
  },
};

export default config;
