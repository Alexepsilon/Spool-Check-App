/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Status colours match the project plan's legend.
        status: {
          expected: '#9ca3af', // grey
          verified: '#16a34a', // green
          missing: '#dc2626', // red
          damaged: '#ea580c', // orange
          wrong: '#7c3aed', // purple
          pending: '#f59e0b', // amber (transient during scan)
        },
        primary: '#1e5f8e',
        accent: '#26a65b',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
