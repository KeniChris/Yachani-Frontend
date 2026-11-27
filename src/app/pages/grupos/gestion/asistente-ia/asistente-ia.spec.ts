import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { TutorIaService } from '../../../../core/services/tutor-ia.service';
import { AsistenteIa } from './asistente-ia';

describe('AsistenteIa', () => {
  it('muestra un aviso claro cuando el backend responde 503', () => {
    TestBed.configureTestingModule({
      imports: [AsistenteIa],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: TutorIaService,
          useValue: {
            ajustar: () => throwError(() => new HttpErrorResponse({ status: 503 })),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(AsistenteIa);
    const chat = fixture.componentInstance;
    chat.leerFormulario = () => ({
      nombre: null,
      descripcion: null,
      metodoEstudio: null,
      capacidadMaxima: null,
      temas: [],
      planSesiones: [],
    });
    fixture.detectChanges();

    chat.pedido.setValue('Mejora mi descripción de grupo');
    chat.enviar();

    const ultimo = chat.mensajes().at(-1);
    expect(ultimo?.error).toBe(true);
    expect(ultimo?.texto).toBe('La IA no está disponible en este momento. Inténtalo de nuevo en unos minutos.');
    expect(chat.pensando()).toBe(false);
  });

  it('envía la propuesta completa al agente y emite los cambios de temas y sesiones', () => {
    const cambios = {
      temas: [{ nombre: 'Derivadas', orden: 1 }],
      planSesiones: [{ numero: 1, titulo: 'Repaso', tema: 'Derivadas', objetivo: null, duracionMinutos: 60 }],
    };
    const ajustar = vi.fn().mockReturnValue(
      of({ respuesta: 'Te propuse temas y sesiones.', cambios, estado: 'COMPLETA', faltantes: [] }),
    );
    TestBed.configureTestingModule({
      imports: [AsistenteIa],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TutorIaService, useValue: { ajustar } },
      ],
    });
    const fixture = TestBed.createComponent(AsistenteIa);
    const chat = fixture.componentInstance;
    const propuesta = {
      nombre: 'Dominando Cálculo',
      descripcion: null,
      metodoEstudio: 'Práctico',
      capacidadMaxima: 12,
      temas: [],
      planSesiones: [],
    };
    chat.leerFormulario = () => propuesta;
    const emitidos: unknown[] = [];
    chat.sugerir.subscribe((c) => emitidos.push(c));
    fixture.detectChanges();

    chat.pedido.setValue('Propón temas y sesiones');
    chat.enviar();

    expect(ajustar).toHaveBeenCalledWith({ mensaje: 'Propón temas y sesiones', propuesta, historial: [] });
    expect(emitidos).toEqual([cambios]);
    expect(chat.mensajes().at(-1)?.texto).toBe('Te propuse temas y sesiones.');
  });
});
