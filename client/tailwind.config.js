/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bastion: {
          deep: '#060a12',
          page: '#0a101c',
          surface: '#111827',
          elevated: '#1a2332',
          border: 'rgba(148, 163, 184, 0.12)',
          accent: '#06b6d4',
          'accent-light': '#22d3ee',
          muted: '#64748b',
        },
      },
      boxShadow: {
        glow: '0 0 24px rgba(6, 182, 212, 0.12)',
        'glow-sm': '0 0 12px rgba(6, 182, 212, 0.08)',
        panel: '0 4px 24px rgba(0, 0, 0, 0.25)',
        'panel-lg': '0 8px 40px rgba(0, 0, 0, 0.35)',
      },
      backgroundImage: {
        'grid-pattern':
          'linear-gradient(rgba(6, 182, 212, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(6, 182, 212, 0.03) 1px, transparent 1px)',
        'gradient-radial': 'radial-gradient(ellipse at top, rgba(6, 182, 212, 0.08), transparent 60%)',
      },
      backgroundSize: {
        grid: '32px 32px',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'pulse-soft': 'pulseSoft 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.8' },
        },
      },
    },
  },
  plugins: [],
};
