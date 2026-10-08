# Verificación y límites de la entrega

Fecha: 8 de octubre de 2026. Los resultados se refieren al código entregado, no a una instalación de producción.

## Pruebas ejecutadas

- `npm run check`: TypeScript sin errores.
- `npm test`: **32 pruebas superadas**: 17 de lógica/fechas/importación, 9 contra PostgreSQL/PGlite y 6 de IndexedDB/sincronización.
- `supabase/INSTALL.sql`: instalación completa ejecutada en PostgreSQL/PGlite en una transacción; 14 tablas con RLS.
- `npm run build`: compilación de producción correcta; manifest, iconos, cabeceras y precache generado. Assets separados para estadísticas y bibliotecas; ningún chunk supera 500 KB sin comprimir.
- Playwright/Chromium: recorridos completos de interfaz con importación, estudio parcial, sesión de tres bloques, memoria, corrección de test, cronómetro recuperado, recarga offline, sincronización, segunda sesión, copia y responsive. **3 recorridos superados** (28,3 segundos en la última ejecución), incluida división/edición y restauración entre cuentas con remapeo sin duplicados.

El entorno usa Chromium 153 y PGlite, que ejecuta PostgreSQL real en WASM. El adaptador HTTP de pruebas representa Auth/PostgREST y normaliza fechas/números como esos servicios; las consultas y el RPC ejecutan **las migraciones reales con roles y RLS**. No se conecta al proyecto del usuario. El adaptador está solo en `e2e/`, excluido del frontend compilado. IndexedDB se prueba con fake-indexeddb en Vitest y en el navegador real de Playwright en los recorridos.

## Criterios de aceptación

| #   | Escenario                        | Evidencia y alcance                                                                              |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | Registro, cierre y nuevo acceso  | Playwright con Auth de prueba; correo real pendiente                                             |
| 2   | Materias, temas y bloques        | Árbol importado en UI y restricciones PostgreSQL; creación manual disponible                     |
| 3   | Importar y editar árbol          | Vitest JSON/CSV/texto; Playwright importación y edición                                          |
| 4   | Estudio parcial                  | UI y PostgreSQL: sin evento de estudio inicial                                                   |
| 5   | Completar y programar mañana     | UI, lógica y proyección PostgreSQL                                                               |
| 6   | Mal/Regular/Bien                 | Vitest y paridad SQL/TypeScript                                                                  |
| 7   | Varias materias en un día        | Modelo de asignaciones por contenido y filtro de materia; revisar temario propio tras despliegue |
| 8   | Tres bloques, 50 minutos totales | Vitest y Playwright verifican 3.000 segundos totales                                             |
| 9   | Cobertura por vuelta             | Vitest y UI; nuevo bloque cambia denominador                                                     |
| 10  | Estadísticas frente a origen     | Total de sesiones y asignaciones comprobado                                                      |
| 11  | Simulacro y corrección           | UI: nota 6,25 → 6,67; PostgreSQL actualizado                                                     |
| 12  | Tiempo manual y cronómetro       | Playwright y lógica de timestamps                                                                |
| 13  | Offline y reconexión             | Recarga sin conexión y nueva sesión; una inserción al reconectar                                 |
| 14  | Reintento sin duplicar           | RPC PostgreSQL e IndexedDB: también confirmación perdida                                         |
| 15  | Segunda sesión/dispositivo       | Dos contextos aislados de Chromium con misma cuenta; hardware real pendiente                     |
| 16  | Aislamiento entre usuarios       | RLS real PostgreSQL con usuarios A/B y peticiones manipuladas; Supabase Auth real pendiente      |
| 17  | Copia completa                   | Validación, remapeo estable, vista previa y restauración entre cuentas de prueba                 |
| 18  | Vencidos conservados             | Fechas de programación sin eliminación; tarea de ayer visible en UI                              |
| 19  | Cambios de hora                  | Europe/Madrid: marzo y octubre de 2026, días naturales y hora ambigua                            |
| 20  | Móvil/tablet/escritorio          | Chromium a 320, 390, 834 y 1.440 px sin desbordamiento horizontal                                |
| 21  | Recuperar cronómetro             | Pausa → recarga → reanudación/finalización en UI                                                 |
| 22  | Archivo/división                 | Historial original intacto; bloques derivados sin dominio                                        |
| 23  | Datos reales                     | No hay seeds de estudio, modo demo ni backend de ejemplo en `src/`                               |
| 24  | Manifest/SW/PWA                  | Manifest standalone, precache de assets, shell abierto offline; instalación física pendiente     |

## Pendiente de infraestructura y dispositivos

No se ha aplicado SQL en `kavehkjbwyycthpfsngz`, no se han creado usuarios reales de prueba y no existe una URL de producción publicada durante esta sesión. Los paneles de Supabase y Cloudflare requieren iniciar sesión. La conexión GitHub permitió leer `Marcitius/OpoPlan`, pero rechazó crear archivos con **403 Resource not accessible by integration**; por eso el código se entrega en un paquete descargable para subirlo al repositorio.

No se han probado entrega de correo, recuperación real mediante email, expiración real de JWT con datos offline, Realtime remoto, cuotas/latencias de Supabase, cron Edge Functions ni push físico en Safari/iPhone. La función push está implementada, pero no desplegada ni verificada en Deno/Supabase. `npm run test:live` queda preparado para las comprobaciones reales de RLS con dos cuentas dedicadas. No se considera una prueba superada hasta ejecutarlo.

## Límites conocidos

- Primer inicio de sesión y registro necesitan conexión. Offline se utiliza tras una instalación/cache y autenticación previas. Los datos locales pueden desaparecer si el usuario elimina el almacenamiento del navegador; no se puede evitar desde una web. La cola permanece mientras se conserve ese almacenamiento.
- Sincronización al abrir, volver a primer plano, recuperar red y cada 30 segundos; el sistema operativo puede suspender una PWA cerrada. Realtime mejora la actualización, pero tiene fallback de sondeo.
- Se descarga la cuenta completa con paginación y se recalculan proyecciones. Es adecuado para un proyecto personal; historiales muy grandes requieren optimizar consultas/incrementales. No se han hecho pruebas de carga de larga duración.
- Importación de temario: 5.000 nodos y 30 niveles por lote. Restauración JSON: 50.000 registros en una transacción, sujeta al timeout de Supabase. Una copia mayor necesita restauración de base de datos asistida; no se fragmenta silenciosamente rompiendo relaciones.
- La restauración añade registros ausentes y conserva los existentes; no revierte una cuenta a una versión antigua. Si cambió un dato con el mismo ID, prevalece el existente. Se explica en la vista previa.
- La cola detiene un lote conflictivo. Si otras operaciones posteriores afectan a las mismas filas, no las descarta automáticamente; pide conservar una copia y resolver los cambios de forma explícita. Un rechazo de servidor conserva la operación y el error para revisión.
- Se registran resultados de tests; no se incluye un banco de preguntas ni un generador de exámenes, porque el usuario no ha proporcionado contenidos.
- El orden de temario se modifica mediante acciones subir/bajar/mover accesibles y táctiles; no hay drag-and-drop.
- Las instantáneas de cobertura se conservan en la copia JSON; la pantalla principal de vueltas presenta la cobertura actual. No incluye un gráfico comparativo de instantáneas históricas.
- La planificación de prácticas se hace con actividades editables; no hay generación de una serie recurrente de tests. Las recomendaciones inteligentes priorizan repasos sin inventar actividad.
- Exportación `.ics` es puntual y no bidireccional. Las proyecciones de cobertura/carga son estimaciones y no garantías.
- Push exige VAPID, cron y permisos; requiere PWA instalada en iPhone/iPad compatible. No hay notificaciones externas garantizadas si el proveedor/dispositivo no las entrega. Alternativas: avisos internos y calendario.
- Interfaz inicialmente en español; zona horaria elegible y temas claro/oscuro/automático. No se incluyen otros idiomas.

La CI de GitHub reproduce check, Vitest, build y Playwright al subir el código. No se ha declarado ejecutada la CI remota mientras el repositorio sigue sin poder escribirse desde esta conexión.
