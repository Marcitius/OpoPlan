# Verificación del rediseño

Fecha: 8 de octubre de 2026. Base: `2efd830f16fbcd856d5bda3de19ca92c61906bb5`. Rama: `redesign/professional-ui`. Las comprobaciones se ejecutaron sobre la aplicación compilada, en un entorno local aislado; no sobre los datos privados de producción.

## Resultados ejecutados

| Comprobación                      | Resultado                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run check`                   | TypeScript sin errores                                                                            |
| `npm test`                        | 34/34: 17 de lógica, 9 PostgreSQL/RLS, 6 offline y 2 del índice de temario                        |
| `npm run build`                   | Compilación de producción y precache PWA correctos                                                |
| `npm run test:e2e`                | 7/7 recorridos, sin omisiones ni reintentos fallidos                                              |
| Geometría responsive              | 203 comprobaciones; desbordamiento horizontal máximo: 0 px                                        |
| Regresión visual                  | 5 comparaciones con capturas de referencia superadas, sin regenerarlas durante la ejecución final |
| Axe, etiquetas WCAG A/AA          | 15 análisis de páginas claras, oscuras y diálogo de repaso; 0 infracciones detectadas             |
| Temario extenso                   | 2.005 bloques; búsqueda y paginación comprobadas en navegador                                     |
| Índice de descendientes           | 5.000 bloques comprobados en prueba unitaria                                                      |
| Conservación de archivos críticos | Diferencia vacía contra la base; se incluyen los hashes en la entrega                             |

Se utilizaron Node, Vite 7.3.7, Vitest 3.2.7, Playwright 1.64.0 y Chromium 153.0.8010.0 sobre Linux. El navegador se ejecutó sin GPU. Los informes JSON conservan tiempos y resultados de la ejecución. Las capturas son del navegador, no imágenes generadas.

La compilación emite dos advertencias de anotaciones de comentarios de Zod que Rollup descarta; no son errores. CSS: 43,29 KB, 9,54 KB gzip. Módulo principal: 469,19 KB, 150,56 KB gzip. Se conserva la carga diferida de estadísticas y gráficos y no se añaden dependencias de producción. Axe se añade exclusivamente a las dependencias de desarrollo.

## Alcance del entorno de prueba

PGlite ejecuta PostgreSQL en WASM. Las pruebas aplican las migraciones existentes a bases nuevas aisladas y ejecutan el RPC con roles autenticados y RLS. Auth/PostgREST se representan mediante un adaptador HTTP de pruebas; no se utiliza Supabase Auth remoto ni se crean cuentas reales en el proyecto del usuario. Este adaptador y sus datos están en `e2e/`, fuera de la compilación del producto.

Las pruebas offline utilizan IndexedDB en Chromium y fake-indexeddb en Vitest. La segunda sesión es otro contexto de navegador con almacenamiento independiente, conectado a la misma base local de prueba. Esto comprueba la cola, idempotencia y actualización entre contextos, pero no certifica la red, el hardware ni la infraestructura de Supabase en producción.

## Recorridos funcionales

| Función conservada                      | Verificación                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| Registro, inicio, cierre y nuevo acceso | Interfaz con Auth de prueba; aislamiento de cuentas                                       |
| Materia, tema y bloque                  | Importación y navegación por niveles; creación y edición desde 375 px                     |
| Búsqueda y contenido extenso            | Búsqueda en 2.005 bloques y límite inicial de 60 filas                                    |
| Importación                             | JSON/CSV/texto en lógica; importación desde UI; vista previa de 30 niveles legible        |
| Estudio parcial                         | No completa el tema ni genera un evento inicial por avance parcial                        |
| Estudio completado                      | Genera el primer repaso al día siguiente                                                  |
| Tiempo de varios bloques                | Sesión de tres bloques: 3.000 segundos totales, sin multiplicarlos                        |
| Mal, Regular y Bien                     | Reglas unitarias y paridad SQL/TypeScript; registro Mal y corrección Regular desde UI     |
| Corrección de repaso                    | Evento Mal original conservado, corrección Regular añadida; un único repaso efectivo      |
| Próxima fecha e historial               | Fecha real en confirmación y detalle; estados y registros consultables                    |
| Cronómetro                              | Inicio, pausa, recarga, reanudación, finalización y recuperación persistente              |
| Agenda                                  | Añadir actividad; tareas de ayer siguen pendientes; día, semana, mes y exportación ICS    |
| Pruebas y simulacros                    | Registro, fórmula configurable y corrección de puntuación 6,25 → 6,67                     |
| Progreso y vueltas                      | Indicadores contrastados con sesiones/asignaciones; cobertura por bloques activos         |
| Objetivos y apariencia                  | Guardado de 150 minutos y recuperación tras recargar; cambio a oscuro                     |
| Copias y exportación                    | Copia JSON, vista previa, restauración entre cuentas y remapeo sin duplicar               |
| Offline y reconexión                    | Registro y recarga offline; reconexión y única inserción confirmada                       |
| Reintento de sincronización             | Idempotencia incluso al perder la confirmación de la operación                            |
| Segunda sesión                          | Datos visibles desde otro contexto Chromium independiente                                 |
| Seguridad                               | Usuarios A/B, RLS PostgreSQL y peticiones con relaciones manipuladas                      |
| Archivo y división                      | Conservación del historial original; derivados sin dominio heredado                       |
| PWA                                     | Manifest standalone, precache, service worker y apertura del shell offline                |
| Teclado                                 | Tabulación, Escape y retorno del foco al botón que abrió el diálogo                       |
| Fechas                                  | Europe/Madrid y cambios de horario de marzo y octubre, sin sumar días como 24 horas fijas |

## Responsive y revisión visual

Anchos: **320, 375, 390, 393, 430, 768, 1024, 1280 y 1440 px**. Orientación horizontal: **844 × 390 px**. Se revisaron Hoy, Temario, materia, tema, bloque, Repasos, registro de repaso, Estudiar, cronómetro, fin de sesión, confirmación, Progreso, Pruebas, simulacro, Configuración y sus apartados, calendario, planificación, acceso, onboarding, errores y estados vacíos.

La matriz comprueba ancho de documento, campos de al menos 16 px, controles táctiles y posición visible de los pies de guardado. Los botones ordinarios cumplen al menos 44 px con la tolerancia de redondeo de navegador; el calendario mensual usa celdas compactas de al menos 24 px de ancho y 44 px de alto. No se enfoca automáticamente un campo al abrir el diálogo. Se revisaron capturas de móvil, escritorio y oscuro, además de los controles de movimiento reducido.

Errores corregidos:

- Títulos estrechados por columnas y sangrías: navegación por niveles, título con espacio propio y menús contextuales.
- Barra inferior densa: cinco destinos, con acciones de estudio accesibles desde Hoy y bloques.
- Formularios extensos: opciones avanzadas desplegables y hojas inferiores con desplazamiento interno.
- Guardado fuera de la pantalla: pies de formulario y altura ajustada a VisualViewport.
- Días de estudio demasiado pequeños a 320 px: botones de 44 px que pueden pasar a dos filas.
- Calendario mensual ilegible: indicadores compactos y nombres accesibles con fecha y cantidad de actividades.
- Vista previa con mucha profundidad: sangría limitada y nivel explícito.
- Estado de sincronización con textos unidos: composición propia y separación de estado, explicación y acción.
- Avisos que tapaban formularios: aviso global oculto mientras hay un diálogo; errores y confirmaciones del diálogo siguen visibles.
- Foco perdido al cerrar: recuperación del botón de origen o del contenido principal.
- Selector que se cerraba tras elegir el primer bloque: composición estable al seleccionar varios contenidos.
- Recarga inmediatamente después de pausar: espera al guardado local antes de permitir la siguiente acción.

La entrega contiene **55 capturas actuales** en `capturas/`, además de las cinco referencias de regresión dentro de `e2e/redesign.spec.ts-snapshots/`. Hoy se entrega en 390 y 1440 px; las demás capturas documentan formularios, temas, vacíos y orientación horizontal. Los registros visibles proceden únicamente de datos creados para QA, no de la cuenta real del usuario.

## Conservación de datos y producción

Se comparó con la base original todo `supabase/`, `src/data/`, modelos, validación, importación, reglas de memoria, fechas, cronómetro, `public/` y el generador del service worker. **No hay cambios en esos archivos.** La entrega incluye `archivos-preservados.json` y el resultado de la comparación.

No se ejecutó `INSTALL.sql` en Supabase, no se reinicializó el proyecto, no se cambiaron políticas RLS ni identificadores, no se eliminaron registros y no se realizaron escrituras de estudio en producción. No se modificaron las variables de Cloudflare. La aplicación publicada y la rama remota `main` permanecen como estaban.

## Pendiente y límites

- La integración de GitHub rechazó crear la rama con `403 Resource not accessible by integration`. Existe la rama **local** entregada en Git bundle; no existe una nueva rama remota ni PR creada por esta sesión.
- No se pudo generar una preview de Cloudflare ni publicar una actualización desde las cuentas conectadas. Se entregan los pasos exactos para publicar la rama y revisar la preview antes de aprobar el merge.
- La página pública se abrió, pero una sesión nueva mostró la conexión inicial. No se consultaron datos privados ni se verificaron operaciones en el Supabase real.
- No se probó un iPhone, iPad o Mac físico ni Safari/WebKit. Se utilizó Chromium con tamaños, capacidades táctiles y zona horaria representativos. El teclado virtual y las safe areas reales necesitan revisión física; VisualViewport y las variables de safe area están implementados.
- No se comprobaron correo real, recuperación por enlace, expiración real de JWT, Realtime remoto, notificaciones push ni infraestructura de envío. Las funciones y configuración existentes se conservan.
- Axe sin infracciones no certifica por sí solo conformidad WCAG; falta revisión con lector de pantalla y dispositivo real.
- El tiempo de búsqueda registrado en `performance.json` corresponde a este entorno; no es una promesa de rendimiento en el teléfono. No se hizo una prueba de carga de larga duración.
- Las capturas de referencia usan Linux/Chromium. Al cambiar navegador o fuentes del entorno CI, revisa las diferencias antes de aceptar nuevas referencias.

Publicación segura: [ACTUALIZACION.md](ACTUALIZACION.md). Los límites funcionales anteriores, que no se amplían en este rediseño, siguen documentados en [VERIFICACION.md](VERIFICACION.md).
