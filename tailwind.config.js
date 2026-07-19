/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      // Paleta de marca (identidad_visual/RTB_sistema_visual.md): "teal y oro
      // seducen · navy comunica · blanco respira". Usada a fondo en PDF y
      // login, y como acentos en el resto de la app (que conserva su tablero
      // oscuro slate) — reemplaza al ámbar como color de énfasis/activo.
      // gold/teal traen una escala 50–950 (derivada por mezcla con blanco/
      // negro desde el hex de marca) para poder sustituir 1:1 los tonos y
      // modificadores de opacidad que usaba amber-* (bg-amber-900/40, etc).
      colors: {
        rtb: {
          white: "#FFFFFF",
          surface: "#EEF8F7",
          "navy-mid": "#1A5F7A",
          navy: "#002B5B",
          "teal-light": "#57C5B6",
          teal: {
            DEFAULT: "#159895",
            50: "#E8F5F4", 100: "#D0EAEA", 200: "#A1D6D5", 300: "#73C1BF", 400: "#44ADAA",
            500: "#159895", 600: "#12817F", 700: "#0E6765", 800: "#0B4F4D", 900: "#083A39", 950: "#052625",
          },
          gold: {
            DEFAULT: "#AD9551",
            50: "#F7F4EE", 100: "#EFEADC", 200: "#DED5B9", 300: "#CEBF97", 400: "#BDAA74",
            500: "#AD9551", 600: "#937F45", 700: "#766537", 800: "#5A4D2A", 900: "#42391F", 950: "#2B2514",
          },
        },
      },
      fontFamily: {
        // Titulares (Playfair) y cuerpo/datos (Inter) — ver @font-face en index.css.
        display: ['"Playfair Display"', "Georgia", "serif"],
        script: ['"Great Vibes"', "cursive"],
      },
    },
  },
  plugins: [],
};
