// Coincide con com.yachaniapi.ia.dto.Request.AsistenteGrupoRequest.
export interface AsistenteGrupoRequest {
  pedido: string;
  formulario: FormularioGrupoIa;
  historial: MensajeAsistenteIa[];
}

// Lo que el tutor lleva llenado en "Crear grupo" (vacío = null).
export interface FormularioGrupoIa {
  nombre: string | null;
  descripcion: string | null;
  metodoEstudio: string | null;
  capacidadMaxima: number | null;
}

export interface MensajeAsistenteIa {
  rol: 'USUARIO' | 'ASISTENTE';
  texto: string;
}

// Coincide con com.yachaniapi.ia.dto.Response.AsistenteGrupoResponse.
export interface AsistenteGrupoResponse {
  respuesta: string;
  sugerencias: SugerenciasGrupoIa;
}

// Solo vienen con valor los campos que la IA propone cambiar.
export interface SugerenciasGrupoIa {
  nombre: string | null;
  descripcion: string | null;
  metodoEstudio: string | null;
  capacidadMaxima: number | null;
}

// US22 · Agente de propuesta (POST /ia/tutorias/ajuste). A diferencia del asistente, también
// propone temas y plan de sesiones.
// Coincide con com.yachaniapi.ia.dto.Response.PropuestaGrupo.
export interface PropuestaGrupoIa {
  nombre: string | null;
  descripcion: string | null;
  metodoEstudio: string | null;
  capacidadMaxima: number | null;
  temas: TemaPropuestoIa[];
  planSesiones: SesionPropuestaIa[];
}

export interface TemaPropuestoIa {
  nombre: string;
  orden: number;
}

// La IA no propone fecha, hora ni lugar: los elige el tutor en el formulario.
export interface SesionPropuestaIa {
  numero: number;
  titulo: string;
  tema: string | null;
  objetivo: string | null;
  duracionMinutos: number | null;
}

// Coincide con com.yachaniapi.ia.dto.Request.AjusteTutoriaRequest.
export interface AjusteTutoriaRequest {
  mensaje: string;
  propuesta: PropuestaGrupoIa;
  historial: MensajeAsistenteIa[];
}

// Solo vienen los campos que la IA cambia; temas y planSesiones llegan como la lista completa.
export type CambiosPropuestaIa = Partial<PropuestaGrupoIa>;

// Coincide con com.yachaniapi.ia.dto.Response.AjusteTutoriaResponse.
export interface AjusteTutoriaResponse {
  respuesta: string;
  cambios: CambiosPropuestaIa;
  estado: 'COMPLETA' | 'INCOMPLETA';
  faltantes: { campo: string; mensaje: string }[];
}
