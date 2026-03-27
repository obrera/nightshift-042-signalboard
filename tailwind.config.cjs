/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#070b14',
          900: '#0c1220',
          800: '#121b2f',
          700: '#1a2941'
        },
        signal: {
          cyan: '#65e5ff',
          amber: '#f5b457',
          rose: '#ff6b93',
          mint: '#86efac'
        }
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(101, 229, 255, 0.18), 0 14px 40px rgba(7, 11, 20, 0.48)'
      },
      backgroundImage: {
        'signal-grid':
          'linear-gradient(rgba(101, 229, 255, 0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(101, 229, 255, 0.07) 1px, transparent 1px)'
      }
    }
  },
  plugins: []
};
