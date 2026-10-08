# Rediseñar OpoPlan para estudiar y repasar desde móvil

La interfaz anterior comprimía títulos del temario, mostraba demasiadas acciones por fila y exponía formularios extensos para tareas frecuentes. Esta actualización organiza la aplicación alrededor del día de estudio: Hoy prioriza tiempo y repasos, Temario permite entrar por niveles y los registros muestran primero los campos esenciales.

## Cambios

- Sistema de diseño modular: verde profundo, fondos neutros, tipografía legible, estados semánticos y tema oscuro.
- Cinco destinos móviles: Hoy, Temario, Repasos, Progreso y Más; barra lateral completa en escritorio.
- Temario con rutas, búsqueda, progreso, gestión contextual y detalle de bloque con notas e historial.
- Registro rápido de repaso con Mal/Regular/Bien y próxima fecha; corrección conservando el evento original.
- Cronómetro centrado en la sesión; selección de varios bloques estable y controles que esperan la persistencia local.
- Progreso, pruebas, onboarding y configuración con jerarquía y opciones avanzadas desplegables.
- Diálogos adaptados a móvil, foco recuperado, controles táctiles, safe areas y movimiento reducido.
- Índices de búsqueda y paginación para temarios extensos, sin añadir dependencias de producción.

## Validación

- TypeScript y compilación de producción correctos.
- 34 pruebas Vitest y 7 recorridos Playwright superados.
- 203 comprobaciones responsive en nueve anchos y orientación horizontal, sin overflow.
- 5 comparaciones visuales y 15 análisis Axe sin infracciones detectadas.
- Regresión de importación, multibloque sin duplicar tiempo, cronómetro, offline, idempotencia, segunda sesión, copias, correcciones y RLS local.

Detalles y límites en `docs/PRUEBAS-REDISENO.md`. No se verificó un iPhone físico, Safari, Supabase remoto ni push. Revisar la preview con una cuenta dedicada antes del merge.

## Datos y despliegue

No se modifican esquema, migraciones, políticas RLS, almacenamiento ni cola de sincronización. No hay operaciones destructivas ni cambios de identificadores. **No ejecutar `INSTALL.sql` ni reinstalar Supabase.** Cloudflare conserva `npm run build`, salida `dist` y las variables públicas existentes. Publicar esta rama como preview y aprobar su revisión antes de sustituir producción.
