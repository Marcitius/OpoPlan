# Desplegar OpoPlan en Cloudflare Pages y Supabase

## 0. Subir el código

Descomprime `OpoPlan-codigo.zip`. Sube el contenido de la carpeta `OpoPlan` a la raíz de `Marcitius/OpoPlan` con GitHub Desktop/git o con Add file → Upload files. Debes ver `package.json`, `src/` y `supabase/` en la raíz. No subas el ZIP como único archivo.

Si prefieres publicar sin configurar GitHub, el paquete `OpoPlan-cloudflare.zip` contiene los archivos de `dist` listos para Cloudflare Pages → Direct Upload. Esta compilación muestra la pantalla de conexión inicial, donde introduces la clave pública de Supabase por dispositivo. Para actualizaciones automáticas y configuración única, utiliza el repositorio y las variables de compilación.

## 1. Base de datos independiente

Proyecto: **OpoPlan**, referencia `kavehkjbwyycthpfsngz`, URL `https://kavehkjbwyycthpfsngz.supabase.co`.

No ejecutes estos archivos en OpoGC ni en un proyecto con tablas del mismo nombre. Esta es una instalación inicial, no una migración desde otra aplicación.

Elige **una** vía de instalación:

### SQL Editor, sin instalar herramientas

En el dashboard de Supabase OpoPlan, abre SQL Editor → New query. Copia el contenido de [`supabase/INSTALL.sql`](../supabase/INSTALL.sql) y ejecútalo. Es una sola transacción: si hay un error se revierte toda la instalación. Incluye cinco migraciones versionadas, restricciones, índices, RLS, programación de memoria y el RPC de sincronización.

Una instalación correcta crea 14 tablas en `public`, todas con RLS. Guarda el resultado de la ejecución. El archivo de instalación solo debe ejecutarse una vez; para actualizaciones posteriores aplica únicamente nuevas migraciones.

### Supabase CLI

Desde el repositorio, con Supabase CLI instalado desde su distribución oficial:

```sh
supabase login
supabase link --project-ref kavehkjbwyycthpfsngz
supabase db push
```

Introduce las credenciales únicamente cuando la herramienta oficial las solicite. Si elegiste SQL Editor, no hagas después un `db push` de estas mismas migraciones: tendrías que marcar primero sus versiones como aplicadas en el historial del CLI. Consulta las instrucciones oficiales de `supabase migration repair` para ese caso.

En Settings → API Keys copia la **publishable key pública** (`sb_publishable_…`). Se admite también la antigua clave pública `anon`; se rechazan las claves secret y service_role en el cliente.

## 2. Cloudflare Pages desde GitHub

En Cloudflare, Workers & Pages → Create application → Pages → Import an existing Git repository. Selecciona `Marcitius/OpoPlan` y la rama `main`.

| Configuración          | Valor                                   |
| ---------------------- | --------------------------------------- |
| Framework              | Vite                                    |
| Build command          | `npm run build`                         |
| Build output directory | `dist`                                  |
| Root directory         | raíz del repositorio                    |
| Node                   | `NODE_VERSION=22`                       |
| Dominio inicial        | el `.pages.dev` asignado por Cloudflare |

Variables **de compilación** (Production y Preview, si también usarás esa versión):

```text
VITE_SUPABASE_URL=https://kavehkjbwyycthpfsngz.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=tu_clave_publica
VITE_VAPID_PUBLIC_KEY=solo_si_configuras_push
```

La clave pública está diseñada para publicarse en el frontend; el acceso a datos depende de Auth, RLS y del RPC, no de ocultar esa clave. No añadas claves administrativas entre las variables `VITE_`.

Publica y espera al estado Successful. Cada push a `main` generará otra compilación. `public/_headers` se copia a `dist/_headers`, con CSP, bloqueo de iframes y caché apropiada. Pages ofrece el fallback SPA cuando no hay un `404.html`; el proyecto no lo incluye. Usa la URL HTTPS asignada. Puedes conectar un dominio propio posteriormente desde Custom domains.

También existe `wrangler.jsonc` para despliegue directo de la carpeta `dist` con Wrangler Pages. No hace falta un Worker ni una base de datos de Cloudflare; toda la información privada reside en Supabase.

Si cambias variables `VITE_`, vuelve a desplegar: Vite las incorpora durante la compilación. Si faltan URL o clave, aparece una pantalla de configuración por dispositivo; para el uso habitual en varios dispositivos es preferible configurarlas en Cloudflare.

## 3. Autenticación

En Supabase → Authentication → URL Configuration:

- Site URL: la URL HTTPS real de producción asignada por Cloudflare.
- Redirect URLs: esa URL raíz y cualquier dominio propio exacto que vayas a utilizar.
- Para desarrollo local, añade `http://localhost:4173` si lo necesitas.

No uses comodines amplios para dominios ajenos. Mantén el proveedor Email habilitado. El flujo de registro respeta la confirmación por correo: si está activada, el usuario debe confirmar antes de entrar. Recuperación de contraseña utiliza el mismo origen permitido.

Configura SMTP propio si necesitas entregabilidad y límites de correo mayores que los del emisor de desarrollo de Supabase. Los niveles gratuitos de ambos proveedores tienen cuotas; revisa sus paneles antes de aumentar el uso.

Crea tu cuenta, configura oposición/objetivos, importa el temario y registra una sesión real. Comprueba que el indicador pase de cambios pendientes a Sincronizado. Abre la misma URL y cuenta en otro navegador y comprueba esos datos.

## 4. Instalar la PWA

En iPhone/iPad, abre la URL HTTPS en Safari → Compartir → Añadir a pantalla de inicio → Añadir. Abre el icono OpoPlan e inicia sesión. En Mac/Windows usa la opción de instalación del navegador compatible. El primer acceso, el registro y el inicio de sesión necesitan conexión.

Antes de depender del modo offline, abre la aplicación una vez con conexión y espera a que el service worker instale los archivos. Prueba una sesión corta sin conexión, cierra y abre la PWA, recupera el registro y reconecta. Comprueba Sincronizado antes de borrar datos del navegador o cambiar de dispositivo.

## 5. Push opcional

Los avisos dentro de Hoy y la exportación `.ics` funcionan sin un emisor push. Para enviar avisos con la aplicación cerrada necesitas configurar la infraestructura siguiente. Su recepción en dispositivos físicos sigue pendiente de comprobar.

Genera un par VAPID localmente con la herramienta oficial del paquete `web-push`:

```sh
npx web-push generate-vapid-keys
```

Guarda la clave privada fuera del repositorio. En Supabase → Edge Functions → Secrets configura:

| Secreto del servidor | Uso                                             |
| -------------------- | ----------------------------------------------- |
| `VAPID_PUBLIC_KEY`   | clave pública del mismo par que usa el frontend |
| `VAPID_PRIVATE_KEY`  | firma VAPID, solo servidor                      |
| `VAPID_SUBJECT`      | contacto válido, por ejemplo `mailto:tu-correo` |
| `CRON_SECRET`        | token aleatorio exclusivo para el cron          |

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los proporciona el entorno de Edge Functions. La service role nunca se introduce en Cloudflare ni en la PWA.

Despliega:

```sh
supabase functions deploy send-reminders --project-ref kavehkjbwyycthpfsngz
```

La función utiliza `verify_jwt=false` porque la invoca el cron; exige un POST con la cabecera `x-cron-secret`, comparada de forma segura. Nunca compartas ese token. Habilita Cron (`pg_cron`) y `pg_net` y configura una invocación cada 15 minutos. Guarda el token en Supabase Vault con el nombre `opoplan_cron_secret`; usa tu token real en Vault, no lo incluyas en SQL compartido.

Consulta de programación, después de crear el secreto de Vault:

```sql
select cron.schedule(
 'opoplan-reminders', '*/15 * * * *',
 $$select net.http_post(
   url := 'https://kavehkjbwyycthpfsngz.supabase.co/functions/v1/send-reminders',
   headers := jsonb_build_object(
     'Content-Type', 'application/json',
     'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                       where name='opoplan_cron_secret' limit 1)),
   body := '{}'::jsonb
 );$$
);
```

En Cloudflare define `VITE_VAPID_PUBLIC_KEY`, recompila y, en la PWA, ve a Configuración → Activar push en este dispositivo. El permiso se pide al pulsar el botón. En iPhone/iPad debe abrirse la PWA añadida a inicio y usarse una versión compatible con Web Push. Prueba recepción con la app cerrada; revisa Edge Function Logs y `net._http_response` si no llega.

El emisor respeta hora/zona/configuración y cuenta repasos reales pendientes de nodos activos. Admite servicios push conocidos de Apple, Google, Mozilla y Microsoft. La entrega depende del navegador, permisos, conectividad y cuotas. No es una alarma de hora exacta ni garantiza entrega.

## 6. Comprobación con dos cuentas reales

Usa dos cuentas de prueba dedicadas ya confirmadas. Crea `.env.live` local (ignorado por git), con:

```text
TEST_SUPABASE_URL=https://kavehkjbwyycthpfsngz.supabase.co
TEST_SUPABASE_PUBLIC_KEY=clave_publica
TEST_EMAIL_A=correo_de_prueba_A
TEST_PASSWORD_A=contraseña_de_prueba_A
TEST_EMAIL_B=correo_de_prueba_B
TEST_PASSWORD_B=contraseña_de_prueba_B
```

```sh
npm run test:live
```

Este script autentica ambas cuentas, prueba RLS, manipulación de propietarios/FK, idempotencia, conflictos y lectura desde otra sesión. Crea datos con nombre `Verificación OpoPlan` y los archiva al terminar. No borra cuentas ni utiliza una clave administrativa. No se ha ejecutado en tu proyecto porque no había una sesión ni cuentas de prueba disponibles.

## Referencias oficiales

- [Cloudflare Pages: Vite](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/)
- [Cloudflare Pages: rutas y SPA](https://developers.cloudflare.com/pages/configuration/serving-pages/)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: programar Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)
- [WebKit: Web Push en apps añadidas a inicio](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
