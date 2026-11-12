import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { SupabaseService } from '../core/supabase/supabase.service';

@Component({
  selector: 'app-institucion',
  standalone: true,
  imports: [IonContent],
  template: `
    <ion-content class="institution-content">
      <main class="institution-placeholder">
        <span aria-hidden="true">🏛️</span>
        <h1>Espacio de la institución</h1>
        <p>Este apartado estará disponible próximamente.</p>
        <button type="button" (click)="signOut()">Cerrar sesión</button>
      </main>
    </ion-content>
  `,
  styles: [`
    :host{display:block;min-height:100%}.institution-content{--background:#f8f7fb;color:#50577f}.institution-placeholder{box-sizing:border-box;display:grid;min-height:100vh;place-content:center;justify-items:center;gap:12px;padding:28px;text-align:center}.institution-placeholder>span{display:grid;width:76px;height:76px;place-items:center;border-radius:50%;background:#e5f2fb;font-size:36px}.institution-placeholder h1{margin:0;font-size:25px}.institution-placeholder p{margin:0;color:#9297af}.institution-placeholder button{margin-top:10px;padding:11px 18px;border:0;border-radius:12px;background:#8c9ce7;color:#fff;font-weight:750;cursor:pointer}
  `],
})
export class InstitutionPage {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly router: Router,
  ) {}

  async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
