# Manual breve

## Primer uso

Crea una cuenta con correo y contraseña. Si se exige confirmación por email, abre ese enlace antes de iniciar sesión. Indica oposición, objetivo y, si la conoces, fecha de examen. En Temario, crea materias/temas como contenedores y contenidos efectivos como bloques.

También puedes importar JSON, CSV o texto con dos espacios de sangría por nivel. Revisa el árbol antes de confirmar. No hay un temario oficial precargado ni fechas de estudio inventadas. Puedes registrar lo estudiado antes de instalar OpoPlan introduciendo la fecha real de inicio de cada sesión.

Ejemplo de estructura, para sustituirlo por tus propios contenidos:

```text
Mi materia
  Mi tema
    Primer bloque que quiero repasar
    Segundo bloque que quiero repasar
```

JSON equivalente:

```json
[
  {
    "name": "Mi materia",
    "children": [
      {
        "name": "Mi tema",
        "children": [
          { "name": "Primer bloque que quiero repasar" },
          { "name": "Segundo bloque que quiero repasar" }
        ]
      }
    ]
  }
]
```

CSV: columnas `id,parent_id,name,kind`; `kind` puede ser `container` o `block`. Estos nombres son ejemplos estructurales, no legislación ni registros de demostración.

## Tu día

En móvil, la barra inferior contiene **Hoy, Temario, Repasos, Progreso y Más**. Más reúne Estudiar, Pruebas, Agenda y Configuración. En escritorio estas funciones aparecen en la barra lateral. Un cronómetro abierto mantiene un acceso para volver a él.

Hoy muestra minutos reales, objetivos, pendientes, vencidos y actividades previstas. **ESTUDIAR** abre el cronómetro; **REPASAR** permite elegir bloques y registrar valoraciones. Agenda permite ver días, semanas y meses. Actividad añade estudio, repaso o práctica prevista. Las actividades atrasadas siguen pendientes hasta realizarlas, posponerlas o cancelarlas.

“Iniciar” abre un cronómetro. “Registrar realizada” pide el tiempo y los detalles reales; no completa una tarea sin una sesión. El menú de cada actividad permite cambiar fecha, editar y cancelar. La exportación `.ics` crea eventos de calendario: es una copia puntual, no sincronización bidireccional con Apple/Google Calendar.

## Estudiar o repasar

Selecciona uno o varios bloques con el buscador. Usa tiempo manual o cronómetro, con pausa/reanudación y Pomodoro. Al finalizar, las opciones de reparto en segundos, fecha anterior, concentración y dificultad están en los apartados desplegables. El reparto debe sumar exactamente la duración total.

En estudio, indica avance parcial o marca Estudio inicial completado **por bloque**. Solo completar un bloque inicia su programación de memoria. En repaso, elige Mal, Regular o Bien para cada bloque y añade una nota sobre lo olvidado. Puedes valorar sin cronómetro. No hace falta terminar el tema entero.

Después de guardar un repaso, la confirmación muestra la siguiente fecha y permite corregir la valoración reciente o continuar con otro bloque pendiente. El mensaje distingue guardado local, cambios pendientes y sincronización; guardado local no confirma una escritura en la nube.

El cronómetro se conserva al recargar. El Pomodoro detiene el cómputo al finalizar trabajo; pulsa para comenzar descanso o un nuevo intervalo. El descanso no suma. Finalizar abre el formulario de guardado; cancelar el formulario conserva el cronómetro pausado. Descartar sesión abierta no crea actividad.

## Temario y memoria

Entra en una materia, después en un tema y finalmente en un bloque. La ruta superior permite volver sin acumular sangrías ni estrechar el texto. El buscador encuentra contenido en todos los niveles. Los filtros permiten consultar estado, archivados y papelera.

El menú de tres puntos permite editar, mover, subir/bajar, archivar, restaurar o dividir. Papelera es recuperable y conserva historial. Dividir archiva el original y crea bloques nuevos sin atribuirles conocimientos previos. Usa búsqueda para localizar bloques dentro del árbol.

Pulsar el nombre de un bloque abre estado, fechas, tiempo, notas, sesiones y eventos de memoria. Desde el menú de un evento puedes corregir la valoración o anular un error. Los originales se conservan. En Progreso → Historial puedes corregir tiempo/notas de sesiones o anularlas; la anulación elimina sus efectos en indicadores y deja trazabilidad.

Repasos muestra fechas y explica los intervalos. Puedes cambiar fecha, excluir o reiniciar programación. Vencido significa que sigue pendiente; nunca se considera realizado al cambiar el día.

Las vueltas muestran cobertura de los bloques activos. Dominio bajo/medio/alto responde a Mal/Regular/Bien, no al número de repasos.

## Prácticas y pruebas

En Pruebas registra inglés, ortografía, gramática, psicotécnicos u otras categorías. Introduce preguntas, aciertos, errores, blancos, tiempo y penalización. Puedes introducir una nota manual si tu prueba usa otra fórmula. Corrige resultados desde su menú; las estadísticas se recalculan.

Vincula errores a bloques al registrar o corregir una prueba. “Programar repaso de errores” te permite elegir una fecha para esos bloques. Esto planifica un repaso; no inventa que se ha realizado.

## Estadísticas y objetivos

Progreso filtra fechas, actividad y materia. Tiempo general cuenta cada sesión una vez. Al elegir materia solo se suman sus segundos asignados. La duración de una fila de historial sigue siendo la sesión completa. Los rangos largos agrupan el gráfico por meses.

Configura horas/minutos, descanso, fecha de examen, importancia de bloques, intervalos, Pomodoro, tema y zona horaria. Los objetivos son orientativos y no generan registros. Los nuevos valores de memoria se aplican a eventos futuros.

Configuración está organizada en Cuenta y oposición, Objetivos, Repetición espaciada, Apariencia, Avisos, Datos y copias, Sincronización y Práctica. En móvil elige el apartado en el selector superior. Pulsar el indicador de sincronización abre directamente ese apartado.

## Dispositivos, offline y copias

Accede con **la misma cuenta** en todos los dispositivos. Observa el estado de sincronización. Guardado local no equivale a guardado en la nube: espera Sincronizado antes de borrar datos del navegador. Puedes guardar offline y reconectar más tarde; la cola se conserva al cerrar/reabrir. Si aparece un conflicto, revisa ambas versiones desde Configuración.

Descarga periódicamente la copia JSON completa. CSV sirve para consultar datos tabulares; la copia JSON es la que reconstruye relaciones e historial. La importación muestra una vista previa y conserva los registros que ya existen; no reemplaza una versión actual por una copia antigua.

Los avisos dentro de la app están disponibles. Push exige configurar el emisor, permiso contextual y una plataforma compatible. En iPhone abre la app instalada desde la pantalla de inicio. La recepción de push en un dispositivo físico todavía requiere verificación tras el despliegue.
