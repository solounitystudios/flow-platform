import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        flow: {
          50: "#f1f1ff",
          100: "#e4e3ff",
          200: "#cdccff",
          300: "#a8a5ff",
          400: "#7d76ff",
          500: "#5b4dff",
          600: "#4a2af5",
          700: "#3f21d6",
          800: "#341ead",
          900: "#2d1e88",
          950: "#1a1150",
        },
        ink: {
          50: "#f5f6f8",
          100: "#e8eaee",
          200: "#cdd1da",
          300: "#a2a9b8",
          400: "#707a90",
          500: "#525c73",
          600: "#40485e",
          700: "#343a4c",
          800: "#22252f",
          900: "#15161d",
          950: "#0b0c10",
        },
        gold: {
          400: "#ffcf5c",
          500: "#f5b731",
          600: "#dd9611",
        },
        verified: {
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,17,25,0.06), 0 8px 24px -12px rgba(15,17,25,0.12)",
        glow: "0 0 0 1px rgba(91,77,255,0.15), 0 8px 32px -8px rgba(91,77,255,0.35)",
      },
      backgroundImage: {
        "flow-gradient": "linear-gradient(135deg, #5b4dff 0%, #7d76ff 45%, #341ead 100%)",
        "flow-radial": "radial-gradient(circle at top, #4a2af5, #1a1150)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "slide-up": "slide-up 0.3s ease-out",
      },
      keyframes: {
        "slide-up": {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
