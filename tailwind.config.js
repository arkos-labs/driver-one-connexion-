/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Design System ONE CONNEXION - Harmonisé avec le dashboard client */
        ink: "#0E0F10",           /* Noir mat - texte principal */
        paper: "#F4F2EE",          /* Blanc cassé - fond principal */
        "paper-card": "#FBFAF8",   /* Blanc cassé clair - cartes */
        line: "#DFDCD6",           /* Gris clair - bordures */
        muted: "#4A4845",          /* Gris - texte secondaire */
        label: "#8C8882",          /* Gris - labels */
        accent: "#ed5518",         /* Orange - boutons/CTA */
        "accent-dark": "#c94410",  /* Orange foncé - hover */
      },
      borderRadius: {
        brand: "2px",              /* Radius minimaliste */
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "SF Pro Text",
          "SF Pro Display",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
