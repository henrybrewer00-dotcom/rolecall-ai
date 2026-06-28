/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // resolve.ai: lime/chartreuse accent on warm paper. Lime for fills (dark text),
        // 600-900 darken to readable greens for text.
        accent: {
          DEFAULT: "#d3f24c",
          50: "#f7fcdd",
          100: "#edf9b4",
          200: "#e1f587",
          300: "#d3f24c",
          400: "#c7ea35",
          500: "#aacf24",
          600: "#7ea519",
          700: "#5f7d16",
          800: "#475e12",
          900: "#33450e",
        },
        magenta: {
          300: "#f9a8d4",
          400: "#f472b6",
          500: "#ec4899",
          600: "#db2777",
        },
        violet: {
          300: "#c4b5fd",
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
        },
        // Near-black-on-paper text scale.
        ink: {
          900: "#14161a",
          800: "#23272d",
          700: "#3a4047",
          600: "#565d67",
          500: "#737a85",
          400: "#969ca7",
          300: "#c2c6cd",
          200: "#dcdfe3",
          100: "#e9ebed",
          50: "#f3f3ef",
        },
        canvas: "#f1f0ea",
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Fraunces"', "Georgia", "ui-serif", "serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        glass: "0 8px 32px -8px rgba(15,23,42,0.18), inset 0 1px 0 0 rgba(255,255,255,0.6)",
        "glass-lg": "0 24px 64px -20px rgba(15,23,42,0.28), inset 0 1px 0 0 rgba(255,255,255,0.7)",
        glow: "0 10px 40px -8px rgba(205,242,74,0.45)",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0) rotate(0deg)" },
          "50%": { transform: "translateY(-18px) rotate(2deg)" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translateY(0) translateX(0)" },
          "50%": { transform: "translateY(14px) translateX(-10px)" },
        },
        "blob-drift": {
          "0%, 100%": { transform: "translate(0,0) scale(1)" },
          "33%": { transform: "translate(30px,-20px) scale(1.06)" },
          "66%": { transform: "translate(-20px,18px) scale(0.96)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "0.6", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.04)" },
        },
        eq: {
          "0%, 100%": { transform: "scaleY(0.4)" },
          "50%": { transform: "scaleY(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "spin-slow": { to: { transform: "translate(-50%,-50%) rotate(360deg)" } },
        "score-pop": {
          "0%": { opacity: "0", transform: "scale(0.8)" },
          "60%": { transform: "scale(1.05)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        float: "float 7s ease-in-out infinite",
        "float-slow": "float-slow 9s ease-in-out infinite",
        "blob-drift": "blob-drift 18s ease-in-out infinite",
        "fade-up": "fade-up 0.5s ease-out both",
        "pulse-soft": "pulse-soft 3s ease-in-out infinite",
        eq: "eq 0.9s ease-in-out infinite",
        shimmer: "shimmer 1.6s linear infinite",
        "spin-slow": "spin-slow 4s linear infinite",
        "score-pop": "score-pop 0.7s cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [],
};
