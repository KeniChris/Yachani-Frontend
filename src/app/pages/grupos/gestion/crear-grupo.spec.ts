import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { GrupoEstudioResponse } from '../../../core/models/grupo-estudio.models';
import { GrupoEstudioService } from '../../../core/services/grupo-estudio.service';
import { SesionUsuarioService } from '../../../core/services/sesion-usuario.service';
import { CrearGrupo } from './crear-grupo';

describe('CrearGrupo', () => {
  const crearGrupo = vi.fn();
  let componente: CrearGrupo;
  let router: Router;

  function montar(rol: 'tutor' | 'estudiante') {
    TestBed.configureTestingModule({
      imports: [CrearGrupo],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: GrupoEstudioService, useValue: { crearGrupo } },
        {
          provide: SesionUsuarioService,
          useValue: { esTutor: (r: string) => r === 'tutor', idUsuario: () => 7 },
        },
      ],
    });
    const fixture = TestBed.createComponent(CrearGrupo);
    componente = fixture.componentInstance;
    componente.rol = rol;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    return fixture;
  }

  function llenarDatosBase() {
    componente.form.patchValue({
      nombre: 'Dominando Cálculo',
      descripcion: 'Descripción del tutor',
      metodo: 'Práctico',
      capacidad: 12,
    });
  }

  beforeEach(() => {
    crearGrupo.mockReset();
    crearGrupo.mockReturnValue(of({ idGrupo: 42 } as GrupoEstudioResponse));
  });

  it('envía lo aprobado: valores actuales, temas y sesiones, y abre el grupo creado', () => {
    montar('tutor');
    llenarDatosBase();
    // La IA propone una descripción; el tutor la descarta y se envía la suya.
    componente.aplicarSugerencias({
      nombre: 'Nombre de la IA',
      descripcion: 'Descripción de la IA',
      metodoEstudio: null,
      capacidadMaxima: null,
    });
    componente.aceptarSugerencia('nombre');
    componente.descartarSugerencia('descripcion');

    componente.agregarTema();
    componente.agregarTema();
    componente.temas.at(0).setValue(' Derivadas ');
    componente.temas.at(1).setValue('Integrales');

    componente.agregarSesion();
    componente.sesiones.at(0).patchValue({
      tema: ' Repaso de derivadas ',
      fecha: new Date(2099, 0, 15),
      hora: new Date(2099, 0, 15, 19, 30),
      duracion: 90,
      lugar: '',
      descripcion: 'Ejercicios',
    });

    componente.crearGrupo();

    expect(crearGrupo).toHaveBeenCalledWith({
      nombre: 'Nombre de la IA',
      descripcion: 'Descripción del tutor',
      metodoEstudio: 'Práctico',
      capacidadMaxima: 12,
      idCreador: 7,
      temasIniciales: ['Derivadas', 'Integrales'],
      sesionesIniciales: [
        {
          tema: 'Repaso de derivadas',
          descripcion: 'Ejercicios',
          fechaHoraInicio: '2099-01-15T19:30:00',
          duracionMinutos: 90,
          lugar: null,
        },
      ],
    });
    expect(router.navigate).toHaveBeenCalledWith(['/grupos', 42], {
      queryParams: { grupos: null, crear: null },
      queryParamsHandling: 'merge',
    });
  });

  it('no deja crear el grupo mientras haya sugerencias de la IA sin revisar', () => {
    montar('tutor');
    llenarDatosBase();
    componente.aplicarSugerencias({
      nombre: null,
      descripcion: 'Descripción de la IA',
      metodoEstudio: null,
      capacidadMaxima: null,
    });

    expect(componente.haySugerenciasPendientes()).toBe(true);
    componente.crearGrupo();
    expect(crearGrupo).not.toHaveBeenCalled();

    componente.aceptarSugerencia('descripcion');
    expect(componente.haySugerenciasPendientes()).toBe(false);
    componente.crearGrupo();
    expect(crearGrupo).toHaveBeenCalledOnce();
    expect(crearGrupo.mock.calls[0][0].descripcion).toBe('Descripción de la IA');
  });

  it('muestra el aviso de sugerencias pendientes en la pantalla', () => {
    const fixture = montar('tutor');
    componente.aplicarSugerencias({ nombre: 'Grupo IA', descripcion: null, metodoEstudio: null, capacidadMaxima: null });
    fixture.detectChanges();

    const pantalla = fixture.nativeElement as HTMLElement;
    expect(pantalla.querySelector('.notice.warning')?.textContent).toContain(
      'Acepta o descarta los cambios sugeridos antes de crear el grupo.',
    );
    const boton = [...pantalla.querySelectorAll('button')].find((b) => b.textContent?.includes('Crear grupo'));
    expect(boton?.disabled).toBe(true);
  });

  it('no crea el grupo con temas repetidos ni con una sesión en el pasado', () => {
    montar('tutor');
    llenarDatosBase();
    componente.agregarTema();
    componente.agregarTema();
    componente.temas.at(0).setValue('Derivadas');
    componente.temas.at(1).setValue(' derivadas ');
    componente.crearGrupo();
    expect(componente.temas.hasError('temaRepetido')).toBe(true);
    expect(crearGrupo).not.toHaveBeenCalled();

    componente.quitarTema(1);
    componente.agregarSesion();
    componente.sesiones.at(0).patchValue({
      tema: 'Atrasada',
      fecha: new Date(2020, 0, 1),
      hora: new Date(2020, 0, 1, 10, 0),
    });
    componente.crearGrupo();
    expect(componente.sesiones.at(0).hasError('fechaPasada')).toBe(true);
    expect(crearGrupo).not.toHaveBeenCalled();
  });

  it('limita los temas a 3 y las sesiones a 10', () => {
    montar('tutor');
    for (let i = 0; i < 5; i++) componente.agregarTema();
    for (let i = 0; i < 12; i++) componente.agregarSesion();
    expect(componente.temas.length).toBe(3);
    expect(componente.sesiones.length).toBe(10);
  });

  it('un estudiante envía temas pero nunca sesiones', () => {
    montar('estudiante');
    llenarDatosBase();
    componente.agregarTema();
    componente.temas.at(0).setValue('Derivadas');

    componente.crearGrupo();

    const enviado = crearGrupo.mock.calls[0][0];
    expect(enviado.temasIniciales).toEqual(['Derivadas']);
    expect('sesionesIniciales' in enviado).toBe(false);
  });

  it('la IA puede proponer temas: se marcan en verde, bloquean la creación y se pueden descartar', () => {
    const fixture = montar('tutor');
    llenarDatosBase();
    componente.agregarTema();
    componente.temas.at(0).setValue('Mis temas');

    componente.aplicarSugerencias({
      temas: [
        { nombre: 'Derivadas', orden: 1 },
        { nombre: 'Integrales', orden: 2 },
      ],
    });
    fixture.detectChanges();

    expect(componente.temas.getRawValue()).toEqual(['Derivadas', 'Integrales']);
    expect(componente.tieneSugerencia('temas')).toBe(true);
    const seccion = (fixture.nativeElement as HTMLElement).querySelector('fieldset[formarrayname="temas"]');
    expect(seccion?.classList).toContain('campo-sugerido');
    componente.crearGrupo();
    expect(crearGrupo).not.toHaveBeenCalled();

    componente.descartarSugerencia('temas');
    expect(componente.temas.getRawValue()).toEqual(['Mis temas']);
    expect(componente.haySugerenciasPendientes()).toBe(false);
  });

  it('la IA puede proponer el plan de sesiones conservando fecha, hora y lugar del tutor', () => {
    montar('tutor');
    llenarDatosBase();
    componente.agregarSesion();
    componente.sesiones.at(0).patchValue({
      tema: 'Mi sesión',
      fecha: new Date(2099, 0, 15),
      hora: new Date(2099, 0, 15, 19, 30),
      lugar: 'Aula 3',
    });

    componente.aplicarSugerencias({
      planSesiones: [
        { numero: 1, titulo: 'Repaso de derivadas', tema: 'Derivadas', objetivo: 'Practicar', duracionMinutos: 90 },
        { numero: 2, titulo: 'Simulacro', tema: 'Derivadas', objetivo: null, duracionMinutos: null },
      ],
    });

    const [primera, segunda] = componente.sesiones.getRawValue();
    expect(primera).toMatchObject({ tema: 'Repaso de derivadas', descripcion: 'Practicar', duracion: 90, lugar: 'Aula 3' });
    expect(primera.fecha).toEqual(new Date(2099, 0, 15));
    expect(segunda).toMatchObject({ tema: 'Simulacro', descripcion: '', duracion: 60, fecha: null, hora: null });
    expect(componente.tieneSugerencia('sesiones')).toBe(true);

    // Aceptar no basta: la segunda sesión necesita fecha y hora antes de crear.
    componente.aceptarSugerencia('sesiones');
    componente.crearGrupo();
    expect(crearGrupo).not.toHaveBeenCalled();

    componente.sesiones.at(1).patchValue({ fecha: new Date(2099, 0, 22), hora: new Date(2099, 0, 22, 19, 30) });
    componente.crearGrupo();
    expect(crearGrupo.mock.calls[0][0].sesionesIniciales.map((s: { tema: string }) => s.tema)).toEqual([
      'Repaso de derivadas',
      'Simulacro',
    ]);
  });

  it('editar a mano un tema sugerido lo da por aceptado', () => {
    montar('tutor');
    componente.aplicarSugerencias({ temas: [{ nombre: 'Derivadas', orden: 1 }] });
    componente.temas.at(0).setValue('Derivadas parciales');
    expect(componente.tieneSugerencia('temas')).toBe(false);
  });

  it('la IA ve la propuesta completa, con temas y plan de sesiones', () => {
    montar('tutor');
    llenarDatosBase();
    componente.agregarTema();
    componente.temas.at(0).setValue(' Derivadas ');
    componente.agregarSesion();
    componente.sesiones.at(0).patchValue({ tema: 'Repaso', descripcion: 'Ejercicios', duracion: 45 });

    expect(componente.leerFormulario()).toEqual({
      nombre: 'Dominando Cálculo',
      descripcion: 'Descripción del tutor',
      metodoEstudio: 'Práctico',
      capacidadMaxima: 12,
      temas: [{ nombre: 'Derivadas', orden: 1 }],
      planSesiones: [{ numero: 1, titulo: 'Repaso', tema: null, objetivo: 'Ejercicios', duracionMinutos: 45 }],
    });
  });
});
