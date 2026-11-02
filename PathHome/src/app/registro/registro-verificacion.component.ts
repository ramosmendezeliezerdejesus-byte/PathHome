import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AccountType } from './registro-tipos.component';

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
    this.nombreFoto = file.name;
    this.fotoDemo = false;
  }

  usarFotoDemo(): void {
    this.nombreFoto = 'Foto de ejemplo (demo)';
    this.fotoDemo = true;
  }

  enviarSolicitud(): void {
    this.validado = true;
    if (
      this.nombre.trim() &&
      this.correoValido(this.correo) &&
      this.cedulaValida(this.cedula) &&
      this.contrasenaValida(this.contrasena) &&
      (this.fotoDemo || this.nombreFoto)
    ) {
      this.enviado.emit();
    }
  }
}
