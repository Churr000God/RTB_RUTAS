# RTB_RUTAS · Despacho RTB — Optimizador de Rutas

Herramienta interna para **medir y optimizar las rutas de entrega y recolección**.
Aprende los tiempos reales de cada tramo a partir de los recorridos que se registran,
calcula la mejor ruta (problema del Agente Viajero, **TSP**) por **tiempo** y por **distancia**,
y mide cuánto tiempo se está desperdiciando por ruteo subóptimo.

## ¿Qué hace?

- **Optimizar** — dado un conjunto de paradas y un punto de inicio, calcula la mejor secuencia.
  Óptimo exacto (Held–Karp) hasta 12 puntos; heurística (vecino más cercano + 2-opt/Or-opt) arriba.
  Cada punto se visita una sola vez.
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
```

1. Ejecuta `supabase/schema.sql` en el SQL Editor de tu proyecto Supabase.
2. Activa Email Auth y crea un usuario (Authentication → Users).
3. Pon `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en `.env`.

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
│   ├── App.jsx           # app completa (UI + TSP + análisis de ahorro)
│   └── lib/
│       └── supabase.js   # cliente + capa de datos (auth + CRUD)
├── supabase/
│   └── schema.sql        # tablas + índices + políticas RLS
└── docs/
    └── INTEGRACION.md    # guía paso a paso
```
