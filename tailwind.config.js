/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'system-ui', 'sans-serif'],
      },
      // Brand accent — the mobile paddle-red (#e23b3b) as a full scale so the
      // web shares the mobile palette. Anchored at 500 = brand; 50/200 mirror
      // the mobile accentSoft (#fff5f5) / accentSoftBorder (#fecaca).
      colors: {
        accent: {
          DEFAULT: '#e23b3b',
          50: '#fff5f5',
          100: '#ffe4e4',
          200: '#fecaca',
          300: '#f9a8a8',
          400: '#f16d6d',
          500: '#e23b3b',
          600: '#c92f2f',
          700: '#a82626',
          // Overlap of the two rubbers in the brand mark — see public/logo.svg.
          750: '#8e2a2a',
          800: '#8a2020',
          900: '#721c1c',
        },
      },
    },
  },
  plugins: [],
}
