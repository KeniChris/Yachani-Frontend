import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AjusteTutoriaRequest,
  AjusteTutoriaResponse,
  AsistenteGrupoRequest,
  AsistenteGrupoResponse,
} from '../models/asistente-grupo.models';

@Injectable({ providedIn: 'root' })
export class TutorIaService {
  private readonly http = inject(HttpClient);

  // Asistente IA de "Crear grupo". La clave de OpenAI vive solo en el backend; si la IA no
  // está disponible responde 503 y el chat muestra su propio aviso.
  conversar(datos: AsistenteGrupoRequest): Observable<AsistenteGrupoResponse> {
    return this.http.post<AsistenteGrupoResponse>(`${environment.apiUrl}/ia/tutorias/asistente`, datos);
  }

  // Ajuste de la propuesta completa: además de nombre, descripción, método y capacidad,
  // puede cambiar los temas y el plan de sesiones. Es el que usa el chat de "Crear grupo".
  ajustar(datos: AjusteTutoriaRequest): Observable<AjusteTutoriaResponse> {
    return this.http.post<AjusteTutoriaResponse>(`${environment.apiUrl}/ia/tutorias/ajuste`, datos);
  }
}
