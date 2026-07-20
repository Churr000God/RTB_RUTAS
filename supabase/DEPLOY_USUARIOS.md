# Despliegue del módulo de Gestión de Usuarios

Pasos a correr una sola vez en tu proyecto real de Supabase
(`defqmhnzuraqmqwrfkry`, el que está en tu `.env`). Ninguno requiere
instalar nada en la Pi ni en tu equipo — todo es Dashboard.

## 1. Base de datos (SQL Editor)

Dashboard → **SQL Editor → New query**. Pega y corre completo
[`migrations/2026-07-usuarios.sql`](./migrations/2026-07-usuarios.sql).
Es idempotente (se puede volver a correr sin romper nada).

Verifica en **Table Editor → profiles** que aparezcan las columnas nuevas
`email` y `disabled`, y que el rol de tu usuario admin siga siendo `admin`.

## 2. Edge Functions (Dashboard → Edge Functions)

Crea **tres** funciones nuevas, una por una. Para cada una: *Create a new
function* → nombre exacto de la tabla → pega el contenido íntegro del
`index.ts` correspondiente → *Deploy*. Deja **"Verify JWT"** en su valor
por default (activado) — cada función valida el JWT por su cuenta y
además exige que quien llama sea admin.

| Nombre exacto de la función | Archivo a pegar |
|---|---|
| `admin-crear-usuario` | [`functions/admin-crear-usuario/index.ts`](./functions/admin-crear-usuario/index.ts) |
| `admin-resetear-password` | [`functions/admin-resetear-password/index.ts`](./functions/admin-resetear-password/index.ts) |
| `admin-toggle-usuario` | [`functions/admin-toggle-usuario/index.ts`](./functions/admin-toggle-usuario/index.ts) |

No hay que configurar ningún secreto: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase automáticamente dentro
de cada función.

## 3. Auth → URL Configuration

Dashboard → **Authentication → URL Configuration**. Agrega a la lista de
**Redirect URLs** (o **Site URL**, según la versión del Dashboard):

```
http://100.115.160.115:8003
```

Sin esto, los enlaces de invitación y de "olvidé mi contraseña" del
correo no van a poder regresar a la app.

## 4. (Opcional) Revisar plantillas de correo

Dashboard → **Authentication → Email Templates**: revisa que "Invite
user" y "Reset password" estén en español si quieres, y que el link use
`{{ .ConfirmationURL }}` (viene así por default).

---

Con estos 3 pasos hechos, el módulo queda 100% funcional: crear
usuarios, resetear contraseñas, deshabilitar/habilitar cuentas, y que
cada quien cambie su propio nombre/contraseña desde **Mi cuenta**.

## Troubleshooting: invitación falla con `{} (HTTP 400)`

Si al dar de alta un usuario ves ese error casi vacío, el motivo real
estaba oculto porque `JSON.stringify({ error: undefined })` produce
`{}` — algunos errores de Supabase (Auth/Postgrest) no traen `.message`.
Ya está resuelto (helper `errMsg()` en `admin-crear-usuario/index.ts`,
que además loguea el detalle con `console.error` — visible en Dashboard
→ Edge Functions → `admin-crear-usuario` → **Logs**).

Con ese log real a la vista, la causa más común es un
**`AuthRetryableFetchError` con `status: 504`**: el servidor de Auth se
cuelga esperando el envío del correo de invitación. Verificá
**Authentication → Settings → SMTP Settings**:

- **Port number** debe ser `587` (STARTTLS) o `465` (TLS implícito).
  Un puerto que no escucha en tu servidor de correo (o un typo, p. ej.
  `585`) hace que la conexión se cuelgue hasta expirar → 504.
- El **Username**/contraseña deben corresponder exactamente a la
  casilla configurada como remitente (revisar que no sea la de otra
  cuenta de correo del dominio).

Para aislar si el problema es el SMTP en general (y no la Edge
Function): Dashboard → **Authentication → Users → Invite user** con el
mismo correo. Si también falla ahí, es 100% configuración de SMTP, no
código.
