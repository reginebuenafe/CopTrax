export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'sans-serif'],
      },
      colors: {
        "green-dark": "#1b5e20",
        "green-mid": "#2e7d32",
        "green-light": "#4caf50",
        "green-pale": "#e8f5e9",
        "brown-dark": "#3e2723",
        "brown-mid": "#5d4037",
        "brown-light": "#8d6e63",
        "beige": "#faf6ee",
        "beige-dark": "#e8dcc8",
        "cream": "#fffdf7",
      },
      boxShadow: {
        'card': '0 2px 20px rgba(0,0,0,0.06)',
        'card-hover': '0 8px 30px rgba(0,0,0,0.12)',
        'glow-green': '0 0 40px rgba(76,175,80,0.25)',
        'glow-brown': '0 0 40px rgba(93,64,55,0.15)',
      },
      keyframes: {
        'bounce-slow': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        'bounce-slow': 'bounce-slow 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}