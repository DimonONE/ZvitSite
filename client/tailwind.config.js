/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#21BA6B',
        sidebar: '#1C1D21',
        background: '#F5F5F5'
      }
    },
  },
  plugins: [],
}
