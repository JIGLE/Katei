/** @type {import('tailwindcss').Config} */
// Katei design tokens map directly onto Tailwind's default palette:
//   bg-zinc-950 / bg-zinc-900 / border-zinc-800 / text-zinc-100 / text-zinc-400
//   amber-500 (time & deadlines), emerald-500 (money), rose-500 (critical).
// Only the content globs and a calm Japandi font stack are customised here.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
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
