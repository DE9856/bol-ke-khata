/** @type {import('tailwindcss').Config} */
// Design tokens. "Purane khate ki simplicity": ivory paper, forest-green ink, sage, and two
// restrained signal colours (clay red for old udhaar, amber for "waiting for you").
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", '"Noto Sans Devanagari"', "system-ui", "sans-serif"],
        serif: ["Fraunces", '"Noto Serif Devanagari"', "Georgia", "serif"],
      },
      colors: {
        paper: { 50: "#FCFAF5", 100: "#F6F1E7", 200: "#EDE6D8", 300: "#DED4C1" },
        ink: { 900: "#1A1E1B", 700: "#3B403C", 500: "#756F66", 400: "#9B948A" },
        forest: { 950: "#0C231A", 900: "#123326", 800: "#17402F", 700: "#1D4E3A", 600: "#286049", 500: "#3A7A5E" },
        sage: { 50: "#F1F4EE", 100: "#E6ECE2", 200: "#D3DECF", 300: "#B5C6AF", 500: "#7D967A" },
        clay: { 50: "#FBF1EC", 100: "#F4DFD6", 500: "#B9533D", 600: "#A3442F" },
        amber: { 50: "#FBF5E8", 100: "#F4E7C8", 500: "#C08A1E", 600: "#A57414" },
      },
      fontSize: {
        // Money is the most important information on every screen.
        hero: ["3.25rem", { lineHeight: "1", letterSpacing: "-0.035em", fontWeight: "700" }],
      },
      boxShadow: {
        lift: "0 1px 2px rgba(26,30,27,0.04), 0 8px 24px -12px rgba(26,30,27,0.18)",
        sheet: "0 -12px 40px -16px rgba(18,51,38,0.28)",
        mic: "0 10px 28px -8px rgba(29,78,58,0.55)",
      },
      transitionTimingFunction: { out: "cubic-bezier(0.22, 1, 0.36, 1)" },
    },
  },
  plugins: [],
};
