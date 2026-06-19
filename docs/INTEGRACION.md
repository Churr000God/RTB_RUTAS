# Integración con Supabase — Despacho RTB

Guía para pasar el optimizador de su almacenamiento local (`window.storage`) a Supabase,
y dejarlo corriendo en un Raspberry Pi de la red interna.

Arquitectura: **SPA estática (Vite + React) servida por el Pi → habla directo a Supabase con `supabase-js` (anon key) + RLS.**
El Pi solo sirve archivos; el backend es Supabase. Requiere internet para alcanzar Supabase.

---

## 1. Esquema en Supabase

1. Dashboard → **SQL Editor** → New query.
2. Pega y ejecuta todo `schema.sql`.
3. Verifica en **Table Editor** que aparezcan `puntos` y `recorridos`, ambas con el candado de RLS activo.

## 2. Activar el login (Auth)

Como las policies son `to authenticated`, la app necesita un usuario que inicie sesión.

1. Dashboard → **Authentication → Providers → Email**: actívalo. Para uso interno, desactiva
   "Confirm email" para no lidiar con correos de confirmación.
2. **Authentication → Users → Add user**: crea una cuenta compartida del área, p. ej.
   `despacho@rtb.local` con una contraseña. Comparte ese login con el personal autorizado.

## 3. Tus dos valores (no me los mandes; van en tu `.env`)

Dashboard → **Project Settings → API**:

- **Project URL** → `https://TUREF.supabase.co`
- **Project API keys → `anon` `public`** → la llave que empieza con `eyJ...`

> ⚠️ La llave `service_role` y la contraseña de la DB **no** van en el cliente ni se comparten. Nunca.

Crea un archivo `.env` en la raíz del proyecto:

```
VITE_SUPABASE_URL=https://TUREF.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...tu_anon_public...
```

## 4. Proyecto Vite (si aún no lo tienes)

```bash
npm create vite@latest rtb-rutas -- --template react
cd rtb-rutas
npm install @supabase/supabase-js recharts lucide-react

# Tailwind (la UI usa clases de Tailwind)
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

En `tailwind.config.js` pon `content: ["./index.html", "./src/**/*.{js,jsx}"]`,
y en `src/index.css` agrega las tres directivas `@tailwind base; @tailwind components; @tailwind utilities;`.

Luego:
- Copia `supabase.js` a **`src/lib/supabase.js`**.
- Copia el componente del optimizador a **`src/App.jsx`** y aplícale los cambios de la sección 5.

## 5. Cambios en el componente (`App.jsx`)

Son pocos y localizados. El resto del archivo (algoritmos TSP, UI, análisis de ahorro) no se toca.

### 5.1 Imports (arriba del archivo)

```jsx
import {
  getSession, signIn, signOut, onAuth,
  getPuntos, addPunto, removePunto,
  getRecorridos, addRecorrido, removeRecorrido, replaceAll,
} from "./lib/supabase";
```

Puedes **borrar** el objeto `mem` / `store` y la función `migrateLegacy` (ya no se usan).

### 5.2 Estado + carga + handlers (dentro de `OptimizadorRutas`, reemplaza el bloque de persistencia)

```jsx
const [loaded, setLoaded] = useState(false);
const [session, setSession] = useState(null);
const [points, setPoints] = useState([]);
const [recorridos, setRecorridos] = useState([]);

const refresh = useCallback(async () => {
  const [p, r] = await Promise.all([getPuntos(), getRecorridos()]);
  setPoints(p); setRecorridos(r);
}, []);

useEffect(() => {
  let sub;
  (async () => {
    const s = await getSession();
    setSession(s);
    if (s) await refresh();
    setLoaded(true);
    sub = onAuth(async (ns) => {
      setSession(ns);
      if (ns) await refresh();
      else { setPoints([]); setRecorridos([]); }
    });
  })();
  return () => sub?.data?.subscription?.unsubscribe?.();
}, [refresh]);

// Reemplazan a savePoints / saveRecorridos:
const onAddPunto     = async (p)    => { await addPunto(p);     await refresh(); };
const onRemovePunto  = async (id)   => { await removePunto(id); await refresh(); };
const onAddRecorrido = async (r)    => { await addRecorrido(r); await refresh(); };
const onReplaceAll   = async (p, r) => { await replaceAll(p, r); await refresh(); };
```

### 5.3 Compuerta de login (antes del `return` principal)

```jsx
if (!loaded) return <div className="flex min-h-[400px] items-center justify-center bg-slate-950 text-slate-500">Cargando…</div>;
if (!session) return <LoginGate />;
```

Y agrega este componente al archivo:

```jsx
function LoginGate() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const go = async () => {
    setErr("");
    try { await signIn(email.trim(), pw); }
    catch { setErr("Credenciales incorrectas."); }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900/70 p-6">
        <h1 className="mb-1 text-lg font-bold text-slate-100">Despacho RTB</h1>
        <p className="mb-4 text-xs text-slate-500">Inicia sesión para continuar</p>
        <div className="space-y-3">
          <input className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" placeholder="correo" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" placeholder="contraseña" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
          {err && <p className="text-xs text-rose-400">{err}</p>}
          <button onClick={go} className="w-full rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400">Entrar</button>
        </div>
      </div>
    </div>
  );
}
```

(Opcional) un botón de salir en el header:
```jsx
<button onClick={signOut} className="ml-2 text-xs text-slate-500 hover:text-slate-300">Salir</button>
```

### 5.4 Props en el render de pestañas

```jsx
{tab === "puntos"    && <PuntosTab points={points} onAddPunto={onAddPunto} onRemovePunto={onRemovePunto} />}
{tab === "registrar" && <RegistrarTab points={points} onAddRecorrido={onAddRecorrido} />}
{tab === "ahorro"    && <AhorroTab points={points} recorridos={recorridos} />}
{tab === "matriz"    && <MatrizTab points={points} segments={obs.segments} />}
{tab === "optimizar" && <OptimizarTab points={points} segments={obs.segments} waits={obs.waits} />}
{tab === "datos"     && <DatosTab points={points} recorridos={recorridos} onReplaceAll={onReplaceAll} />}
```

### 5.5 Ajustes mínimos en las pestañas

**PuntosTab** — firma `({ points, onAddPunto, onRemovePunto })`:
```jsx
const add = async () => {
  if (!name.trim()) return;
  await onAddPunto({ name: name.trim(), type, lat: lat ? parseFloat(lat) : null, lng: lng ? parseFloat(lng) : null });
  setName(""); setLat(""); setLng("");
};
const remove = async (id) => { await onRemovePunto(id); };  // el cascade ahora vive en la capa de datos
```

**RegistrarTab** — firma `({ points, onAddRecorrido })`. En `save`, cambia la línea que guardaba el arreglo por:
```jsx
await onAddRecorrido({ dateISO: date, ts, stops });
```

**DatosTab** — firma `({ points, recorridos, onReplaceAll })`:
```jsx
// importar:
const d = JSON.parse(r.result);
await onReplaceAll(d.points || [], d.recorridos || []);
// borrar todo:
await onReplaceAll([], []);
```

## 6. Build y despliegue en el Raspberry Pi

```bash
npm run build          # genera ./dist
```

Copia `dist/` al Pi y sírvelo con **Caddy** (o nginx). Ejemplo de `Caddyfile`:

```
rtb-rutas.local {
  root * /var/www/rtb-rutas/dist
  file_server
  try_files {path} /index.html   # rutas SPA
}
```

Como ya tienes **Pi-hole**, agrégale un registro de DNS local
(*Local DNS → DNS Records*): `rtb-rutas.local → 192.168.10.X` (la IP del Pi),
y toda la oficina entra por nombre sin tocar archivos hosts.

> Recordatorio: la app necesita internet para llegar a Supabase. Si quieres
> que funcione 100% local, habría que auto-hospedar Supabase (mejor en tu VPS
> de Hetzner que en el Pi 4) — lo vemos aparte si te interesa.

## 7. Checklist de seguridad

- [ ] RLS activo en `puntos` y `recorridos` (lo deja el `schema.sql`).
- [ ] En el cliente solo la **anon public** key. La `service_role` jamás.
- [ ] El `.env` no se sube a git (agrégalo a `.gitignore`).
- [ ] Email Auth activo y un usuario creado; sin login, la app no lee ni escribe nada.

## 8. Migrar tus datos de prueba

Si ya capturaste recorridos en la versión local: pestaña **Datos → Exportar JSON**
en la versión vieja, y **Datos → Importar JSON** en la nueva (ya conectada). Listo.
