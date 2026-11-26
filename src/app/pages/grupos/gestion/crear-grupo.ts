import { Component, DestroyRef, Input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { METODOS_ESTUDIO_GRUPO } from '../../../core/models/grupo-estudio.models';
import {
  FormularioGrupoIa,
  SugerenciasGrupoIa,
} from '../../../core/models/asistente-grupo.models';
import { GrupoEstudioService } from '../../../core/services/grupo-estudio.service';
import { SesionUsuarioService } from '../../../core/services/sesion-usuario.service';
import { AsistenteIa } from './asistente-ia/asistente-ia';

// Campos del formulario que el asistente IA puede proponer cambiar.
type CampoGrupo = 'nombre' | 'descripcion' | 'metodo' | 'capacidad';

// Una sugerencia pendiente: el valor que propone la IA (ya puesto en el campo) y el que
// había antes, para devolverlo si el tutor la descarta.
interface Sugerencia {
  anterior: string | number | null;
  sugerido: string | number;
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
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
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
  // Formulario de creación: empieza vacío y los ejemplos de Figma van como placeholder.
  readonly form = new FormGroup({
    nombre: new FormControl('', { nonNullable: true, validators: Validators.required }),
    descripcion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(500)],
    }),
    metodo: new FormControl('', { nonNullable: true, validators: Validators.required }),
    capacidad: new FormControl<number | null>(null, [Validators.required, Validators.min(2)]),
  });
  // App zoneless: el estado que cambia tras una respuesta HTTP tiene que ser signal().
  readonly errorCrear = signal('');
  // El backend limita cuántos grupos puede crear cada quien (10 tutor, 5 estudiante);
  // cuando responde con ese error se muestra la pantalla de límite alcanzado.
  readonly limiteAlcanzado = signal(false);
  readonly mensajeLimite = signal('');
  // Sugerencias del asistente IA que el tutor todavía no aceptó ni descartó. Mientras
  // están pendientes el campo ya muestra el valor sugerido, marcado en verde.
  readonly sugerencias = signal<Partial<Record<CampoGrupo, Sugerencia>>>({});
  constructor(
    private readonly api: GrupoEstudioService,
    private readonly router: Router,
    private readonly sesion: SesionUsuarioService,
    destroyRef: DestroyRef,
  ) {
    // Si el tutor edita a mano un campo sugerido, lo damos por aceptado: ya es suyo.
    const ediciones = (Object.keys(this.form.controls) as CampoGrupo[]).map((campo) =>
      this.form.get(campo)!.valueChanges.subscribe((valor: unknown) => {
        const pendiente = this.sugerencias()[campo];
        if (pendiente && valor !== pendiente.sugerido) this.quitarSugerencia(campo);
      }),
    );
    destroyRef.onDestroy(() => ediciones.forEach((s) => s.unsubscribe()));
  }

  // Lo que ve la IA al recibir un mensaje: el formulario tal como está ahora.
  readonly leerFormulario = (): FormularioGrupoIa => {
    const f = this.form.getRawValue();
    return {
      nombre: f.nombre.trim() || null,
      descripcion: f.descripcion.trim() || null,
      metodoEstudio: f.metodo || null,
      capacidadMaxima: f.capacidad,
    };
  };

  // Pone en el formulario lo que propone la IA y recuerda el valor anterior de cada campo.
  aplicarSugerencias(s: SugerenciasGrupoIa) {
    const propuestas: [CampoGrupo, string | number | null][] = [
      ['nombre', s.nombre],
      ['descripcion', s.descripcion],
      ['metodo', s.metodoEstudio && this.metodos.includes(s.metodoEstudio) ? s.metodoEstudio : null],
      ['capacidad', s.capacidadMaxima],
    ];
    for (const [campo, valor] of propuestas) {
      if (valor === null || valor === undefined) continue;
      const control = this.form.controls[campo];
      // Si ya había una sugerencia sin resolver, "anterior" sigue siendo el valor original.
      const anterior = this.sugerencias()[campo]?.anterior ?? control.value;
      this.sugerencias.update((actuales) => ({ ...actuales, [campo]: { anterior, sugerido: valor } }));
      control.setValue(valor as never);
      control.markAsTouched();
    }
  }

  tieneSugerencia(campo: CampoGrupo): boolean {
    return !!this.sugerencias()[campo];
  }

  aceptarSugerencia(campo: CampoGrupo) {
    this.quitarSugerencia(campo);
  }

  descartarSugerencia(campo: CampoGrupo) {
    const pendiente = this.sugerencias()[campo];
    if (!pendiente) return;
    this.quitarSugerencia(campo);
    this.form.controls[campo].setValue(pendiente.anterior as never);
  }

  private quitarSugerencia(campo: CampoGrupo) {
    this.sugerencias.update(({ [campo]: _, ...resto }) => resto);
  }
  // US09: crear grupo. El backend recibe idCreador y deduce el tipo de grupo
  // (TUTOR o ESTUDIANTES) del tipo de usuario, así que vale para ambos roles.
  crearGrupo() {
    if (this.form.invalid) return;
    this.errorCrear.set('');
    const f = this.form.getRawValue();
    this.api
      .crearGrupo({
        nombre: f.nombre,
        descripcion: f.descripcion,
        metodoEstudio: f.metodo,
        capacidadMaxima: f.capacidad!,
        idCreador: this.sesion.idUsuario(this.rolVisible),
      })
      .subscribe({
        next: () => {
          // Con merge se conserva el ?rol= de la vista previa: sin eso "Mis grupos"
          // volvería al estudiante de ejemplo y el grupo recién creado no aparecería.
          this.router.navigate(['/grupos/gestion'], {
            queryParams: { grupos: 'creado', crear: null },
            queryParamsHandling: 'merge',
          });
        },
        error: (respuesta) => {
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
