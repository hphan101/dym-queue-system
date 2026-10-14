/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dym: {
          blue: {
            50: '#eff9fd',
            100: '#d3f0fc',
            500: '#63c4e8',
            600: '#4eb3d8',
            700: '#39a2c8',
            800: '#111833',
            900: '#0d1227',
          },
          accent: {
            50: '#fffbeb',
            500: '#f59e0b',
            600: '#d97706',
          }
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
