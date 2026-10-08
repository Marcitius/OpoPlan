# Rediseño de OpoPlan

Esta entrega actualiza la aplicación existente. Está basada en el commit `2efd830f16fbcd856d5bda3de19ca92c61906bb5` de `Marcitius/OpoPlan`; se verificó que los 63 archivos originales coincidían con el repositorio. La rama de trabajo es `redesign/professional-ui`.

## Auditoría

Se revisaron arquitectura, pantallas, componentes, estilos, modelo, operaciones, cola offline, pruebas y configuración PWA. Se analizó la grabación completa de 126,5 segundos mediante 127 fotogramas distribuidos por toda su duración. La página pública se abrió; en una sesión nueva mostraba la conexión inicial y no permitió auditar los datos privados sin credenciales.

La interfaz anterior intentaba conservar demasiadas columnas y acciones en móvil. La sangría acumulada y los controles competían con el espacio del título. Los formularios mostraban opciones avanzadas desde el principio, las seis pestañas comprimían la navegación y los estados sin actividad repetían indicadores y gráficos vacíos.

## Navegación implementada

| Destino móvil | Tarea principal                                                        |
| ------------- | ---------------------------------------------------------------------- |
| Hoy           | Decidir qué hacer, ver el tiempo y comenzar una actividad              |
| Temario       | Entrar en materias, temas y bloques; buscar y gestionar contenido      |
| Repasos       | Recuperar conocimientos vencidos, de hoy y próximos                    |
| Progreso      | Interpretar tiempo, vueltas, memoria e historial                       |
| Más           | Estudiar, pruebas, agenda, configuración, oposición y cierre de sesión |

Estudiar y registrar repaso también aparecen como acciones directas en Hoy y en el detalle del bloque. El cronómetro abierto tiene un acceso persistente para volver a la sesión. En escritorio, la barra lateral ofrece las seis secciones originales y acceso a configuración y cierre de sesión.

## Sistema de diseño

Los estilos anteriores se sustituyen por módulos definidos por responsabilidad, sin acumular parches al final de la hoja:

| Archivo                     | Responsabilidad                                                       |
| --------------------------- | --------------------------------------------------------------------- |
| `src/styles/tokens.css`     | Colores semánticos, tipografía, radios, espacios, elevaciones y temas |
| `src/styles/base.css`       | Fundamentos, campos, foco, movimiento reducido y legibilidad          |
| `src/styles/shell.css`      | Navegación, barra superior, safe areas y adaptación a escritorio      |
| `src/styles/components.css` | Botones, campos, menús, diálogos, listados y mensajes                 |
| `src/styles/pages.css`      | Composiciones específicas de las tareas de estudio                    |

Identidad: fondo cálido `#f6f6f2`, superficies blancas, texto `#21352d`, verde de marca `#174d3b`, estados de atención y errores con etiquetas además del color. En oscuro se utiliza fondo `#141e19`, superficie `#1c2922`, texto claro y verde salvia. Los colores de campos, bordes, avisos y gráficos responden al tema.

La tipografía utiliza las fuentes del sistema, incluyendo la de iOS, sin descargar fuentes externas. Campos de 16 px evitan el zoom habitual de Safari al enfocarlos. Botones principales de al menos 48 px y controles de al menos 44 px; las celdas del calendario mensual utilizan una cuadrícula compacta y cumplen el mínimo de 24 px comprobado en la matriz responsive. Espaciado de 4, 8, 12, 16, 20, 24 y 32 px; radios de 10, 16 y 24 px. Sombras discretas y transiciones breves respetan el movimiento reducido.

Se reutilizan `Button`, `Field`, `Modal`, `Menu`, `Empty`, `BlockPicker`, `RatingButtons`, `Disclosure`, `PageHeader` y `ProgressBar`. Los diálogos conservan las primitivas accesibles Radix. En móvil son hojas inferiores con desplazamiento interno, encabezado de cierre y acciones de guardado. No enfocan automáticamente un campo. Utilizan VisualViewport para adaptar su altura cuando cambia el espacio visible y devuelven el foco al cerrar.

## Cambios por pantalla

- **Hoy:** una medida principal de tiempo y objetivo, acciones inmediatas, repasos vencidos y del día, contenido reciente, actividades previstas, actividad semanal y resumen de ayer. La primera experiencia guía hacia temario o práctica sin llenar la página de ceros.
- **Temario:** navegación por niveles con ruta y botón de volver. Las filas dedican espacio al título y desplazan la gestión a un menú. La búsqueda localiza contenido en cualquier profundidad. Cada bloque muestra estado y fecha, y el detalle conserva notas e historial. La vista previa de importación limita la sangría y señala el nivel cuando el árbol es profundo.
- **Repasos:** grupos Vencidos, Para hoy y Próximos; búsqueda, filtros y una acción para abrir el registro. Tres valoraciones grandes, tiempo manual o cronómetro y opciones avanzadas desplegables. La confirmación muestra la fecha calculada y permite corregir la valoración sin sustituir el evento original.
- **Estudiar:** selección y búsqueda antes de iniciar; el cronómetro y sus controles dominan la sesión abierta. Se conservan pausas, recuperación, Pomodoro, finalización y tiempo manual.
- **Progreso:** Resumen, Memoria, Plan e Historial reúnen las funciones existentes. Los gráficos utilizan datos reales y las vueltas siguen calculándose por bloques. Las correcciones de sesiones permanecen disponibles en Historial.
- **Pruebas:** registro básico primero; fórmula, nota manual y errores relacionados en opciones desplegables. Un único resultado se presenta como punto de partida, sin una gráfica de evolución artificial.
- **Configuración:** ocho apartados en lugar de un formulario continuo. Pulsar el estado de sincronización abre directamente Sincronización. Objetivos, reglas, apariencia, recordatorios, categorías y copias mantienen las operaciones originales.
- **Autenticación y primer uso:** composición coherente con la aplicación, campos legibles y oposición como único dato inicial imprescindible; objetivo y examen son opcionales.

## Rendimiento

El índice del temario calcula descendientes mediante mapas, muestra 60 filas por página y permite cargar más. El selector presenta 40 resultados inicialmente, prioriza selección y recientes, y difiere la búsqueda. Los eventos de memoria se agrupan una vez por bloque antes de reproducir su estado. La lógica de los indicadores no cambia. Se conservan los módulos de gráficos diferidos y no se añaden dependencias de producción.

## Datos y funciones conservadas

No se ha modificado ningún archivo de `supabase/`, ninguna tabla, política RLS, migración, función SQL ni identificador existente. Tampoco se han cambiado `src/data/`, almacenamiento IndexedDB, sincronización, modelos, algoritmo de memoria, fechas, importación/exportación, cronómetro, manifest ni service worker fuente. La compilación genera el precache para los nuevos archivos de interfaz.

Los cambios en `src/core/stats.ts` son optimizaciones de búsqueda equivalentes; las pruebas existentes comprueban tiempo, cobertura y paridad SQL/TypeScript. No se ejecutó `INSTALL.sql`, no se reinicializó Supabase y no se hicieron escrituras sobre producción. Los únicos registros creados por las verificaciones pertenecen a bases locales de prueba aisladas.

Resultados y alcance: [PRUEBAS-REDISENO.md](PRUEBAS-REDISENO.md). Publicación: [ACTUALIZACION.md](ACTUALIZACION.md).
