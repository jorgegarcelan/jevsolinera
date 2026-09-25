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

## El experimento con Jev

**Planteamiento 1: predecir el precio a 3 días** (tendencias + Brent + lectura de titulares). Prueba del 24/07 al 21/09/2026, 7 ciudades, 95 y diésel: 75 % de aciertos frente al 82 % de "llenar siempre". Los titulares cuentan lo que ya ha pasado y no anticipan el precio. Además, elegir el día mueve de media solo 0,85 € por depósito, mientras que elegir gasolinera ahorra unos 7 €.

**Planteamiento 2 (el actual): avisar de eventos con fecha.** Jev lee unos 20 titulares al día en dos pasos y la web solo cambia el consejo cuando se anuncia algo concreto: "Llena antes del 1 de octubre", "Espera al 1 de septiembre". El resto de días dice "Hoy da igual". En la misma prueba:
- 17 avisos (día × combustible), 119 comprobaciones por zona: **todos se cumplieron**. En esos días el precio se movió de media un 5,3 % (unos 4 € por depósito), frente al 1 % de los días sin aviso.
- **Hubo movimientos que no avisó**: algunos días justo antes de los eventos del 1/08 y el 1/09.
- **Cuidado:** hay pocos eventos distintos (1/08, 1/09 diésel, 1/09 gasolina) y tres correcciones se hicieron viendo fallos de esta misma prueba (a qué combustible afecta, descuentos de fidelización, "este sábado"). La primera prueba de verdad es el aviso del 1/10.
- Coste: unas 80 preguntas y 0,6 s al día; 0,02 $ los 60 días.
- Jev no es del todo determinista: la misma pregunta puede variar unas décimas entre ejecuciones.

```bash
npx tsx --env-file=.env.local scripts/backtest.ts 60
```
