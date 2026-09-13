/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        plex: {
          DEFAULT: '#E5A00D',
          hover: '#CC8A0A',
          dark: '#1F2326',
          darker: '#131517',
          card: '#282C31',
          border: '#383D43'
        }
      }
    },
  },
  plugins: [],
}
