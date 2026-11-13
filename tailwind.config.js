/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        panel: 'rgb(var(--panel) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        mute: 'rgb(var(--mute) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        violet: { 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9' },
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      boxShadow: { glow: '0 0 24px rgb(139 92 246 / .45)', soft: '0 10px 40px -12px rgb(0 0 0 / .6)' },
      keyframes: {
        radar: { '0%': { transform: 'scale(.3)', opacity: '.8' }, '100%': { transform: 'scale(1.6)', opacity: '0' } },
        pop: { '0%': { transform: 'scale(.4)', opacity: '0' }, '60%': { transform: 'scale(1.12)', opacity: '1' }, '100%': { transform: 'scale(1)' } },
        rise: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
      },
      animation: {
        radar: 'radar 2.2s ease-out infinite', pop: 'pop .5s cubic-bezier(.2,.9,.3,1.3) both', rise: 'rise .45s ease both',
        shimmer: 'shimmer 1.4s infinite', floaty: 'floaty 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
