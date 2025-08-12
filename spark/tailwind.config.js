/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("nativewind/preset")],
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Brand palette
        brand: {
          50:  "#eef6ff",
          100: "#d9eaff",
          200: "#b6d6ff",
          300: "#88bbff",
          400: "#5a9dff",
          500: "#357fff",   // primary
          600: "#2a67db",
          700: "#214fb0",
          800: "#1c428f",
          900: "#183871",
        },
        // Semantic
        success: { 500: "#16a34a", 600: "#15803d" },
        warning: { 500: "#f59e0b", 600: "#d97706" },
        danger:  { 500: "#ef4444", 600: "#dc2626" },

        // Surfaces / text
        background: "#0b0b0f",       // default app background (dark)
        foreground: "#eaeaf0",       // default text on dark
        muted: "#9aa0b2",
        card: "#12131a",
        border: "#262738",
      },
      borderRadius: {
        xl: "16",
        "2xl": "24",
      },
      fontSize: {
        h1: 28,
        h2: 22,
        h3: 18,
        body: 16,
        caption: 13,
      },
    },
  },
};
