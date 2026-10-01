/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  future: {
    // hover-стили только там, где устройство умеет наводить курсор:
    // на тач-экранах «залипание» при тапе исчезает.
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      colors: {
        // Стол зелёного сукна — основной фон приложения
        felt: {
          900: '#06120d',
          800: '#0b1f17',
          700: '#0f2a1f',
          600: '#143527',
          500: '#1b4432',
        },
        // Золото акцентов: карты, кнопки, выигрыши
        gold: {
          300: '#f0d9a8',
          400: '#e3a93c',
          500: '#c98a24',
          600: '#9c6a17',
        },
        cardred: '#c0392b',
        cardblack: '#16130f',
        // Карта — самый заметный объект на столе, у неё своя палитра.
        // CardView написан под эти имена, поэтому токены обязаны существовать.
        cardface: '#fdfcf8',
        deepred: '#b5302a',
        cardink: '#16130f',
        cream: '#f0e6d2',
      },
      spacing: {
        // Tailwind не знает 13: ширина карты среднего размера.
        13: '3.25rem',
      },
      fontFamily: {
        display: ['Unbounded', 'system-ui', 'sans-serif'],
        body: ['Rubik', 'system-ui', 'sans-serif'],
        card: ['Georgia', 'Times New Roman', 'serif'],
      },
      boxShadow: {
        card: '0 2px 4px rgba(0,0,0,.3), 0 8px 20px -6px rgba(0,0,0,.5)',
        cardlift: '0 6px 12px rgba(0,0,0,.35), 0 20px 40px -10px rgba(0,0,0,.6)',
        panel: '0 20px 60px -20px rgba(0,0,0,.75)',
        glowgold: '0 0 0 1px rgba(227,169,60,.5), 0 0 28px -4px rgba(227,169,60,.35)',
      },
      keyframes: {
        deal: {
          '0%': { opacity: '0', transform: 'translate(-50%,-50%) rotate(-16deg) scale(.72)' },
          '100%': { opacity: '1', transform: 'translate(-50%,-50%) rotate(0deg) scale(1)' },
        },
        pulseRing: {
          '0%': { transform: 'scale(.9)', opacity: '.9' },
          '70%': { transform: 'scale(1.5)', opacity: '0' },
          '100%': { transform: 'scale(1.5)', opacity: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-300% 0' },
          '100%': { backgroundPosition: '300% 0' },
        },
        floatUp: {
          '0%': { opacity: '0', transform: 'translateY(6px) scale(.9)' },
          '20%': { opacity: '1', transform: 'translateY(0) scale(1.06)' },
          '100%': { opacity: '0', transform: 'translateY(-14px) scale(1)' },
        },
      },
      animation: {
        deal: 'deal .42s cubic-bezier(.22,1,.36,1) both',
        pulsering: 'pulseRing 1.5s ease-out infinite',
        shimmer: 'shimmer 2.6s linear infinite',
        floatup: 'floatUp 1.1s ease-out both',
      },
    },
  },
  plugins: [],
};
