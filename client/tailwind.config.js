/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Use CSS variables so Tailwind classes auto-switch with theme
        slate: {
          50:  'rgb(var(--color-slate-50) / <alpha-value>)',
          100: 'rgb(var(--color-slate-100) / <alpha-value>)',
          200: 'rgb(var(--color-slate-200) / <alpha-value>)',
          300: 'rgb(var(--color-slate-300) / <alpha-value>)',
          400: 'rgb(var(--color-slate-400) / <alpha-value>)',
          500: 'rgb(var(--color-slate-500) / <alpha-value>)',
          600: 'rgb(var(--color-slate-600) / <alpha-value>)',
          700: 'rgb(var(--color-slate-700) / <alpha-value>)',
          800: 'rgb(var(--color-slate-800) / <alpha-value>)',
          900: 'rgb(var(--color-slate-900) / <alpha-value>)',
          950: 'rgb(var(--color-slate-950) / <alpha-value>)',
        },
        white: 'rgb(var(--color-white) / <alpha-value>)',
        black: 'rgb(var(--color-black) / <alpha-value>)',
        cyan: {
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
        },
        amber: {
          400: 'rgb(var(--color-amber-400) / <alpha-value>)',
          500: 'rgb(var(--color-amber-500) / <alpha-value>)',
          600: 'rgb(var(--color-amber-600) / <alpha-value>)',
        },
        // Semantic status colors
        status: {
          error:   'var(--status-error)',
          warning: 'var(--status-warning)',
          success: 'var(--status-success)',
          info:    'var(--status-info)',
        },
        // Legacy bastion colors (backward compat for config references)
        bastion: {
          deep: 'rgb(var(--color-slate-950) / <alpha-value>)',
          page: 'rgb(var(--color-slate-900) / <alpha-value>)',
          surface: 'rgb(var(--color-slate-800) / <alpha-value>)',
          elevated: 'rgb(var(--color-slate-700) / <alpha-value>)',
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
      backgroundSize: { grid: '32px 32px' },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'pulse-soft': 'pulseSoft 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(12px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        pulseSoft: { '0%, 100%': { opacity: '0.4' }, '50%': { opacity: '0.8' } },
      },
    },
  },
  plugins: [],
};
