import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../core/supabase/supabase.service';

@Component({
  selector: 'app-registro-familia',
  templateUrl: './registro-familia.component.html',
  styleUrls: ['./registro-familia.component.scss'],
  standalone: true,
  imports: [FormsModule],
})
export class RegistroFamiliaComponent {
  @Output() volver = new EventEmitter<void>();
  @Output() completado = new EventEmitter<string>();
  enviado = false;
  procesando = false;
  aviso = '';
  familia = {
    nombre: '',
    apellido: '',
    cedula: '',
    correo: '',
    telefono: '',
    contrasena: '',
    confirmacion: '',
  };

  constructor(private readonly supabase: SupabaseService) {}

  correoValido(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  cedulaValida(value: string): boolean {
    return /^\d{3}-\d{7}-\d$/.test(value.trim());
  }

  get telefonoValido(): boolean {
    return /^\d{3}-\d{3}-\d{4}$/.test(this.familia.telefono.trim());
  }

  contrasenaValida(value: string): boolean {
    return /^(?=.*[A-Z])(?=.*\d).{8,}$/.test(value);
  }

  crearCuenta(): void {
    this.enviado = true;
    this.aviso = '';
    if (
      this.familia.nombre.trim() &&
      this.familia.apellido.trim() &&
      this.cedulaValida(this.familia.cedula) &&
      this.correoValido(this.familia.correo) &&
      this.telefonoValido &&
      this.contrasenaValida(this.familia.contrasena) &&
      this.familia.confirmacion === this.familia.contrasena
    ) {
      void this.crearCuentaEnSupabase();
    }
  }

  private async crearCuentaEnSupabase(): Promise<void> {
    this.procesando = true;

    try {
      const { data, error } = await this.supabase.client.auth.signUp({
        email: this.familia.correo.trim(),
        password: this.familia.contrasena,
        options: {
          data: {
            account_type: 'familia',
            full_name: `${this.familia.nombre.trim()} ${this.familia.apellido.trim()}`,
            national_id: this.familia.cedula.trim(),
            phone: this.familia.telefono.trim(),
          },
        },
      });

      if (error) throw error;

      this.completado.emit(
        data.session
          ? 'Tu cuenta de familia quedó creada. Ya puedes iniciar sesión.'
          : 'Tu cuenta quedó creada. Revisa tu correo y confirma la dirección antes de iniciar sesión.',
      );
    } catch (error) {
      this.aviso = error instanceof Error ? error.message : 'No se pudo crear la cuenta.';
    } finally {
      this.procesando = false;
    }
  }
}
