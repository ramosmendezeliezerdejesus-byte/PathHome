import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { SupabaseService } from '../core/supabase/supabase.service';

@Component({
  selector: 'app-acceso-pendiente',
  standalone: true,
  imports: [IonContent],
  template: `
    <ion-content class="pending-content">
      <main class="pending-card">
        <span class="pending-icon" aria-hidden="true">📄</span>
        <h1>Solicitud en revisión</h1>
        <p>El acceso a las áreas de psicólogos e instituciones se habilita después de que el administrador revise y apruebe el documento enviado.</p>
        <button type="button" (click)="refresh()">Comprobar estado</button>
        <button type="button" class="secondary" (click)="signOut()">Cerrar sesión</button>
        @if (message) { <span class="message" role="status">{{ message }}</span> }
      </main>
    </ion-content>
  `,
  styles: [`
    :host{display:block;min-height:100%}.pending-content{--background:#faf8fc;color:#50577f}.pending-card{box-sizing:border-box;display:grid;min-height:100vh;place-content:center;justify-items:center;gap:14px;max-width:620px;margin:auto;padding:32px;text-align:center}.pending-icon{display:grid;width:78px;height:78px;place-items:center;border-radius:50%;background:#fff0d7;font-size:34px}.pending-card h1{margin:0;font-size:27px}.pending-card p{max-width:540px;margin:0;color:#858ba6;font-size:16px;line-height:1.6}.pending-card button{min-height:43px;margin-top:7px;padding:0 19px;border:0;border-radius:12px;background:#899be7;color:white;font-weight:800;cursor:pointer}.pending-card button.secondary{margin-top:0;background:#eeeef4;color:#676d8c}.message{color:#73799a;font-size:14px}
  `],
})
export class AccessPendingPage {
  message = '';

  constructor(
    private readonly supabase: SupabaseService,
    private readonly router: Router,
  ) {}

  async refresh(): Promise<void> {
    this.message = '';
    try {
      const { data, error } = await this.supabase.client.auth.getUser();
      if (error || !data.user) {
        await this.router.navigateByUrl('/login', { replaceUrl: true });
        return;
      }
      const destination = await this.supabase.getDestinationForUser(data.user.id);
      if (destination !== '/acceso-pendiente') {
        await this.router.navigateByUrl(destination, { replaceUrl: true });
        return;
      }
      this.message = 'Tu solicitud sigue pendiente de aprobación.';
    } catch {
      this.message = 'No pudimos comprobar el estado. Inténtalo de nuevo más tarde.';
    }
  }

  async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
