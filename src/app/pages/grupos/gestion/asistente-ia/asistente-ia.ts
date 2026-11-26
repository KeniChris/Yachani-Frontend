import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  EventEmitter,
  inject,
  Injector,
  Input,
  Output,
  signal,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Subscription } from 'rxjs';
import {
  CambiosPropuestaIa,
  MensajeAsistenteIa,
  PropuestaGrupoIa,
} from '../../../../core/models/asistente-grupo.models';
import { AuthService } from '../../../../core/services/auth.service';
import { errorApi } from '../../../../core/services/recursos-ui';
import { TutorIaService } from '../../../../core/services/tutor-ia.service';

// Cuántos mensajes previos se mandan a la IA para que entienda pedidos como "hazla más corta".
const MAXIMO_HISTORIAL = 10;

interface MensajeChat extends MensajeAsistenteIa {
  error?: boolean;
}

// Asistente IA flotante de "Crear grupo" (tutor). Conversa con el tutor usando el agente de
// propuesta (POST /ia/tutorias/ajuste) y, cuando propone cambios (incluidos temas y plan de
// sesiones), los emite con (sugerir) para que el formulario los marque en verde.
@Component({
  selector: 'app-asistente-ia',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './asistente-ia.html',
  styleUrl: './asistente-ia.css',
})
export class AsistenteIa {
  private readonly ia = inject(TutorIaService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  // Lee el formulario en el momento de enviar: así la IA ve lo último que escribió el tutor.
  @Input({ required: true }) leerFormulario!: () => PropuestaGrupoIa;
  @Output() readonly sugerir = new EventEmitter<CambiosPropuestaIa>();

  @ViewChild('lista') private lista?: ElementRef<HTMLElement>;
  @ViewChild('campoPedido') private campoPedido?: ElementRef<HTMLInputElement>;

  readonly abierto = signal(false);
  readonly mensajes = signal<MensajeChat[]>([]);
  readonly pensando = signal(false);
  readonly pedido = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(500)],
  });
  private readonly textoPedido = signal('');
  readonly puedeEnviar = computed(() => !this.pensando() && this.textoPedido().trim().length > 0);

  readonly saludo = computed(() => {
    const nombre = this.auth.usuario()?.nombres?.trim().split(/\s+/)[0];
    return `Hola${nombre ? ', ' + nombre : ''}. Puedo ayudarte a mejorar tu grupo. Ya veo lo que llenaste en el formulario.`;
  });

  private peticion?: Subscription;

  constructor() {
    this.pedido.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((valor) => this.textoPedido.set(valor ?? ''));
  }

  abrir() {
    this.abierto.set(true);
    this.alFinal();
    afterNextRender(() => this.campoPedido?.nativeElement.focus(), { injector: this.injector });
  }

  // Minimizar conserva la conversación; cerrar la reinicia.
  minimizar() {
    this.abierto.set(false);
  }

  cerrar() {
    this.peticion?.unsubscribe();
    this.pensando.set(false);
    this.mensajes.set([]);
    this.pedido.reset();
    this.abierto.set(false);
  }

  enviar() {
    if (!this.puedeEnviar() || this.pedido.invalid) return;
    const texto = this.pedido.value.trim();
    const historial = this.mensajes()
      .filter((m) => !m.error)
      .slice(-MAXIMO_HISTORIAL)
      .map(({ rol, texto }) => ({ rol, texto }));

    this.mensajes.update((lista) => [...lista, { rol: 'USUARIO', texto }]);
    this.pedido.reset();
    this.pensando.set(true);
    this.alFinal();

    this.peticion = this.ia
      .ajustar({ mensaje: texto, propuesta: this.leerFormulario(), historial })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.pensando.set(false);
          this.responder({ rol: 'ASISTENTE', texto: respuesta.respuesta });
          if (respuesta.cambios) this.sugerir.emit(respuesta.cambios);
        },
        error: (error: unknown) => {
          this.pensando.set(false);
          this.responder({
            rol: 'ASISTENTE',
            error: true,
            texto:
              error instanceof HttpErrorResponse && error.status === 503
                ? 'La IA no está disponible en este momento. Inténtalo de nuevo en unos minutos.'
                : errorApi(error),
          });
        },
      });
  }

  private responder(mensaje: MensajeChat) {
    this.mensajes.update((lista) => [...lista, mensaje]);
    this.alFinal();
  }

  // Lleva la lista al último mensaje después de que Angular lo pinte.
  private alFinal() {
    afterNextRender(
      () => {
        const lista = this.lista?.nativeElement;
        if (lista) lista.scrollTop = lista.scrollHeight;
      },
      { injector: this.injector },
    );
  }
}
