const sharedTailwindConfig = {
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
        display: ['"Outfit"', 'sans-serif'],
        serifAccent: ['"Playfair Display"', 'serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        magic: {
          50: '#faf5ff', 100: '#f3e8ff', 200: '#e9d5ff', 300: '#d8b4fe',
          400: '#c084fc', 500: '#a855f7', 600: '#9333ea', 700: '#7e22ce',
          800: '#6b21a8', 900: '#581c87', deep: '#1D0B36', midnight: '#140628', royal: '#2E0854'
        },
        accent: {
          pink: '#ec4899', hotpink: '#ff1493', glow: '#ff0080',
          gold: '#F4C542', amber: '#f59e0b', emerald: '#16A34A'
        },
        // Material Design 3 Dynamic Theme Tokens
        background: 'var(--color-background, #0d071a)',
        surface: 'var(--color-surface, #130a24)',
        'surface-variant': 'var(--color-surface-variant, #1f1338)',
        'surface-bright': 'var(--color-surface-bright, #2b1b4d)',
        'surface-container-lowest': 'var(--color-surface-container-lowest, #090414)',
        'surface-container-low': 'var(--color-surface-container-low, #150c29)',
        'surface-container': 'var(--color-surface-container, #1c1036)',
        'surface-container-high': 'var(--color-surface-container-high, #241544)',
        'surface-container-highest': 'var(--color-surface-container-highest, #2f1c57)',
        'on-surface': 'var(--color-on-surface, #f5f0ff)',
        'on-surface-variant': 'var(--color-on-surface-variant, #c4b5fd)',
        outline: 'var(--color-outline, #7c6d99)',
        'outline-variant': 'var(--color-outline-variant, #473b61)',
        primary: '#a855f7',
        'primary-fixed': '#c084fc',
        'primary-container': '#7e22ce',
        'on-primary': '#ffffff',
        'on-primary-container': '#f3e8ff',
        secondary: '#ec4899',
        'secondary-container': '#9d174d',
        'on-secondary': '#ffffff',
        'on-secondary-container': '#fce7f3',
        tertiary: '#10b981',
        'tertiary-fixed': '#34d399',
        'tertiary-container': '#065f46',
        'on-tertiary-container': '#d1fae5',
        error: '#ef4444',
        'error-container': '#7f1d1d',
        'on-error': '#ffffff',
        'on-error-container': '#fecaca',
      },
      spacing: {
        'space-xs': '0.25rem',
        'space-sm': '0.5rem',
        'space-md': '1rem',
        'space-lg': '1.5rem',
        'space-xl': '2rem',
      },
      fontSize: {
        'display-lg': ['2rem', { lineHeight: '2.5rem', fontWeight: '800' }],
        'headline-lg': ['1.875rem', { lineHeight: '2.25rem', fontWeight: '800' }],
        'headline-md': ['1.5rem', { lineHeight: '2rem', fontWeight: '700' }],
        'headline-sm': ['1.25rem', { lineHeight: '1.75rem', fontWeight: '600' }],
        'body-lg': ['1.125rem', { lineHeight: '1.625rem', fontWeight: '400' }],
        'body-md': ['0.9375rem', { lineHeight: '1.375rem', fontWeight: '400' }],
        'body-sm': ['0.8125rem', { lineHeight: '1.25rem', fontWeight: '400' }],
        'label-lg': ['0.875rem', { lineHeight: '1.25rem', fontWeight: '600' }],
        'label-md': ['0.75rem', { lineHeight: '1rem', fontWeight: '600' }],
        'label-sm': ['0.6875rem', { lineHeight: '0.875rem', fontWeight: '600' }],
      },
      animation: {
        'float-slow': 'floating 6s ease-in-out infinite',
        'float-delayed': 'floating 7s ease-in-out 2s infinite',
        'pulse-glow': 'pulseGlow 3s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite'
      },
      keyframes: {
        floating: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.8', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.05)', filter: 'brightness(1.2)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' }
        }
      }
    }
  }
};

if (typeof tailwind !== 'undefined') {
  tailwind.config = sharedTailwindConfig;
}
