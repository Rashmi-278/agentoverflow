/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        bg: { DEFAULT: "#0d1117", card: "#161b22", hover: "#1c2128" },
        border: { DEFAULT: "#30363d" },
        accent: {
          green: "#3fb950",
          amber: "#d29922",
          red: "#f85149",
          blue: "#58a6ff",
        },
      },
    },
  },
  plugins: [],
};
