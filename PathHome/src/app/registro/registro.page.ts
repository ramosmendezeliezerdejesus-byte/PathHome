import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { EstadoRegistroComponent } from './estado-registro.component';
import { RegistroFamiliaComponent } from './registro-familia.component';
import { RegistroTiposComponent } from './registro-tipos.component';
import { RegistroVerificacionComponent } from './registro-verificacion.component';

type AccountType = 'familia' | 'institucion' | 'profesional';
type RegistrationScreen = 'tipos' | AccountType | 'confirmacion' | 'pendiente';

@Component({
  selector: 'app-registro',
  templateUrl: './registro.page.html',
  styleUrls: ['./registro.page.scss'],
  standalone: true,
  imports: [
    IonContent,
    EstadoRegistroComponent,
    RegistroFamiliaComponent,
    RegistroTiposComponent,
    RegistroVerificacionComponent,
  ],
})
export class RegistroPage {
  pantalla: RegistrationScreen = 'tipos';
  tipo: AccountType | null = null;

  constructor(private readonly router: Router) {}

  irALogin(): void {
    void this.router.navigateByUrl('/login');
  }

  seleccionarTipo(tipo: AccountType): void {
    this.tipo = tipo;
    this.pantalla = tipo;
  }

  volverATipos(): void {
    this.tipo = null;
    this.pantalla = 'tipos';
  }

  completarFamilia(): void {
    this.pantalla = 'confirmacion';
  }

  enviarSolicitud(): void {
    this.pantalla = 'pendiente';
  }
}
