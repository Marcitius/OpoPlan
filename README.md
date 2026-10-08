# OpoPlan

PWA de planificación y seguimiento de oposiciones por bloques independientes. React + TypeScript + Vite, **Cloudflare Pages** y **Supabase Auth/PostgreSQL**. Proyecto separado de OpoGC.

El código utiliza datos reales de la cuenta autenticada. No incorpora un modo de demostración ni un backend ficticio. El adaptador que aparece en `e2e/` sirve exclusivamente para ejecutar pruebas y no forma parte de la compilación de la aplicación.

## Actualizar la aplicación existente

Este rediseño parte del código de `Marcitius/OpoPlan`, mantiene Supabase y conserva las funciones, el historial y el almacenamiento offline. La rama de trabajo es `redesign/professional-ui`. Producción: <https://opoplan-marc.pages.dev>.

**La instalación existente no necesita SQL, migraciones ni cambios de variables. No vuelvas a ejecutar `INSTALL.sql`.** Publica la rama, revisa una preview de Cloudflare y aprueba el merge antes de sustituir producción. La conexión GitHub de esta sesión rechazó crear la rama remota; se entrega la rama local en un bundle, con código completo y parche.

[Actualizar sin reinstalar](docs/ACTUALIZACION.md) · [Rediseño y sistema de diseño](docs/REDISENO.md) · [Pruebas del rediseño](docs/PRUEBAS-REDISENO.md) · [Manual de usuario](docs/USUARIO.md) · [Arquitectura](docs/ARQUITECTURA.md)

Para una instalación en un proyecto nuevo y vacío, consulta [DESPLIEGUE.md](docs/DESPLIEGUE.md). Esa guía inicial no debe ejecutarse sobre la instalación actual.

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
src/styles/        Sistema de diseño, componentes y composiciones responsive
public/            Manifest, service worker, iconos y cabeceras de Cloudflare
supabase/          Migraciones SQL, instalación y función de recordatorios
scripts/           Compilación PWA, instalación SQL y verificación de producción
tests/            Vitest: lógica, PostgreSQL/PGlite y almacenamiento offline
e2e/              Playwright: recorridos completos en navegador
docs/             Despliegue, arquitectura, manual y resultados de QA
```

## Estado de entrega

El código del rediseño y sus pruebas están incluidos. No se han aplicado migraciones a tu proyecto, escrito datos de producción ni reemplazado el despliegue existente. Los resultados reales y las comprobaciones pendientes están en [PRUEBAS-REDISENO.md](docs/PRUEBAS-REDISENO.md). El acceso a GitHub para publicar la rama, la preview y la comprobación en un iPhone físico siguen pendientes; la recepción de push no se da por comprobada.

No uses una clave `service_role` o `sb_secret_…` en el navegador. No hay funciones esenciales bloqueadas mediante suscripción.
