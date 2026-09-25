# jevsolinera

¿Echo gasolina hoy o espero? ¿Y dónde?

- **Precios**: API oficial del Ministerio (Geoportal de Gasolineras), actual + histórico por provincia (1, 3, 7, 14 y 30 días).
- **Señales**: titulares recientes (Google News) y crudo Brent.
- **Decisión**: [Jev](https://docs.typesafe.ai) de TypeSafe AI. El código calcula las tendencias y las pasa como etiquetas (Jev no es buena con números); Jev responde a 4 preguntas tipadas (`decision`, `rise_3d`, `news_outlook`, `deadline`) con probabilidades calibradas. El nivel del depósito se aplica en código.
- Sin `TYPESAFE_API_KEY` usa una regla simple de respaldo.

```bash
cp .env.example .env.local   # pon tu TYPESAFE_API_KEY
npm install && npm run dev
```

Estilo: gasolinera americana de los 60 (`app/theme.css`). Fuentes: Big Shoulders, Yellowtail y DM Sans.
