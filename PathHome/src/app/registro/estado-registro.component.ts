import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-estado-registro',
  templateUrl: './estado-registro.component.html',
  styleUrls: ['./estado-registro.component.scss'],
  standalone: true,
})
export class EstadoRegistroComponent {
  @Input() pendiente = false;
  @Output() nuevoRegistro = new EventEmitter<void>();

  constructor(private readonly router: Router) {}

  irALogin(): void {
    void this.router.navigateByUrl('/login');
  }
}
