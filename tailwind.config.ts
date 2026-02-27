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
          green: "#2A7A3B",
          greenDark: "#1E5C2B",
          greenLight: "#3A9B4F",
          cream: "#E8E4D9",
          creamDark: "#D4CFC3",
          dark: "#0F1F13",
        },
      },
    },
  },
};

export default config;
