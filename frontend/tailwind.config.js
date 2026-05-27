/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0f1117',
        panel: '#121826',
        panel2: '#0b1220',
        border: '#1f2937',
        text: '#e2e8f0',
        muted: '#94a3b8',
        accent: '#60a5fa',
        danger: '#f87171',
      },
      boxShadow: {
        soft: '0 10px 30px rgba(0,0,0,0.35)',
      },
    },
  },
  plugins: [],
}

