# Arquitectura e integridad

## Separación de responsabilidades

Cloudflare Pages sirve archivos estáticos HTTPS. React/TypeScript construye la interfaz; Vite divide los módulos y Tailwind/CSS define el diseño. Radix aporta diálogos y menús accesibles, Recharts los gráficos, Temporal el cálculo de días naturales, Zod la validación y UUID v5 la remapificación estable de copias entre cuentas.

Supabase Auth gestiona la cuenta y el JWT. PostgreSQL es la fuente de verdad. IndexedDB conserva la copia local, operaciones pendientes y cronómetro de cada usuario. No hay dependencia de OpoGC ni acceso a sus tablas. No se generan sesiones ni conocimientos iniciales al crear la cuenta.

## Modelo

| Tabla                | Responsabilidad                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `profiles`           | preferencias, objetivos, días, zona horaria y reglas                                             |
| `oppositions`        | oposiciones y fechas de examen                                                                   |
| `nodes`              | árbol con contenedores o bloques revisables; `source_node_id` conserva la procedencia al dividir |
| `categories`         | categorías de práctica configurables                                                             |
| `sessions`           | actividad real y duración total, una vez por sesión                                              |
| `session_blocks`     | bloques, progreso parcial y segundos asignados                                                   |
| `memory_events`      | estudio completado, repasos, correcciones, anulaciones y decisiones de programación              |
| `review_state`       | proyección reproducible de eventos, mantenida en PostgreSQL                                      |
| `plan_tasks`         | actividad prevista, fecha original/actual y vínculo con su realización                           |
| `test_results`       | preguntas, resultados, penalización, puntuación y categoría                                      |
| `test_links`         | errores de una prueba asociados a bloques                                                        |
| `coverage_snapshots` | cobertura y denominador existentes al registrar actividad                                        |
| `push_subscriptions` | suscripciones específicas de cada dispositivo                                                    |
| `sync_operations`    | idempotencia y auditoría de versiones anteriores                                                 |

Los campos `id`, `owner_id`, `version`, `created_at`, `updated_at` y `deleted_at` son comunes. PK y FK compuestas por propietario e identificador impiden vincular contenido de otra cuenta. No hay borrado físico de temario o actividades desde el cliente. Archivar excluye de cobertura y agenda; la papelera se puede restaurar. Un padre organizativo no genera repasos ni se suma al número de bloques.

Un bloque revisable es una hoja. Para añadir subbloques a contenido previamente estudiado, se divide el original: queda archivado y los nuevos bloques mantienen su procedencia, pero empiezan sin dominio atribuido. Los contenedores admiten profundidad variable, movimiento y reordenación. La importación permite hasta 5.000 nodos y 30 niveles por lote.

## Seguridad

Las 14 tablas privadas tienen RLS de lectura, inserción, modificación y eliminación por propietario. El rol `authenticated` solo tiene SELECT directo. Todas las escrituras del navegador pasan por `apply_operations`; `anon` no puede consultar datos privados.

El RPC es `SECURITY DEFINER` con `search_path` vacío, obtiene al propietario desde `auth.uid()`, verifica todas las filas y usa únicamente nombres de tabla de una lista fija. Las FK compuestas, validaciones del árbol, asignaciones y configuración se ejecutan antes de devolver éxito. El cliente nunca utiliza una clave administrativa.

Los eventos de memoria son inmutables. Una corrección añade otro evento apuntando al original; no cambia sus timestamps, reglas ni fecha calculada registrada. Las correcciones de metadatos y sesiones conservan las versiones anteriores en `sync_operations`. La supresión de una cuenta desde administración de Auth queda fuera del flujo de archivo/papelera y elimina sus datos por la relación con `auth.users`.

## Offline, idempotencia y conflictos

1. Cada acción crea una operación UUID y filas UUID estables.
2. IndexedDB escribe filas, secuencia y operación en una única transacción. Un error aborta todo el lote.
3. La interfaz indica guardado local y estado pendiente; no afirma guardado en la nube.
4. Se envía la cola en orden. Supabase bloquea las operaciones concurrentes por propietario y compara versiones esperadas.
5. Una operación aceptada queda en `sync_operations`. Reenviarla devuelve el mismo resultado; reutilizar su ID con otro contenido se rechaza.
6. Un conflicto rechaza el lote completo. La pantalla de ajustes compara las versiones y permite conservar la nube o reenviar la propia con un nuevo control de versión.
7. Se retira la operación local solo tras confirmación. Después se descargan las filas en páginas de 1.000 y se valida su forma antes de incorporarlas. Los registros locales pendientes se protegen durante la descarga.

Hay reintentos con espera creciente hasta 60 segundos, sincronización al recuperar conexión, volver a primer plano, abrir la app y cada 30 segundos mientras permanece abierta. Realtime solicita una actualización cuando está disponible; el sondeo cubre sus interrupciones. No hay ejecución garantizada del sincronizador con la PWA cerrada.

Las colas, registros, oposición seleccionada y cronómetro se separan por cuenta. Cerrar sesión no elimina operaciones pendientes; advierte de ellas y las conserva para esa cuenta. Otros usuarios no las ven. La aplicación conserva tombstones en servidor para propagar eliminaciones entre dispositivos. No los purga automáticamente.

## Cronómetro y tiempo

El tiempo se calcula con `runningSince` y segundos acumulados, no contando ticks de `setInterval`. Pausar fija el acumulado; reanudar crea un nuevo timestamp. IndexedDB conserva cada transición. Una sesión finalizada usa el UUID del cronómetro, evitando duplicados al reintentar.

Pomodoro limita los segundos al intervalo de trabajo. El descanso no suma. Al terminar un intervalo se espera una acción explícita para continuar: si el navegador está suspendido, no se inventan ciclos de trabajo/descanso.

La duración total reside solo en `sessions`. Los segundos de las asignaciones deben sumar exactamente esa duración. Un filtro por materia suma solo sus asignaciones. Los gráficos generales suman cada sesión una vez. Una corrección de tiempo ajusta proporcionalmente las asignaciones. Para corregir la fecha de una sesión con eventos de memoria se anula y se registra de nuevo, conservando la trazabilidad.

## Repetición espaciada versión 1

Adaptación documentada de [SM-2 de SuperMemo](https://www.super-memory.com/english/ol/sm2.htm), con tres valoraciones y un avance más conservador para Regular. No es la implementación literal del algoritmo original.

| Valoración | Puntuación interna | Regla                                                                                    |
| ---------- | ------------------ | ---------------------------------------------------------------------------------------- |
| Mal        | 1/5                | reinicia la racha de aciertos y vuelve al primer intervalo                               |
| Regular    | 3/5                | aumenta una repetición e intervalo anterior × 1,2, redondeado                            |
| Bien       | 5/5                | primera repetición: 1 día; segunda: 6; posteriores: intervalo anterior × nueva facilidad |

Estudio inicial **completado**, no parcial: programa el primer repaso al siguiente día por defecto. La facilidad comienza en 2,5 y se actualiza:

`EF nueva = max(1,3, EF + 0,1 − (5 − q) × (0,08 + (5 − q) × 0,02))`.

Se redondea a dos decimales. Los intervalos se redondean a días enteros y se limitan a 365 días por defecto. Primer intervalo, segundo intervalo, multiplicador de Regular y máximo son configurables. Cada evento conserva una copia de las reglas con su versión; los cambios afectan a eventos nuevos.

Dos repasos del mismo bloque y día natural aportan todo el tiempo realmente invertido, pero solo una pasada y un avance del algoritmo. La última valoración efectiva de ese día prevalece. Corregir una valoración recalcula el estado actual a partir de eventos, preservando la fecha calculada que se guardó en cada original. Los eventos se ordenan por timestamp e ID para obtener el mismo resultado en ambos dispositivos.

`automaticDue` conserva la última fecha automática; un evento `reschedule` cambia `due` y se identifica como manual. Posponer no crea un repaso realizado. Reset conserva historial y pasadas. Exclude mantiene los datos y desactiva avisos automáticos del bloque.

TypeScript reproduce la programación para mostrarla offline; PostgreSQL la vuelve a calcular en `review_state`. Las pruebas comparan ambos cálculos. Las fechas previstas son `date`, y los instantes reales son `timestamptz` junto con la zona y el día efectivo. Temporal y PostgreSQL calculan días naturales, también al cambiar la hora en Europe/Madrid.

## Vueltas, dominio y recomendaciones

Primera pasada: estudio inicial completado. Siguientes: repasos efectivos, una vez por día. Un repaso sin estudio inicial registrado no inventa cobertura inicial. La cobertura usa los bloques activos actuales; un bloque nuevo modifica el denominador. Las instantáneas conservan cómo era al registrar actividad.

El dominio representa la última valoración real. Cinco repasos con Mal siguen mostrando dominio bajo. Las recomendaciones consideran retraso, tiempo desde el último repaso respecto al intervalo, número de dificultades, importancia y cercanía del examen. Se seleccionan dentro del menor de los minutos orientativos de repaso y el objetivo disponible restante del día. En descanso no se recomienda carga, pero los vencidos siguen visibles. No se eliminan los bloques fuera del límite ni se modifican registros por reorganizar la agenda.

Las proyecciones hasta el examen usan la media de estudio inicial de los últimos 28 días; son estimaciones con sus supuestos visibles. La carga futura contempla solo la siguiente fecha conocida, pues posteriores intervalos dependen de las valoraciones.

## Copias y PWA

La copia JSON incluye todas las relaciones e historial de la cuenta, tombstones y preferencias; excluye tokens y suscripciones push. Mismo usuario: conserva IDs y omite los existentes. Otra cuenta: UUID v5 determinista por propietario de destino, origen, tabla e ID; repetir la importación no duplica registros. Se validan forma, referencias, ciclos y repartos antes de confirmar. La restauración admite 50.000 registros en un solo lote transaccional, sujeto a capacidad y timeout de Supabase.

El service worker precachea el shell y todos los assets compilados, incluidos los módulos diferidos de estadísticas. No cachea peticiones Auth ni datos privados de Supabase. Ofrece fallback offline y una acción para activar actualizaciones, preservando el cronómetro y la cola. Los gráficos se cargan por separado para reducir la descarga inicial. Cloudflare sirve la SPA y los assets; la persistencia privada es de Supabase/IndexedDB.
