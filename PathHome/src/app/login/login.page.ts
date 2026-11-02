
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonInput } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { RecuperarContrasenaComponent } from './recuperar-contrasena.component';
import {
  mailOutline,
  lockClosedOutline,
  eyeOutline,
  eyeOffOutline,
  shieldCheckmarkOutline,
  chevronUpOutline,
  chevronDownOutline
} from 'ionicons/icons';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [
    FormsModule,
    IonContent,
    IonButton,
    IonInput,
    IonIcon,
    RecuperarContrasenaComponent
  ]
})
export class LoginPage {
  correo = '';
  contrasena = '';
  mostrarPassword = false;

  adminCorreo = '';
  adminPassword = '';
  mostrarAdminPassword = false;

  enviado = false;
  adminEnviado = false;
  adminAbierto = false;

  aviso = '';
  pantallaRecuperacion = false;

  constructor(private readonly router: Router) {
    addIcons({
      'mail-outline': mailOutline,
      'lock-closed-outline': lockClosedOutline,
      'eye-outline': eyeOutline,
      'eye-off-outline': eyeOffOutline,
      'shield-checkmark-outline': shieldCheckmarkOutline,
      'chevron-up-outline': chevronUpOutline,
      'chevron-down-outline': chevronDownOutline
    });
  }

  get correoValido(): boolean {
    const email = this.correo.trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  get contrasenaValida(): boolean {
    return this.contrasena.trim().length > 0;
  }

  get adminCorreoValido(): boolean {
    const email = this.adminCorreo.trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  iniciarSesion(): void {
    this.enviado = true;
    this.aviso = '';

    if (!this.correoValido || !this.contrasenaValida) {
      this.aviso = 'Revisa los campos e introduce información válida.';
      return;
    }

    this.aviso =
      'El formulario está completo, pero la autenticación todavía no está implementada.';
  }

  iniciarSesionAdmin(): void {
    this.adminEnviado = true;
    this.aviso = '';

    if (!this.adminCorreoValido || !this.adminPassword.trim()) {
      this.aviso = 'Revisa los datos del formulario administrativo.';
      return;
    }

    this.aviso =
      'El formulario administrativo está completo, pero el acceso todavía no está conectado.';
  }

  mostrarRecuperacion(): void {
    this.aviso = '';
    this.pantallaRecuperacion = true;
  }

  volverAlLogin(correo: string): void {
    this.correo = correo;
    this.pantallaRecuperacion = false;
  }

  mostrarRegistro(): void {
    void this.router.navigateByUrl('/registro');
  }
}
