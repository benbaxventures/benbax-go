/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#111827',
        muted: '#5B6472',
        canvas: '#F7F8FA',
        primary: '#0E7C66',
        accent: '#FFB020'
      }
    }
  },
  plugins: []
};
