import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-recuperar-contrasena',
  templateUrl: './recuperar-contrasena.component.html',
  styleUrls: ['./recuperar-contrasena.component.scss'],
  standalone: true,
  imports: [FormsModule],
})
export class RecuperarContrasenaComponent {
  @Input() correoInicial = '';
  @Output() volver = new EventEmitter<string>();

  correo = '';
  enviado = false;
  mensaje = '';

  ngOnInit(): void {
    this.correo = this.correoInicial;
  }

  get correoValido(): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.correo.trim());
  }

  enviarEnlace(): void {
    this.enviado = true;
    this.mensaje = this.correoValido
      ? 'La solicitud está lista. El envío del enlace todavía no está conectado.'
      : '';
  }
}
