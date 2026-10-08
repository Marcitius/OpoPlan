# Nueva planificación diaria: OpoPlan

## Cambios incluidos

- Botón «Planificar mañana» en Hoy.
- Selección de varias actividades en una sola ventana, con estudio, repaso y práctica.
- Horas opcionales para ordenar la agenda; el formulario sugiere la siguiente hora si la fila anterior tiene una hora configurada.
- Editar hora y duración desde el formulario individual.
- Agenda ordenada por fecha y hora, y total diario de minutos previstos.
- El guardado de todas las actividades de una jornada se hace en una sola operación local/sync, sin duplicar sesiones ni registrar actividad que no se ha realizado.

## Instalación (orden obligatorio)

1. Haz una copia de seguridad de tu aplicación y comprueba que se encuentra «Sincronizado», sin cambios pendientes.
2. En **Supabase OpoPlan → SQL Editor**, ejecuta **una sola vez** el archivo `supabase/migrations/202610080006_plan_times.sql`. NO ejecutes `INSTALL.sql` de nuevo.
3. En GitHub `Marcitius/OpoPlan`, actualiza el contenido de los archivos modificados del paquete **en una rama de prueba**, no directamente en producción. Puedes utilizar GitHub Desktop para copiar los archivos manteniendo sus rutas.
4. Compila y comprueba los tests (`npm ci`, `npm run check`, `npm test`, `npm run build`), revisa la preview de Cloudflare y solo entonces integra la rama en `main`.
5. Comprueba crear 3 tareas para una fecha futura, ordenar por hora, editar, verlas en otro dispositivo, y registrar una como realizada sin afectar las otras.

## Límites

- No se ha añadido arrastrar y soltar. Para reordenar, edita la hora de la actividad; las tareas sin hora quedan después.
- No hay alarmas a la hora programada: solo es un plan de estudio en la agenda.
- Las pruebas locales no sustituyen una prueba real con tu cuenta Supabase.
