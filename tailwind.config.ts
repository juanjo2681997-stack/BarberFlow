import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        barber: {
          black: "#111111",
          gray: "#1c1c1c",
          gold: "#d8a24a",
          cream: "#f5efe3"
        }
      }
    }
  },
  plugins: []
};

export default config;
