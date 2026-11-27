import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface AppointmentSchedulerFamilyOption { id: string; label: string; }
export interface AppointmentSchedulerDraft { familyId: string; date: string; time: string; location: string; note: string; }

@Component({
  selector: 'app-appointment-scheduler',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './appointment-scheduler.component.html',
  styleUrl: './appointment-scheduler.component.scss',
})
export class AppointmentSchedulerComponent {
  @Input() title = 'Agendar cita';
  @Input() description = 'Selecciona la familia y los detalles de la cita.';
  @Input() familyOptions: AppointmentSchedulerFamilyOption[] = [];
  @Input() familyId = '';
  @Input() familyLabel = '';
  @Input() date = '';
  @Input() time = '';
  @Input() location = '';
  @Input() locationReadOnly = false;
  @Input() locationLabel = 'Dirección del lugar de la cita';
  @Input() note = '';
  @Input() submitLabel = 'Agendar y avisar a la familia';
  @Input() feedback = '';
  @Input() busy = false;
  @Output() familyIdChange = new EventEmitter<string>();
  @Output() dateChange = new EventEmitter<string>();
  @Output() timeChange = new EventEmitter<string>();
  @Output() locationChange = new EventEmitter<string>();
  @Output() noteChange = new EventEmitter<string>();
  @Output() scheduleRequested = new EventEmitter<AppointmentSchedulerDraft>();

  submit(): void {
    if (!this.date || !this.time || !this.location.trim() || (this.familyOptions.length > 0 && !this.familyId) || this.busy) return;
    this.scheduleRequested.emit({ familyId: this.familyId, date: this.date, time: this.time, location: this.location.trim(), note: this.note });
  }
}
