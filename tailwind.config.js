/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#EEF9F9",
          100: "#C8ECEC",
          500: "#3AABAB",
          600: "#2E9090",
          700: "#247575",
          900: "#082e22",
        },
      },
    },
  },
  plugins: [],
};
