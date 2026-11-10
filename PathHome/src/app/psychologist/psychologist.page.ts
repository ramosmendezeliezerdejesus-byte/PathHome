import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';

type PsychologistSection = 'inicio' | 'expedientes' | 'evaluaciones' | 'citas' | 'informes' | 'notificaciones' | 'perfil';
type RecordStatus = 'Pendiente' | 'En progreso' | 'Completada';
type AppointmentStatus = 'Pendiente' | 'Realizada' | 'Cancelada';

interface ChildInfo {
  name: string; age: string; sex: string; height: string; favoriteColor: string;
  music: string; hobbies: string; favoriteFoods: string; personality: string;
  familyWish: string; privateNotes: string;
}

interface PsychologistCase {
  id: string; name: string; status: string; tone: string; childInfo?: ChildInfo; documents: string;
}

interface Appointment {
  id: number; caseId: string; type: string; date: string; dateValue: string; time: string;
  note: string; status: AppointmentStatus;
}

interface Evaluation {
  id: number; caseId: string; caseName: string; title: string; status: RecordStatus;
  updated: string; observations: string; results: string; recommendations: string;
}

interface Report {
  id: number; caseId: string; title: string; conclusions: string; recommendations: string; created: string;
}

interface CalendarDay { key: string; day: number; inMonth: boolean; }

interface NotificationItem {
  id: number; category: string; title: string; description: string; when: string;
  icon: string; tone: string; read: boolean;
}

@Component({
  selector: 'app-psychologist',
  templateUrl: './psychologist.page.html',
  styleUrls: [
    './psychologist.page.scss',
    './psychologist.home.scss',
    './psychologist.home-summary.scss',
    './psychologist.home-responsive.scss',
    './psychologist.home-dashboard.scss',
    './psychologist.home-workspace.scss',
    './psychologist.home-dashboard-responsive.scss',
    './psychologist.appointments.scss',
    './psychologist.appointment-calendar.scss',
    './psychologist.appointment-calendar-responsive.scss',
    './psychologist.profile.scss',
    './psychologist.cases.scss',
    './psychologist.case-table.scss',
    './psychologist.case-detail.scss',
    './psychologist.case-workspace.scss',
    './psychologist.evaluations.scss',
    './psychologist.evaluation-table.scss',
    './psychologist.evaluation-form.scss',
    './psychologist.evaluation-responsive.scss',
    './psychologist.reports.scss',
    './psychologist.notifications.scss',
  ],
  standalone: true,
  imports: [IonContent, FormsModule],
})
export class PsychologistPage {
  activeSection: PsychologistSection = 'inicio';
  notificationsEnabled = true;
  nextAppointmentId = 2;
  nextEvaluationId = 3;
  nextReportId = 1;
  appointmentFeedback = '';
  evaluationFeedback = '';
  reportFeedback = '';
  profileFeedback = '';
  profilePhotoUrl = '';
  caseSearch = '';
  selectedCase: PsychologistCase | null = null;
  selectedEvaluationId: number | null = null;
  activeCaseFilter = 'Todos';
  activeEvaluationFilter = 'Todas';
  activeAppointmentFilter = 'Todas';
  activeNotificationFilter = 'Todas';
  calendarMonth = new Date(2025, 4, 1);
  selectedCalendarDate = '2025-05-10';

  readonly sections: { id: PsychologistSection; label: string }[] = [
    { id: 'inicio', label: 'Inicio' },
    { id: 'expedientes', label: 'Expedientes' },
    { id: 'evaluaciones', label: 'Evaluaciones' },
    { id: 'citas', label: 'Citas' },
    { id: 'informes', label: 'Informes' },
    { id: 'notificaciones', label: 'Notificaciones' },
    { id: 'perfil', label: 'Perfil' },
  ];

  readonly cases: PsychologistCase[] = [
    {
      id: '2025-0147', name: 'Ana Rodríguez', status: 'Evaluación psicológica pendiente', tone: 'lilac', documents: '',
      childInfo: {
        name: 'Valentina', age: '7 años', sex: 'Niña', height: '1.20 m', favoriteColor: 'Rosa', music: 'Pop',
        hobbies: 'Baile · Dibujo', favoriteFoods: 'Pizza · Frutas', personality: 'Alegre, creativa y empática',
        familyWish: 'Quiero una familia que me quiera, me escuche y con la que pueda seguir soñando.', privateNotes: '',
      },
    },
    { id: '2025-0136', name: 'Familia Santana', status: 'Evaluación registrada', tone: 'mint', documents: '' },
  ];

  readonly caseFilters = ['Todos', 'Pendientes', 'Registrados'];
  readonly evaluationFilters = ['Todas', 'Pendiente', 'En progreso', 'Completada'];
  readonly appointmentFilters = ['Todas', 'Pendiente', 'Realizada', 'Cancelada'];
  readonly notificationFilters = ['Todas', 'Citas', 'Expedientes', 'Evaluaciones', 'Sistema'];

  readonly evaluations: Evaluation[] = [
    { id: 1, caseId: '2025-0147', caseName: 'Ana Rodríguez', title: 'Evaluación psicológica', status: 'Pendiente', updated: 'Pendiente de revisión · Demo', observations: '', results: '', recommendations: '' },
    { id: 2, caseId: '2025-0136', caseName: 'Familia Santana', title: 'Evaluación psicológica', status: 'Completada', updated: 'Registro demostrativo existente', observations: '', results: '', recommendations: '' },
  ];

  readonly appointments: Appointment[] = [
    { id: 1, caseId: '2025-0147', type: 'Evaluación psicológica', date: '10 de mayo de 2025', dateValue: '2025-05-10', time: '10:00 a. m.', note: '', status: 'Pendiente' },
  ];

  readonly recentActivity = [
    { title: 'Evaluación pendiente', detail: 'Exp. 2025-0147 · dato demostrativo', when: 'Demo' },
    { title: 'Evaluación registrada', detail: 'Exp. 2025-0136 · dato demostrativo', when: 'Demo' },
  ];

  readonly notifications: NotificationItem[] = [
    { id: 1, category: 'Expedientes', title: 'Expediente asignado', description: 'Nuevo expediente de ejemplo disponible en la lista local.', when: 'Ahora', icon: 'folder', tone: 'blue-tone', read: false },
    { id: 2, category: 'Evaluaciones', title: 'Evaluación pendiente', description: 'Hay una evaluación demostrativa pendiente de revisión.', when: 'Hace 2 h', icon: 'edit', tone: 'lilac-tone', read: false },
    { id: 3, category: 'Citas', title: 'Cita de demostración', description: 'La agenda contiene una cita de ejemplo vinculada a un expediente.', when: 'Hace 1 día', icon: 'calendar', tone: 'pink-tone', read: true },
    { id: 4, category: 'Sistema', title: 'Vista de demostración', description: 'La información mostrada no se sincroniza con servicios externos.', when: 'Hace 2 días', icon: 'info', tone: 'blue-tone', read: true },
  ];

  readonly appointmentForm = { caseId: '2025-0147', type: 'Entrevista inicial', date: '', time: '', note: '' };
  readonly evaluationDraft = { caseId: '2025-0147', status: 'En progreso' as RecordStatus, observations: '', results: '', recommendations: '' };
  readonly reportDraft = { caseId: '2025-0147', title: '', conclusions: '', recommendations: '' };

  profile = {
    name: 'Dra. Laura Méndez', email: 'psico@pathhome.com', phone: '', specialty: 'Psicóloga especializada',
    education: '', credentials: '', institution: '', officeHours: '',
  };

  constructor(private readonly router: Router) {}

  get filteredCases(): PsychologistCase[] {
    const query = this.caseSearch.trim().toLocaleLowerCase('es');
    return this.cases.filter((item) => {
      const matchesQuery = `${item.id} ${item.name} ${item.status}`.toLocaleLowerCase('es').includes(query);
      const matchesFilter = this.activeCaseFilter === 'Todos'
        || (this.activeCaseFilter === 'Pendientes' && item.status.toLowerCase().includes('pendiente'))
        || (this.activeCaseFilter === 'Registrados' && item.status.toLowerCase().includes('registrada'));
      return matchesQuery && matchesFilter;
    });
  }

  get filteredEvaluations(): Evaluation[] {
    return this.evaluations.filter((item) => this.activeEvaluationFilter === 'Todas' || item.status === this.activeEvaluationFilter);
  }

  get filteredAppointments(): Appointment[] {
    return this.appointments.filter((item) => this.activeAppointmentFilter === 'Todas' || item.status === this.activeAppointmentFilter);
  }

  get upcomingAppointments(): Appointment[] {
    const today = new Date().toISOString().slice(0, 10);
    return this.appointments.filter((item) => item.status === 'Pendiente' && item.dateValue >= today);
  }

  get filteredNotifications(): NotificationItem[] {
    return this.notifications.filter((item) => this.activeNotificationFilter === 'Todas' || item.category === this.activeNotificationFilter);
  }

  get calendarMonthLabel(): string {
    return this.calendarMonth.toLocaleDateString('es', { month: 'long', year: 'numeric' });
  }

  get calendarWeeks(): CalendarDay[][] {
    const year = this.calendarMonth.getFullYear();
    const month = this.calendarMonth.getMonth();
    const offset = (new Date(year, month, 1).getDay() + 6) % 7;
    const start = new Date(year, month, 1 - offset);
    const days = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      return { key: this.toDateKey(date), day: date.getDate(), inMonth: date.getMonth() === month };
    });
    return Array.from({ length: 6 }, (_, index) => days.slice(index * 7, index * 7 + 7));
  }

  get selectedCalendarLabel(): string {
    return new Date(`${this.selectedCalendarDate}T12:00:00`).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  get selectedDayAppointments(): Appointment[] {
    return this.appointments.filter((item) => item.dateValue === this.selectedCalendarDate);
  }

  get scheduledAppointments(): number { return this.appointments.filter((item) => item.status !== 'Cancelada').length; }
  get pendingAppointments(): number { return this.appointments.filter((item) => item.status === 'Pendiente').length; }

  get selectedCaseEvaluations(): Evaluation[] {
    return this.selectedCase ? this.evaluations.filter((item) => item.caseId === this.selectedCase?.id) : [];
  }

  get selectedEvaluation(): Evaluation | null {
    return this.selectedCaseEvaluations.find((item) => item.id === this.selectedEvaluationId) ?? this.selectedCaseEvaluations[0] ?? null;
  }

  get unreadCount(): number { return this.notifications.filter((item) => !item.read).length; }
  get pendingEvaluations(): number { return this.evaluations.filter((item) => item.status === 'Pendiente').length; }

  evaluationCount(status: RecordStatus): number { return this.evaluations.filter((item) => item.status === status).length; }
  caseName(id: string): string { return this.cases.find((item) => item.id === id)?.name ?? 'Expediente de demostración'; }
  statusClass(status: string): string {
    if (status === 'Pendiente') return 'status-pill status-pending';
    if (status === 'En progreso') return 'status-pill status-progress';
    return 'status-pill status-done';
  }

  showSection(section: PsychologistSection): void {
    this.activeSection = section;
    this.selectedCase = null;
    this.appointmentFeedback = '';
    this.evaluationFeedback = '';
    this.reportFeedback = '';
    this.profileFeedback = '';
  }

  openCase(item: PsychologistCase): void {
    this.showSection('expedientes');
    this.selectedCase = item;
    this.selectedEvaluationId = this.evaluations.find((evaluation) => evaluation.caseId === item.id)?.id ?? null;
  }
  closeCase(): void { this.selectedCase = null; this.selectedEvaluationId = null; }

  moveCalendarMonth(amount: number): void {
    this.calendarMonth = new Date(this.calendarMonth.getFullYear(), this.calendarMonth.getMonth() + amount, 1);
  }

  goToToday(): void {
    const now = new Date();
    this.calendarMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    this.selectCalendarDay(this.toDateKey(now));
  }

  selectCalendarDay(date: string): void {
    this.selectedCalendarDate = date;
    this.appointmentForm.date = date;
  }

  hasAppointment(date: string): boolean { return this.appointments.some((item) => item.dateValue === date); }
  private toDateKey(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }

  focusEvaluationForm(caseId: string): void {
    this.evaluationDraft.caseId = caseId;
    document.getElementById('evaluation-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  scheduleAppointment(): void {
    if (!this.appointmentForm.date || !this.appointmentForm.time) {
      this.appointmentFeedback = 'Completa la fecha y la hora para agregar la cita demostrativa.';
      return;
    }
    const date = new Date(`${this.appointmentForm.date}T00:00:00`);
    this.appointments.unshift({
      id: this.nextAppointmentId++, caseId: this.appointmentForm.caseId, type: this.appointmentForm.type,
      date: date.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }),
      dateValue: this.appointmentForm.date, time: this.appointmentForm.time,
      note: this.appointmentForm.note, status: 'Pendiente',
    });
    this.appointmentFeedback = 'Cita agregada únicamente a esta vista de demostración.';
    this.appointmentForm.date = '';
    this.appointmentForm.time = '';
    this.appointmentForm.note = '';
  }

  completeAppointment(id: number): void { this.setAppointmentStatus(id, 'Realizada'); }
  cancelAppointment(id: number): void { this.setAppointmentStatus(id, 'Cancelada'); }
  private setAppointmentStatus(id: number, status: AppointmentStatus): void {
    const item = this.appointments.find((appointment) => appointment.id === id);
    if (item) item.status = status;
  }

  saveEvaluation(): void {
    if (!this.evaluationDraft.observations.trim() && !this.evaluationDraft.results.trim() && !this.evaluationDraft.recommendations.trim()) {
      this.evaluationFeedback = 'Agrega una observación, resultado o recomendación para guardar la demostración.';
      return;
    }
    const caseItem = this.cases.find((item) => item.id === this.evaluationDraft.caseId);
    if (!caseItem) return;
    this.evaluations.unshift({
      id: this.nextEvaluationId++, caseId: caseItem.id, caseName: caseItem.name,
      title: 'Evaluación psicológica', status: this.evaluationDraft.status, updated: 'Actualizado en esta sesión · Demo',
      observations: this.evaluationDraft.observations, results: this.evaluationDraft.results,
      recommendations: this.evaluationDraft.recommendations,
    });
    this.evaluationFeedback = 'Evaluación guardada solo en esta vista demostrativa.';
    this.evaluationDraft.observations = '';
    this.evaluationDraft.results = '';
    this.evaluationDraft.recommendations = '';
  }

  saveReport(): void {
    if (!this.reportDraft.title.trim() || !this.reportDraft.conclusions.trim() || !this.reportDraft.recommendations.trim()) {
      this.reportFeedback = 'Completa el título, las conclusiones y las recomendaciones para guardar el informe de demostración.';
      return;
    }
    this.reports.unshift({
      id: this.nextReportId++, caseId: this.reportDraft.caseId, title: this.reportDraft.title,
      conclusions: this.reportDraft.conclusions, recommendations: this.reportDraft.recommendations,
      created: new Date().toLocaleDateString('es'),
    });
    this.reportFeedback = 'Informe agregado solo a esta vista demostrativa.';
    this.reportDraft.title = '';
    this.reportDraft.conclusions = '';
    this.reportDraft.recommendations = '';
  }

  readonly reports: Report[] = [];

  toggleNotification(id: number): void {
    const item = this.notifications.find((notification) => notification.id === id);
    if (item) item.read = !item.read;
  }

  markAllRead(): void { this.notifications.forEach((item) => item.read = true); }
  changeProfilePhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.profileFeedback = 'Selecciona un archivo de imagen para la foto de perfil.';
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.profilePhotoUrl = String(reader.result || '');
      this.profileFeedback = 'Foto actualizada en esta vista de demostración; no se ha enviado ni guardado.';
    };
    reader.onerror = () => { this.profileFeedback = 'No se pudo abrir la imagen seleccionada.'; };
    reader.readAsDataURL(file);
  }
  saveProfile(): void { this.profileFeedback = 'Cambios guardados solo en esta vista de demostración.'; }
  async signOut(): Promise<void> { await this.router.navigateByUrl('/login'); }
}
