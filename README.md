# OpoPlan

PWA de planificación y seguimiento de oposiciones por bloques independientes. React + TypeScript + Vite, **Cloudflare Pages** y **Supabase Auth/PostgreSQL**. Proyecto separado de OpoGC.

El código utiliza datos reales de la cuenta autenticada. No incorpora un modo de demostración ni un backend ficticio. El adaptador que aparece en `e2e/` sirve exclusivamente para ejecutar pruebas y no forma parte de la compilación de la aplicación.

## Empezar

Sube primero el contenido del paquete de código a tu repositorio OpoPlan. La conexión de esta sesión rechazó la escritura en GitHub; el repositorio no se ha modificado.

1. Configura el proyecto Supabase OpoPlan con las migraciones.
2. Publica `Marcitius/OpoPlan` en Cloudflare Pages: comando `npm run build`, salida `dist`.
3. Define `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` como variables de compilación.
4. Configura las URL de autenticación de Supabase con el dominio de Pages.
5. Crea tu cuenta e importa tu temario. En Safari puedes añadir la aplicación a la pantalla de inicio.

[Guía de despliegue paso a paso](docs/DESPLIEGUE.md) · [Manual de usuario](docs/USUARIO.md) · [Arquitectura y reglas de memoria](docs/ARQUITECTURA.md) · [Verificaciones y límites](docs/VERIFICACION.md)

## Funciones

- Hoy con pendientes y vencidos, agenda diaria/semanal/mensual y exportación `.ics`.
- Temario jerárquico editable, movimiento, orden, archivo, papelera recuperable y división sin heredar dominio.
- Importación de JSON, CSV y texto con sangrías con validación y vista previa.
- Estudio parcial o completado, valoración independiente de cada repaso y cronómetro persistente con Pomodoro.
- Repetición espaciada SM-2 adaptada y versionada; cambios manuales, exclusión, reinicio y corrección conservando los originales.
- Sesiones con múltiples bloques y reparto exacto de segundos; estadísticas sin multiplicar el tiempo.
- Práctica, tests y simulacros con penalización configurable, nota manual y errores vinculados a bloques.
- Vueltas, cobertura, gráficos, objetivos y estimaciones identificadas como tales.
- IndexedDB por cuenta, cola transaccional, reintentos idempotentes, detección de conflictos y sincronización entre dispositivos.
- Copias JSON completas y exportaciones CSV; restauración con referencias e identificadores coherentes.
- Avisos dentro de la aplicación y emisor push preparado para Supabase Edge Functions.

## Desarrollo

Node.js 22 o superior compatible con Vite 7.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

```sh
npm run check
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

`npm run test:live` permite comprobar el aislamiento con dos cuentas reales después de configurar `.env.live`; consulta la guía. No se ejecuta automáticamente con las pruebas locales.

## Estructura

```text
src/core/          Tipos, fechas, memoria, estadísticas, importación y validación
src/data/          Supabase, IndexedDB, cola de sincronización y contexto
src/components/    Formularios, componentes accesibles y estado PWA
src/pages/         Hoy, temario, repasos, estudio, progreso, pruebas y ajustes
public/            Manifest, service worker, iconos y cabeceras de Cloudflare
supabase/          Migraciones SQL, instalación y función de recordatorios
scripts/           Compilación PWA, instalación SQL y verificación de producción
tests/            Vitest: lógica, PostgreSQL/PGlite y almacenamiento offline
e2e/              Playwright: recorridos completos en navegador
docs/             Despliegue, arquitectura, manual y resultados de QA
```

## Estado de entrega

El despliegue en tus cuentas de Cloudflare y Supabase requiere acceso a dichas cuentas. No se han aplicado migraciones a tu proyecto ni publicado una URL de producción durante esta entrega. Los resultados reales de las pruebas, las comprobaciones todavía pendientes y las limitaciones están en [VERIFICACION.md](docs/VERIFICACION.md). La recepción de push en iPhone no se da por comprobada.

No uses una clave `service_role` o `sb_secret_…` en el navegador. No hay funciones esenciales bloqueadas mediante suscripción.
