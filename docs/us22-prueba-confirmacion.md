# US22 · Revisión y creación: prueba de la confirmación

Entrega verificable de Vanessa. Comprueba que el tutor revisa la propuesta de la IA, la ajusta y
la confirma. El chat usa el agente de propuesta `POST /api/ia/tutorias/ajuste`, que puede cambiar
nombre, descripción, método, capacidad, temas y plan de sesiones. También comprueba que el grupo, sus temas y sus sesiones se guardan juntos (o no se guarda nada).

## Antes de empezar

- [ ] Backend en la rama `feature/us22-confirmacion-grupo`, levantado con `AI_CHAT_PROVIDER=openai`
      y la `AI_API_KEY` que maneja Leicy (la clave nunca va en el front).
- [ ] Front en la rama `feature/us22-confirmacion-grupo` con `npm start`.
- [ ] Una cuenta de tutor con menos de 10 grupos creados.

Fecha de la prueba: ____________  Probado por: ____________

## Caso feliz

| # | Paso | Resultado esperado | ¿OK? |
|---|------|--------------------|------|
| 1 | Inicia sesión como tutor y entra a **Mis grupos → Crear grupo**. | Se ve el formulario con Temas iniciales, Plan de sesiones y el botón flotante del asistente IA. | ☐ |
| 2 | Llena nombre, método y capacidad (por ejemplo 12). Abre el asistente y escribe **"Mejora mi descripción de grupo"**. | El asistente responde y la descripción queda marcada en verde con **Aceptar** y **Descartar**. Aparece el aviso "Acepta o descarta los cambios sugeridos antes de crear el grupo." y **Crear grupo** está deshabilitado. | ☐ |
| 3 | Pulsa **Aceptar** en la descripción. | El verde y el aviso desaparecen. | ☐ |
| 4 | Agrega **2 temas** (por ejemplo "Derivadas" e "Integrales"). | Se pueden editar y quitar. Con 3 temas, "Agregar tema" se deshabilita. Un tema repetido muestra "Los temas no pueden repetirse." | ☐ |
| 4b | Pide al asistente **"Propón un plan de 2 sesiones para estos temas"**. | La sección **Plan de sesiones** queda en verde con Aceptar y Descartar, y avisa que la IA no elige fecha, hora ni lugar. **Descartar** devuelve el plan anterior. Pulsa **Aceptar**. (También puedes pedirle temas: la sección Temas se marca igual.) | ☐ |
| 5 | Completa las **2 sesiones**: fecha y hora futuras, duración entre 15 y 480 minutos y, si quieres, lugar y descripción. | Una fecha u hora pasada muestra "La fecha y hora deben ser posteriores al momento actual." | ☐ |
| 6 | Pulsa **Crear grupo**. | El botón cambia a "Creando grupo…", el formulario se bloquea y luego se abre `/grupos/{idGrupo}` (pestaña Chat). | ☐ |
| 7 | Revisa las pestañas del grupo recién creado. | **Recursos → Temas**: los 2 temas. **Sesiones**: las 2 sesiones programadas. **Integrantes**: "Quedan 12 espacios disponibles" (cupos = capacidad). | ☐ |
| 8 | Vuelve a **Mis grupos**. | El grupo nuevo aparece en la lista. También aparece en **Explorar grupos** con sus cupos. | ☐ |

Capturas del caso feliz:

- Paso 2 (sugerencia en verde y aviso):

  ![Paso 2](capturas/us22-paso2.png)

- Paso 4b (plan de sesiones sugerido por la IA, en verde):

  ![Paso 4b](capturas/us22-paso4b.png)

- Paso 5 (temas y sesiones llenos):

  ![Paso 5](capturas/us22-paso5.png)

- Paso 7 (temas, sesiones y cupos del grupo creado):

  ![Paso 7 temas](capturas/us22-paso7-temas.png)
  ![Paso 7 sesiones](capturas/us22-paso7-sesiones.png)
  ![Paso 7 cupos](capturas/us22-paso7-cupos.png)

- Paso 8 (Mis grupos):

  ![Paso 8](capturas/us22-paso8.png)

## Revisión en la base de datos

Reemplaza `:id` por el `idGrupo` del paso 6.

```sql
select id_grupo, nombre, descripcion, metodo_estudio, capacidad_maxima, estado, tipo_grupo, id_creador
from grupos_estudio where id_grupo = :id;

select id_tema, nombre from temas_grupo where id_grupo = :id order by id_tema;

select id_sesion, tema, fecha_hora_inicio, duracion_minutos, lugar, estado
from sesiones_estudio where id_grupo = :id order by fecha_hora_inicio;
```

| Tabla | Esperado | ¿OK? |
|-------|----------|------|
| `grupos_estudio` | 1 fila, `estado = ACTIVO`, `tipo_grupo = TUTOR`, `id_creador` = id del tutor, descripción = la aceptada | ☐ |
| `temas_grupo` | 2 filas con los temas del paso 4 | ☐ |
| `sesiones_estudio` | 2 filas con `estado = PROGRAMADA` y las fechas del paso 5 | ☐ |

Captura de las consultas:

![Base de datos](capturas/us22-base-datos.png)

## Caso negativo: una sesión con fecha pasada no crea nada

El formulario no deja enviar una sesión pasada, así que esta prueba se hace contra el backend
(Postman, o la pestaña Red del navegador con "Edit and resend"). Usa el token del tutor.

```http
POST http://localhost:8080/api/grupos
Authorization: Bearer <token del tutor>
Content-Type: application/json

{
  "nombre": "Grupo que no debe existir",
  "descripcion": "Prueba de rollback",
  "metodoEstudio": "Práctico",
  "capacidadMaxima": 5,
  "idCreador": <id del tutor>,
  "temasIniciales": ["Tema de rollback"],
  "sesionesIniciales": [
    { "tema": "Sesión válida", "descripcion": null, "fechaHoraInicio": "2099-01-15T19:00:00", "duracionMinutos": 60, "lugar": null },
    { "tema": "Sesión pasada", "descripcion": null, "fechaHoraInicio": "2020-01-01T10:00:00", "duracionMinutos": 60, "lugar": null }
  ]
}
```

| Verificación | Esperado | ¿OK? |
|--------------|----------|------|
| Respuesta | `400` con `{"mensaje": "Programa la sesión para una fecha y hora futuras"}` | ☐ |
| `select * from grupos_estudio where nombre = 'Grupo que no debe existir';` | 0 filas | ☐ |
| `select * from temas_grupo where nombre = 'Tema de rollback';` | 0 filas | ☐ |
| `select * from sesiones_estudio where tema = 'Sesión válida';` | 0 filas (la primera sesión, aunque válida, también se revierte) | ☐ |

Capturas del caso negativo:

![Respuesta 400](capturas/us22-negativo-respuesta.png)
![Base de datos sin filas](capturas/us22-negativo-base-datos.png)

## Otros casos rápidos

| Caso | Esperado | ¿OK? |
|------|----------|------|
| Un estudiante envía `sesionesIniciales` a `POST /grupos` | `400` "Solo un tutor puede programar sesiones al crear el grupo" y no se guarda nada | ☐ |
| Una sesión con `duracionMinutos: 10` | `400` "Datos inválidos: la duración mínima es de 15 minutos" | ☐ |
| Un tutor crea un grupo sin temas ni sesiones | Se crea igual que antes | ☐ |
| La IA no está disponible (backend sin `AI_API_KEY`) | El chat muestra "La IA no está disponible en este momento…" y el formulario sigue funcionando | ☐ |
