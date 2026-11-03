import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AccountType } from './registro-tipos.component';
import { SupabaseService } from '../core/supabase/supabase.service';

@Component({
  selector: 'app-registro-verificacion',
  templateUrl: './registro-verificacion.component.html',
  styleUrls: ['./registro-verificacion.component.scss'],
  standalone: true,
  imports: [FormsModule],
})
export class RegistroVerificacionComponent {
  @Input({ required: true }) tipo: AccountType = 'institucion';
  @Output() volver = new EventEmitter<void>();
  @Output() enviado = new EventEmitter<void>();
  validado = false;
  nombre = '';
  correo = '';
  cedula = '';
  codigo = '';
  contrasena = '';
  nombreFoto = '';
  fotoDemo = false;
  archivo: File | null = null;
  procesando = false;
  aviso = '';
  private usuarioId: string | null = null;

  constructor(private readonly supabase: SupabaseService) {}

  correoValido(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  cedulaValida(value: string): boolean {
    return /^\d{3}-\d{7}-\d$/.test(value.trim());
  }

  contrasenaValida(value: string): boolean {
    return /^(?=.*[A-Z])(?=.*\d).{8,}$/.test(value);
  }

  seleccionarFoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.archivo = null;
      this.nombreFoto = '';
      this.aviso = 'Selecciona un archivo de imagen.';
      return;
    }

    this.archivo = file;
    this.nombreFoto = file.name;
    this.fotoDemo = false;
    this.aviso = '';
  }

  usarFotoDemo(): void {
    this.nombreFoto = 'Foto de ejemplo (demo)';
    this.fotoDemo = true;
    this.archivo = null;
  }

  enviarSolicitud(): void {
    this.validado = true;
    this.aviso = '';
    if (
      this.nombre.trim() &&
      this.correoValido(this.correo) &&
      this.cedulaValida(this.cedula) &&
      this.contrasenaValida(this.contrasena) &&
      (this.fotoDemo || this.archivo)
    ) {
      if (this.fotoDemo || !this.archivo) {
        this.aviso = 'La foto de ejemplo es solo visual. Selecciona tu propio documento para enviarlo.';
        return;
      }

      void this.enviarSolicitudASupabase();
    }
  }

  private async enviarSolicitudASupabase(): Promise<void> {
    const accountType = this.tipo;
    if (accountType === 'familia') {
      this.aviso = 'Este formulario solo sirve para instituciones y profesionales.';
      return;
    }

    this.procesando = true;

    try {
      if (!this.usuarioId) {
        const { data: sessionData } = await this.supabase.client.auth.getSession();
        const currentUser = sessionData.session?.user;

        if (currentUser) {
          if (currentUser.email?.toLowerCase() !== this.correo.trim().toLowerCase()) {
            throw new Error('Hay una sesión abierta con otro correo. Cierra esa sesión o usa el correo de la cuenta activa.');
          }

          this.usuarioId = currentUser.id;
        } else {
          const { data, error } = await this.supabase.client.auth.signUp({
            email: this.correo.trim(),
            password: this.contrasena,
            options: {
              data: {
                account_type: this.tipo,
                full_name: this.nombre.trim(),
                national_id: this.cedula.trim(),
                phone: '',
              },
            },
          });

          if (error) throw error;

          if (!data.session || !data.user) {
            this.aviso = 'La cuenta se creó, pero falta confirmar el correo. Confírmalo e inicia sesión; luego vuelve a este formulario para subir el documento y enviar la solicitud. Todavía no se envió el archivo.';
            return;
          }

          this.usuarioId = data.user.id;
        }
      }

      const userId = this.usuarioId;
      if (!userId) {
        throw new Error('No se pudo identificar la cuenta. Inicia sesión e inténtalo otra vez.');
      }

      await this.supabase.submitVerification({
        userId,
        accountType,
        verificationCode: this.codigo,
        file: this.archivo!,
      });

      this.enviado.emit();
    } catch (error) {
      this.aviso = error instanceof Error ? error.message : 'No se pudo enviar la solicitud.';
    } finally {
      this.procesando = false;
    }
  }
}
