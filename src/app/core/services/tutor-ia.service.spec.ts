import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AsistenteGrupoRequest, AsistenteGrupoResponse } from '../models/asistente-grupo.models';
import { TutorIaService } from './tutor-ia.service';

describe('TutorIaService', () => {
  let servicio: TutorIaService;
  let http: HttpTestingController;

  const datos: AsistenteGrupoRequest = {
    pedido: 'Mejora mi descripción de grupo',
    formulario: { nombre: 'Dominando Cálculo', descripcion: null, metodoEstudio: null, capacidadMaxima: 12 },
    historial: [{ rol: 'USUARIO', texto: 'Hola' }],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    servicio = TestBed.inject(TutorIaService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('envía el pedido al asistente real del backend y devuelve su respuesta', () => {
    const respuesta: AsistenteGrupoResponse = {
      respuesta: 'Listo. Te sugerí una descripción.',
      sugerencias: { nombre: null, descripcion: 'Repasamos derivadas.', metodoEstudio: null, capacidadMaxima: null },
    };
    let recibida: AsistenteGrupoResponse | undefined;

    servicio.conversar(datos).subscribe((r) => (recibida = r));

    const peticion = http.expectOne(`${environment.apiUrl}/ia/tutorias/asistente`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual(datos);
    peticion.flush(respuesta);
    expect(recibida).toEqual(respuesta);
  });

  it('propaga el 503 para que el chat muestre que la IA no está disponible', () => {
    let error: HttpErrorResponse | undefined;

    servicio.conversar(datos).subscribe({ error: (e) => (error = e) });

    http
      .expectOne(`${environment.apiUrl}/ia/tutorias/asistente`)
      .flush({ mensaje: 'La IA no está disponible en este momento' }, { status: 503, statusText: 'Service Unavailable' });
    expect(error?.status).toBe(503);
  });

  it('envía el ajuste de la propuesta al agente del backend', () => {
    const ajuste = {
      mensaje: 'Agrega un tema de integrales',
      propuesta: {
        nombre: 'Dominando Cálculo',
        descripcion: null,
        metodoEstudio: 'Práctico',
        capacidadMaxima: 12,
        temas: [{ nombre: 'Derivadas', orden: 1 }],
        planSesiones: [],
      },
      historial: [],
    };
    let recibida: unknown;

    servicio.ajustar(ajuste).subscribe((r) => (recibida = r));

    const peticion = http.expectOne(`${environment.apiUrl}/ia/tutorias/ajuste`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual(ajuste);
    const respuesta = {
      respuesta: 'Agregué Integrales.',
      cambios: { temas: [{ nombre: 'Derivadas', orden: 1 }, { nombre: 'Integrales', orden: 2 }] },
      estado: 'COMPLETA',
      faltantes: [],
    };
    peticion.flush(respuesta);
    expect(recibida).toEqual(respuesta);
  });
});
