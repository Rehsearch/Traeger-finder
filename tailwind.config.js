/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#f0f9f6",
          100: "#d0ede5",
          500: "#1a7a5e",
          600: "#156a50",
          700: "#0f5540",
          900: "#082e22",
        },
      },
    },
  },
  plugins: [],
};
