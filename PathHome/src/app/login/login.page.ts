
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonInput } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { RecuperarContrasenaComponent } from './recuperar-contrasena.component';
import { SupabaseService } from '../core/supabase/supabase.service';
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
  googleProcesando = false;

  aviso = signal('');
  pantallaRecuperacion = false;

  constructor(
    private readonly router: Router,
    private readonly supabase: SupabaseService,
  ) {
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

  async iniciarSesion(): Promise<void> {
    this.enviado = true;
    this.aviso.set('');

    if (!this.correoValido || !this.contrasenaValida) {
      this.aviso.set('Revisa los campos e introduce información válida.');
      return;
    }

    try {
      const { data, error } = await this.supabase.client.auth.signInWithPassword({
        email: this.correo.trim(),
        password: this.contrasena,
      });

      if (error) throw error;
      const metadata = data.user.user_metadata ?? {};
      const hasName = ['full_name', 'fullName', 'name', 'display_name', 'given_name', 'first_name', 'firstName', 'nombre']
        .some((key) => typeof metadata[key] === 'string' && (metadata[key] as string).trim());
      if (!hasName) {
        const emailName = data.user.email?.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
        if (emailName) {
          await this.supabase.client.auth.updateUser({
            data: { full_name: emailName.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase()) },
          });
        }
      }
      const destination = await this.supabase.getDestinationForUser(data.user.id);
      await this.router.navigateByUrl(destination, { replaceUrl: true });
    } catch (error) {
      this.aviso.set(this.mensajeError(error));
    }
  }

  async iniciarSesionGoogle(): Promise<void> {
    if (this.googleProcesando) return;

    this.googleProcesando = true;
    this.aviso.set('');

    try {
      const { error } = await this.supabase.client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/dashboard` },
      });

      if (error) throw error;
    } catch (error) {
      this.googleProcesando = false;
      this.aviso.set(this.mensajeErrorGoogle(error));
    }
  }

  async iniciarSesionAdmin(): Promise<void> {
    this.adminEnviado = true;
    this.aviso.set('');

    if (!this.adminCorreoValido || !this.adminPassword.trim()) {
      this.aviso.set('Revisa los datos del formulario administrativo.');
      return;
    }

    try {
      const { data, error } = await this.supabase.client.auth.signInWithPassword({
        email: this.adminCorreo.trim(),
        password: this.adminPassword,
      });

      if (error) throw error;
      const destination = await this.supabase.getDestinationForUser(data.user.id);
      if (destination !== '/admin') {
        await this.supabase.client.auth.signOut();
        throw new Error('Esta cuenta no tiene permisos de administrador.');
      }
      await this.router.navigateByUrl('/admin', { replaceUrl: true });
    } catch (error) {
      this.aviso.set(this.mensajeError(error));
    }
  }

  mostrarRecuperacion(): void {
    this.aviso.set('');
    this.pantallaRecuperacion = true;
  }

  volverAlLogin(correo: string): void {
    this.correo = correo;
    this.pantallaRecuperacion = false;
  }

  mostrarRegistro(): void {
    void this.router.navigateByUrl('/registro');
  }

  private mensajeError(error: unknown): string {
    const code =
      error && typeof error === 'object' && 'code' in error ? String(error.code) : '';

    if (code === 'invalid_credentials') {
      return 'El correo o la contraseña no coinciden con una cuenta de este proyecto.';
    }

    if (code === 'email_not_confirmed') {
      return 'Confirma el correo electrónico de la cuenta antes de iniciar sesión.';
    }

    return error instanceof Error ? error.message : 'No se pudo iniciar sesión. Inténtalo de nuevo.';
  }

  private mensajeErrorGoogle(error: unknown): string {
    const message = error instanceof Error ? error.message : '';

    if (/provider.*(not enabled|disabled)|unsupported provider/i.test(message)) {
      return 'El acceso con Google todavía no está activado en Supabase.';
    }

    return message || 'No se pudo iniciar sesión con Google. Inténtalo de nuevo.';
  }
}
