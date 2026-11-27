/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ['"Noto Sans"', '"Noto Sans Devanagari"', "system-ui", "sans-serif"] },
      colors: { khata: { 50: "#fdf8ef", 100: "#f8ecd4", 500: "#c2741f", 600: "#a65d14", 700: "#844711", 900: "#3d220b" } },
    },
  },
  plugins: [],
};
