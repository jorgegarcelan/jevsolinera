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

## Registro de aciertos

Cada día se guarda lo que dijo la web por provincia y combustible (la primera consulta del día, más una tarea diaria a las 9:00 para 7 ciudades grandes, en `vercel.json`). Tres días después se compara con el precio de las mismas gasolineras en el histórico del Ministerio. Si el precio no se movió, es empate y no cuenta.

- **Producción:** Upstash Redis. En Vercel → Storage → Create → *Upstash for Redis* → conectar al proyecto. Crea `KV_REST_API_URL` y `KV_REST_API_TOKEN`.
- **Local:** sin Redis, se guarda en `.data/store.json` (ignorado por git).
- **Opcional:** `CRON_SECRET` en Vercel para que solo Vercel pueda lanzar `/api/cron`.

## Compartir

`/api/og` genera la tarjeta 1200×630 para redes. Un enlace compartido (`/?v=today&f=g95&p=1.879&s=…&z=Madrid&d=…`) muestra su veredicto, gasolinera y precio. Solo lleva la provincia, nunca tus coordenadas.
