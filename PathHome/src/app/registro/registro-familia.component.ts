import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-registro-familia',
  templateUrl: './registro-familia.component.html',
  styleUrls: ['./registro-familia.component.scss'],
  standalone: true,
  imports: [FormsModule],
})
export class RegistroFamiliaComponent {
  @Output() volver = new EventEmitter<void>();
  @Output() completado = new EventEmitter<void>();
  enviado = false;
  familia = {
    nombre: '',
    apellido: '',
    cedula: '',
    correo: '',
    telefono: '',
    contrasena: '',
    confirmacion: '',
  };

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
    if (
      this.familia.nombre.trim() &&
      this.familia.apellido.trim() &&
      this.cedulaValida(this.familia.cedula) &&
      this.correoValido(this.familia.correo) &&
      this.telefonoValido &&
      this.contrasenaValida(this.familia.contrasena) &&
      this.familia.confirmacion === this.familia.contrasena
    ) {
      this.completado.emit();
    }
  }
}
