/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#D4A574',
        primarydark: '#95704A',
        surface: '#F5F5F5',
        card: '#FFFFFF',
        ink: '#1A1A1A',
        muted: '#666666',
      },
      boxShadow: {
        header: '0 1px 0 rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
        card: '0 2px 12px rgba(0, 0, 0, 0.06)',
        'card-hover': '0 8px 24px rgba(212, 165, 116, 0.22)',
      },
      keyframes: {
        'page-slide': {
          '0%': { opacity: '0.92', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'tab-content': {
          '0%': { opacity: '0', transform: 'translateX(10px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'modal-backdrop': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'modal-sheet': {
          '0%': { opacity: '0', transform: 'translateY(18px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'card-rise': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'cart-bounce': {
          '0%, 100%': { transform: 'scale(1)' },
          '35%': { transform: 'scale(1.22)' },
          '55%': { transform: 'scale(1.08)' },
        },
        'empty-bob': {
          '0%, 100%': { transform: 'translateY(0) rotate(-2deg)' },
          '50%': { transform: 'translateY(-8px) rotate(2deg)' },
        },
        'success-check': {
          '0%': { transform: 'scale(0.5)', opacity: '0' },
          '55%': { transform: 'scale(1.12)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        'page-slide': 'page-slide 0.38s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'tab-content': 'tab-content 0.28s ease-out forwards',
        'modal-backdrop': 'modal-backdrop 0.28s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'modal-sheet': 'modal-sheet 0.36s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'card-rise': 'card-rise 0.42s cubic-bezier(0.22, 1, 0.36, 1) both',
        'cart-bounce': 'cart-bounce 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'empty-bob': 'empty-bob 2.8s ease-in-out infinite',
        'success-check': 'success-check 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both',
      },
    },
  },
  plugins: [],
};
