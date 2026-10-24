/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0F0F12',
        surface: '#17171C',
        surface2: '#1F1F26',
        line: 'rgba(255,255,255,0.07)',
        ink: { DEFAULT: '#F5F5F7', 2: '#A1A1AA', 3: '#6B6B76' },
        accent: { violet: '#8B5CF6', cyan: '#22D3EE' },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"', 'Inter', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      borderRadius: { '4xl': '2rem' },
    },
  },
  plugins: [],
}
