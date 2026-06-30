/** @type {import('tailwindcss').Config} */
// Katei design tokens map directly onto Tailwind's default palette:
//   bg-zinc-950 / bg-zinc-900 / border-zinc-800 / text-zinc-100 / text-zinc-400
//   amber-500 (time & deadlines), emerald-500 (money), rose-500 (critical).
// The neutral `zinc` scale is redefined as CSS variables (see index.css) so a
// single `data-theme` flip on <html> recolours every neutral surface for the
// light theme — no per-component class changes. Accents stay default Tailwind.
const zinc = (n) => `rgb(var(--zinc-${n}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        zinc: {
          50: zinc(50),
          100: zinc(100),
          200: zinc(200),
          300: zinc(300),
          400: zinc(400),
          500: zinc(500),
          600: zinc(600),
          700: zinc(700),
          800: zinc(800),
          900: zinc(900),
          950: zinc(950),
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
