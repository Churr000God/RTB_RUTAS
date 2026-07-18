# RTB_RUTAS · Despacho RTB — Optimizador de Rutas

Herramienta interna para **medir y optimizar las rutas de entrega y recolección**.
Aprende los tiempos reales de cada tramo a partir de los recorridos que se registran,
calcula la mejor ruta (problema del Agente Viajero, **TSP**) por **tiempo** y por **distancia**,
y mide cuánto tiempo se está desperdiciando por ruteo subóptimo.

## ¿Qué hace?

- **Generación y carga de rutas** (antes "Optimizar") — dado un conjunto de paradas y un punto de
  inicio, calcula la mejor secuencia (óptimo exacto Held–Karp hasta 12 puntos; heurística vecino más
  cercano + 2-opt/Or-opt arriba) y permite **reordenarla a mano** (arrastrar o botones ↑/↓) con
  recálculo instantáneo y comparación contra el óptimo, **anclar paradas** a una posición fija,
  verla en un **mapa** con pines numerados y línea de secuencia, y calcular **ETA por parada y hora
  de regreso** a partir de una hora de inicio. La acción final es **asignar la ruta a un chofer**
  (obligatorio, con aviso si ya tiene una ruta esa fecha) o guardarla como plantilla sin asignar; el
  chofer la inicia desde su Ruta del día.
- **Ruta del día (ejecución)** — el chofer ve su ruta asignada con un resumen siempre visible
  (progreso, cronómetro, hora estimada de término, mapa) desde antes de iniciar. Elige el siguiente
  punto con el **orden sugerido resaltado** (recalculable con "Re-sugerir orden"), puede **cambiar de
  destino** mientras va en camino (antes de llegar), y ya en la parada registra **nota** y **estado de
  entrega** (entregado/recolectado/no se pudo) además de km y comida/pausa, con mapa y botón directo
  a Google Maps. Guarda el progreso también en el teléfono (**caché offline**) para no perderlo si se
  cae la conexión, con indicador de conexión y re-sincronización automática. Permite **deshacer la
  última acción** y muestra un **resumen detallado** al terminar. Un chofer solo puede tener una ruta
  en ejecución a la vez (aunque se le puedan asignar varias).
- **Registrar recorrido** — captura el recorrido real (tiempos de manejo, distancias y esperas). Alimenta el aprendizaje.
- **Matriz aprendida** — tiempos punto a punto con su nivel de confianza (`×N` = nº de observaciones), filtrable por día de la semana.
- **Análisis de ahorro** — compara tu orden real vs. el orden óptimo con la misma matriz, aislando el desperdicio de ruteo y mostrando su evolución en el tiempo.

## Stack

- **Frontend:** React + Vite + Tailwind CSS, gráficas con Recharts, íconos Lucide.
- **Backend:** Supabase (Postgres + Auth + API REST). El cliente habla con Supabase vía `@supabase/supabase-js`.
- **Despliegue previsto:** SPA estática servida desde un Raspberry Pi en la red interna.

## Arranque rápido

```bash
npm install
cp .env.example .env      # rellena con TUS valores de Supabase (anon public key)
npm run dev               # desarrollo
npm run build             # producción → ./dist
npm run test               # pruebas unitarias (Vitest) del núcleo de ruteo
```

1. Ejecuta `supabase/schema.sql` en el SQL Editor de tu proyecto Supabase.
2. Ejecuta también los parches en `supabase/migrations/` (uno por módulo, fechados; son idempotentes).
3. Activa Email Auth y crea un usuario (Authentication → Users).
4. Pon `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en `.env`.

La guía completa de integración y despliegue está en **[`docs/INTEGRACION.md`](docs/INTEGRACION.md)**.

## Seguridad

- En el cliente solo va la llave **anon public**. La `service_role` y la contraseña de la DB **nunca**.
- **Row Level Security** activo: sin login no se lee ni se escribe nada.
- `.env` está en `.gitignore`. No subas llaves al repositorio.

## Estructura

```
.
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── .env.example
├── src/
│   ├── main.jsx
│   ├── index.css
│   ├── App.jsx              # UI (pestañas, componentes) + análisis de ahorro
│   ├── components/
│   │   ├── LeafletMap.jsx   # mapa de un punto (alta/edición), lazy
│   │   └── RouteMap.jsx     # mapa de una ruta completa (pines numerados + línea), lazy
│   └── lib/
│       ├── supabase.js         # cliente + capa de datos (auth + CRUD)
│       ├── routing.js          # TSP (con anclajes), matrices, métricas, ETA — sin React, testeable
│       ├── routing.test.js     # pruebas unitarias (Vitest)
│       ├── rutaDiaCache.js     # caché offline de la ruta en curso (localStorage) — sin React, testeable
│       └── rutaDiaCache.test.js
├── supabase/
│   ├── schema.sql           # tablas + índices + políticas RLS (fuente de verdad, instalación nueva)
│   └── migrations/          # parches incrementales fechados, uno por módulo
└── docs/
    └── INTEGRACION.md       # guía paso a paso
```
