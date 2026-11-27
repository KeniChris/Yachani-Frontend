import { Component, computed, DestroyRef, Input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTimepickerModule } from '@angular/material/timepicker';
import {
  METODOS_ESTUDIO_GRUPO,
  SesionInicialRequest,
} from '../../../core/models/grupo-estudio.models';
import { CambiosPropuestaIa, PropuestaGrupoIa } from '../../../core/models/asistente-grupo.models';
import { GrupoEstudioService } from '../../../core/services/grupo-estudio.service';
import { SesionUsuarioService } from '../../../core/services/sesion-usuario.service';
import { AsistenteIa } from './asistente-ia/asistente-ia';

// Límites que también valida el backend (CrearGrupoRequest y SesionInicialRequest).
export const MAXIMO_TEMAS = 3;
export const MAXIMO_SESIONES = 10;

// Campos del formulario que el asistente IA puede proponer cambiar.
type CampoGrupo = 'nombre' | 'descripcion' | 'metodo' | 'capacidad';
// Listas que el asistente IA puede reemplazar completas.
type ListaGrupo = 'temas' | 'sesiones';
type CampoSugerible = CampoGrupo | ListaGrupo;

// Una sugerencia pendiente: el valor que propone la IA (ya puesto en el formulario) y el que
// había antes, para devolverlo si el tutor la descarta. En las listas, "sugerido" es la firma
// de la lista sugerida, para notar si el tutor la edita a mano.
interface Sugerencia {
  anterior: unknown;
  sugerido: unknown;
}

const firma = (valor: unknown) => JSON.stringify(valor);

type SesionForm = FormGroup<{
  tema: FormControl<string>;
  fecha: FormControl<Date | null>;
  hora: FormControl<Date | null>;
  duracion: FormControl<number | null>;
  lugar: FormControl<string>;
  descripcion: FormControl<string>;
}>;
type ValoresSesion = ReturnType<SesionForm['getRawValue']>;

// Une la fecha del datepicker y la hora del timepicker en un Date local.
function inicioSesion(fecha: Date | null, hora: Date | null): Date | null {
  if (!fecha || !hora) return null;
  const inicio = new Date(fecha);
  inicio.setHours(hora.getHours(), hora.getMinutes(), 0, 0);
  return inicio;
}

// Hora local sin "Z" (p. ej. 2026-11-15T19:00:00), como la espera LocalDateTime en el backend.
export function fechaHoraLocal(inicio: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0');
  return (
    `${inicio.getFullYear()}-${dos(inicio.getMonth() + 1)}-${dos(inicio.getDate())}` +
    `T${dos(inicio.getHours())}:${dos(inicio.getMinutes())}:00`
  );
}

// La sesión debe empezar después del momento actual.
function inicioFuturo(grupo: AbstractControl): ValidationErrors | null {
  const { fecha, hora } = (grupo as SesionForm).getRawValue();
  const inicio = inicioSesion(fecha, hora);
  return inicio && inicio.getTime() <= Date.now() ? { fechaPasada: true } : null;
}

// Dos temas con el mismo nombre (sin importar mayúsculas ni espacios) no se permiten.
function temasSinRepetir(lista: AbstractControl): ValidationErrors | null {
  const nombres = (lista as FormArray<FormControl<string>>)
    .getRawValue()
    .map((nombre) => nombre.trim().toLowerCase())
    .filter((nombre) => nombre.length > 0);
  return new Set(nombres).size !== nombres.length ? { temaRepetido: true } : null;
}

@Component({
  selector: 'app-crear-grupo',
  standalone: true,
  imports: [
    AsistenteIa,
    NgTemplateOutlet,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTimepickerModule,
  ],
  providers: [provideNativeDateAdapter(), { provide: MAT_DATE_LOCALE, useValue: 'es-PE' }],
  templateUrl: './crear-grupo.html',
  styleUrls: ['../grupos.css', './crear-grupo.css'],
})
export class CrearGrupo {
  // Variante visual mediante ?rol=tutor: G04 (tutor) y G05 (estudiante). Si hay sesión
  // iniciada manda el tipo de usuario real; si no, el ?rol= de la vista previa.
  private rolVisible = 'estudiante';
  @Input() set rol(valor: string) {
    this.rolVisible = valor || 'estudiante';
  }
  get esTutor() {
    return this.sesion.esTutor(this.rolVisible);
  }
  // Límite de grupos alcanzado (G08 tutor, G14 estudiante) mediante ?crear=limite.
  @Input() crear = '';
  readonly metodos = METODOS_ESTUDIO_GRUPO;
  readonly maximoTemas = MAXIMO_TEMAS;
  readonly maximoSesiones = MAXIMO_SESIONES;
  readonly hoy = new Date();
  // Formulario de creación: empieza vacío y los ejemplos de Figma van como placeholder.
  readonly form = new FormGroup({
    nombre: new FormControl('', { nonNullable: true, validators: Validators.required }),
    descripcion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(500)],
    }),
    metodo: new FormControl('', { nonNullable: true, validators: Validators.required }),
    capacidad: new FormControl<number | null>(null, [Validators.required, Validators.min(2)]),
    // Temas iniciales (tutor y estudiante): hasta 3, sin repetir.
    temas: new FormArray<FormControl<string>>([], temasSinRepetir),
    // Plan de sesiones (solo tutor): hasta 10. Puede quedar vacío.
    sesiones: new FormArray<SesionForm>([]),
  });
  // App zoneless: el estado que cambia tras una respuesta HTTP tiene que ser signal().
  readonly errorCrear = signal('');
  readonly guardando = signal(false);
  // El backend limita cuántos grupos puede crear cada quien (10 tutor, 5 estudiante);
  // cuando responde con ese error se muestra la pantalla de límite alcanzado.
  readonly limiteAlcanzado = signal(false);
  readonly mensajeLimite = signal('');
  // Sugerencias del asistente IA que el tutor todavía no aceptó ni descartó. Mientras
  // están pendientes el campo ya muestra el valor sugerido, marcado en verde.
  readonly sugerencias = signal<Partial<Record<CampoSugerible, Sugerencia>>>({});
  // No se puede crear el grupo hasta revisar cada sugerencia de la IA.
  readonly haySugerenciasPendientes = computed(() => Object.keys(this.sugerencias()).length > 0);
  constructor(
    private readonly api: GrupoEstudioService,
    private readonly router: Router,
    private readonly sesion: SesionUsuarioService,
    destroyRef: DestroyRef,
  ) {
    // Si el tutor edita a mano un campo sugerido, lo damos por aceptado: ya es suyo.
    const campos: CampoGrupo[] = ['nombre', 'descripcion', 'metodo', 'capacidad'];
    const ediciones = campos.map((campo) =>
      (this.form.controls[campo] as AbstractControl).valueChanges.subscribe((valor: unknown) => {
        const pendiente = this.sugerencias()[campo];
        if (pendiente && valor !== pendiente.sugerido) this.quitarSugerencia(campo);
      }),
    );
    // Lo mismo con las listas: agregar, quitar o editar un tema o sesión sugeridos los acepta.
    const listas: ListaGrupo[] = ['temas', 'sesiones'];
    for (const lista of listas) {
      ediciones.push(
        (this.form.controls[lista] as AbstractControl).valueChanges.subscribe(() => {
          const pendiente = this.sugerencias()[lista];
          if (pendiente && firma(this.form.controls[lista].getRawValue()) !== pendiente.sugerido) {
            this.quitarSugerencia(lista);
          }
        }),
      );
    }
    destroyRef.onDestroy(() => ediciones.forEach((s) => s.unsubscribe()));
  }

  get temas() {
    return this.form.controls.temas;
  }

  get sesiones() {
    return this.form.controls.sesiones;
  }

  // Lo que ve la IA al recibir un mensaje: la propuesta tal como está ahora en el formulario.
  readonly leerFormulario = (): PropuestaGrupoIa => {
    const f = this.form.getRawValue();
    return {
      nombre: f.nombre.trim() || null,
      descripcion: f.descripcion.trim() || null,
      metodoEstudio: f.metodo || null,
      capacidadMaxima: f.capacidad,
      temas: f.temas
        .map((tema) => tema.trim())
        .filter((tema) => tema.length > 0)
        .map((nombre, i) => ({ nombre, orden: i + 1 })),
      // El título de la sesión es su "tema" en el formulario; la descripción, su objetivo.
      planSesiones: this.esTutor
        ? f.sesiones.map((sesion, i) => ({
            numero: i + 1,
            titulo: sesion.tema.trim(),
            tema: null,
            objetivo: sesion.descripcion.trim() || null,
            duracionMinutos: sesion.duracion,
          }))
        : [],
    };
  };

  // Pone en el formulario lo que propone la IA y recuerda el valor anterior de cada campo.
  aplicarSugerencias(c: CambiosPropuestaIa) {
    const propuestas: [CampoGrupo, string | number | null | undefined][] = [
      ['nombre', c.nombre],
      ['descripcion', c.descripcion],
      [
        'metodo',
        c.metodoEstudio && this.metodos.includes(c.metodoEstudio) ? c.metodoEstudio : null,
      ],
      ['capacidad', c.capacidadMaxima],
    ];
    for (const [campo, valor] of propuestas) {
      if (valor === null || valor === undefined) continue;
      const control = this.form.controls[campo];
      // Si ya había una sugerencia sin resolver, "anterior" sigue siendo el valor original.
      const previa = this.sugerencias()[campo];
      const anterior = previa ? previa.anterior : control.value;
      this.sugerencias.update((actuales) => ({
        ...actuales,
        [campo]: { anterior, sugerido: valor },
      }));
      control.setValue(valor as never);
      control.markAsTouched();
    }

    if (c.temas) {
      const anterior = this.sugerencias().temas?.anterior ?? this.temas.getRawValue();
      this.ponerTemas(c.temas.map((tema) => tema.nombre));
      this.marcarLista('temas', anterior);
    }

    if (c.planSesiones && this.esTutor) {
      const actuales = this.sesiones.getRawValue();
      const anterior = this.sugerencias().sesiones?.anterior ?? actuales;
      // La IA no propone fecha, hora ni lugar: se conservan los de la sesión en esa posición.
      this.ponerSesiones(
        c.planSesiones.map((sesion, i) => ({
          tema: sesion.titulo,
          descripcion: sesion.objetivo ?? '',
          duracion: sesion.duracionMinutos ?? 60,
          fecha: actuales[i]?.fecha ?? null,
          hora: actuales[i]?.hora ?? null,
          lugar: actuales[i]?.lugar ?? '',
        })),
      );
      this.marcarLista('sesiones', anterior);
    }
  }

  private marcarLista(lista: ListaGrupo, anterior: unknown) {
    const sugerido = firma(this.form.controls[lista].getRawValue());
    this.sugerencias.update((actuales) => ({ ...actuales, [lista]: { anterior, sugerido } }));
    this.form.controls[lista].markAllAsTouched();
  }

  tieneSugerencia(campo: CampoSugerible): boolean {
    return !!this.sugerencias()[campo];
  }

  aceptarSugerencia(campo: CampoSugerible) {
    this.quitarSugerencia(campo);
  }

  descartarSugerencia(campo: CampoSugerible) {
    const pendiente = this.sugerencias()[campo];
    if (!pendiente) return;
    this.quitarSugerencia(campo);
    if (campo === 'temas') {
      this.ponerTemas(pendiente.anterior as string[]);
    } else if (campo === 'sesiones') {
      this.ponerSesiones(pendiente.anterior as ValoresSesion[]);
    } else {
      this.form.controls[campo].setValue(pendiente.anterior as never);
    }
  }

  private quitarSugerencia(campo: CampoSugerible) {
    this.sugerencias.update(({ [campo]: _, ...resto }) => resto);
  }

  agregarTema() {
    if (this.temas.length >= MAXIMO_TEMAS) return;
    this.temas.push(this.nuevoTema(''));
  }

  private nuevoTema(nombre: string) {
    return new FormControl(nombre, {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    });
  }

  // Reemplaza la lista sin emitir cambios, para no tomarlo como una edición del tutor.
  private ponerTemas(nombres: string[]) {
    this.temas.clear({ emitEvent: false });
    nombres
      .slice(0, MAXIMO_TEMAS)
      .forEach((nombre) => this.temas.push(this.nuevoTema(nombre), { emitEvent: false }));
  }

  quitarTema(indice: number) {
    this.temas.removeAt(indice);
  }

  agregarSesion() {
    if (this.sesiones.length >= MAXIMO_SESIONES) return;
    this.sesiones.push(this.nuevaSesion());
  }

  private ponerSesiones(valores: ValoresSesion[]) {
    this.sesiones.clear({ emitEvent: false });
    valores.slice(0, MAXIMO_SESIONES).forEach((valor) => {
      const sesion = this.nuevaSesion();
      sesion.setValue(valor, { emitEvent: false });
      this.sesiones.push(sesion, { emitEvent: false });
    });
  }

  private nuevaSesion(): SesionForm {
    return new FormGroup(
      {
        tema: new FormControl('', {
          nonNullable: true,
          validators: [Validators.required, Validators.maxLength(150)],
        }),
        fecha: new FormControl<Date | null>(null, Validators.required),
        hora: new FormControl<Date | null>(null, Validators.required),
        duracion: new FormControl<number | null>(60, [
          Validators.required,
          Validators.min(15),
          Validators.max(480),
        ]),
        lugar: new FormControl('', { nonNullable: true, validators: Validators.maxLength(200) }),
        descripcion: new FormControl('', {
          nonNullable: true,
          validators: Validators.maxLength(500),
        }),
      },
      { validators: inicioFuturo },
    );
  }

  quitarSesion(indice: number) {
    this.sesiones.removeAt(indice);
  }

  // Lo APROBADO: los valores actuales del formulario. Las sugerencias pendientes bloquean la
  // creación, así que nunca se envía una propuesta de la IA sin revisar.
  private solicitud() {
    const f = this.form.getRawValue();
    const temasIniciales = f.temas.map((tema) => tema.trim()).filter((tema) => tema.length > 0);
    const sesionesIniciales: SesionInicialRequest[] = f.sesiones.map((s) => ({
      tema: s.tema.trim(),
      descripcion: s.descripcion.trim() || null,
      fechaHoraInicio: fechaHoraLocal(inicioSesion(s.fecha, s.hora)!),
      duracionMinutos: s.duracion!,
      lugar: s.lugar.trim() || null,
    }));
    return {
      nombre: f.nombre,
      descripcion: f.descripcion,
      metodoEstudio: f.metodo,
      capacidadMaxima: f.capacidad!,
      idCreador: this.sesion.idUsuario(this.rolVisible),
      temasIniciales,
      // El backend rechaza sesiones enviadas por un estudiante.
      ...(this.esTutor ? { sesionesIniciales } : {}),
    };
  }

  // US09 + US22: crear grupo. El backend recibe idCreador y deduce el tipo de grupo
  // (TUTOR o ESTUDIANTES) del tipo de usuario. Grupo, temas y sesiones se guardan juntos.
  crearGrupo() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.haySugerenciasPendientes() || this.guardando()) return;
    // Un estudiante no ve el plan de sesiones: no puede quedar invalidando el formulario.
    if (!this.esTutor) this.sesiones.clear();
    this.errorCrear.set('');
    this.guardando.set(true);
    const datos = this.solicitud();
    this.form.disable({ emitEvent: false });
    this.api.crearGrupo(datos).subscribe({
      next: (grupo) => {
        this.guardando.set(false);
        // Abre el grupo recién creado. Con merge se conserva el ?rol= de la vista previa.
        this.router.navigate(['/grupos', grupo.idGrupo], {
          queryParams: { grupos: null, crear: null },
          queryParamsHandling: 'merge',
        });
      },
      error: (respuesta) => {
        this.guardando.set(false);
        this.form.enable({ emitEvent: false });
        const mensaje: string = respuesta.error?.mensaje || '';
        if (mensaje.toLowerCase().includes('máximo')) {
          this.mensajeLimite.set(mensaje);
          this.limiteAlcanzado.set(true);
          return;
        }
        this.errorCrear.set(mensaje || 'No pudimos crear el grupo.');
      },
    });
  }
}
