import { Injectable } from '@angular/core';
import { delay, Observable, of } from 'rxjs';
import {
  AsistenteGrupoRequest,
  AsistenteGrupoResponse,
  SugerenciasGrupoIa,
} from '../models/asistente-grupo.models';

// Cuánto "piensa" el asistente simulado, para que se vea el estado Pensando….
const MILISEGUNDOS_PENSANDO = 1200;

const SIN_CAMBIOS: SugerenciasGrupoIa = {
  nombre: null,
  descripcion: null,
  metodoEstudio: null,
  capacidadMaxima: null,
};

// Descripción genérica que sirve para cualquier grupo de estudio.
export function descripcionGenerica(nombre: string): string {
  return (
    `Un espacio para estudiar ${nombre} en equipo. Resolvemos dudas juntos, compartimos ` +
    'recursos y practicamos con ejercicios para llegar con confianza a las evaluaciones. ' +
    'Todas las preguntas son bienvenidas.'
  );
}

// Quita tildes y mayúsculas para reconocer el pedido aunque se escriba de distintas formas.
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

@Injectable({ providedIn: 'root' })
export class TutorIaService {
  // Asistente IA de "Crear grupo".
  // POR AHORA ES UNA SIMULACIÓN LOCAL: no llama al backend. Cuando se conecte, basta con
  // reemplazar el cuerpo por:
  //   return this.http.post<AsistenteGrupoResponse>(`${environment.apiUrl}/ia/tutorias/asistente`, datos);
  // (el endpoint ya existe en el backend, rama feature/asistente-ia-crear-grupo).
  conversar(datos: AsistenteGrupoRequest): Observable<AsistenteGrupoResponse> {
    return of(this.responderLocalmente(datos)).pipe(delay(MILISEGUNDOS_PENSANDO));
  }

  private responderLocalmente({ pedido, formulario }: AsistenteGrupoRequest): AsistenteGrupoResponse {
    const nombre = formulario.nombre?.trim();
    // Sin nombre no hay de qué partir para recomendar.
    if (!nombre) {
      return {
        respuesta:
          'Para recomendarte algo necesito el nombre del grupo. Escríbelo en el formulario y vuelve a pedírmelo.',
        sugerencias: SIN_CAMBIOS,
      };
    }

    if (normalizar(pedido).includes('descripcion')) {
      const sugerida = descripcionGenerica(nombre);
      if (formulario.descripcion?.trim() === sugerida) {
        return {
          respuesta: 'Tu descripción ya está lista. ¿Quieres que te ayude con algo más?',
          sugerencias: SIN_CAMBIOS,
        };
      }
      return {
        respuesta:
          'Listo. Te sugerí un cambio en la descripción. Está marcado en verde en el formulario para que lo aceptes o descartes.',
        sugerencias: { ...SIN_CAMBIOS, descripcion: sugerida },
      };
    }

    return {
      respuesta:
        'Por ahora puedo ayudarte a mejorar la descripción. Prueba con: "Mejora mi descripción de grupo".',
      sugerencias: SIN_CAMBIOS,
    };
  }
}
