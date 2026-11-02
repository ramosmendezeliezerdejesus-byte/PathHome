import { Component, EventEmitter, Output } from '@angular/core';

export type AccountType = 'familia' | 'institucion' | 'profesional';

@Component({
  selector: 'app-registro-tipos',
  templateUrl: './registro-tipos.component.html',
  styleUrls: ['./registro-tipos.component.scss'],
  standalone: true,
})
export class RegistroTiposComponent {
  @Output() seleccionado = new EventEmitter<AccountType>();
  @Output() login = new EventEmitter<void>();
}
