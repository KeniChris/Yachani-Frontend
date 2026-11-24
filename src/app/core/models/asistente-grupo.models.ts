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
