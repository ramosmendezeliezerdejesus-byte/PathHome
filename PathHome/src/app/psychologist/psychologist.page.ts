import { ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { FamilyCase, FamilyNotification, FamilyPsychReport, SupabaseService } from '../core/supabase/supabase.service';

type PsychologistSection = 'inicio' | 'expedientes' | 'evaluaciones' | 'citas' | 'informes' | 'notificaciones' | 'perfil';
type RecordStatus = 'Pendiente' | 'En progreso' | 'Completada';

interface ChildInfo {
  name: string; age: string; sex: string; height: string; favoriteColor: string;
  music: string; hobbies: string; favoriteFoods: string; personality: string;
  familyWish: string; privateNotes: string;
}

interface PsychologistCase {
  id: string; name: string; status: string; tone: string; childInfo?: ChildInfo; documents: string;
}

interface Evaluation {
  id: number; caseId: string; caseName: string; title: string; status: RecordStatus;
  updated: string; observations: string; results: string; recommendations: string;
}

interface CalendarDay { key: string; day: number; inMonth: boolean; }

interface NotificationItem {
  id: string; category: string; title: string; description: string; when: string;
  icon: string; tone: string; read: boolean; relatedFamilyId: string | null;
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
export class PsychologistPage implements OnDestroy {
  activeSection: PsychologistSection = 'inicio';
  mobileMenuOpen = false;
  notificationsEnabled = true;
  nextEvaluationId = 3;
  appointmentFeedback = '';
  evaluationFeedback = '';
  reportFeedback = '';
  profileFeedback = '';
  profilePhotoUrl = '';
  caseSearch = '';
  selectedCase: PsychologistCase | null = null;
  selectedPsychologistFamily: FamilyCase | null = null;
  approvedFamilies: FamilyCase[] = [];
  psychologistAppointments: import('../core/supabase/supabase.service').FamilyAppointment[] = [];
  familyPsychReports: FamilyPsychReport[] = [];
  reportAppointmentId: string | null = null;
  editingReportId: string | null = null;
  deletingReportId: string | null = null;
  reportSaving = false;
  readonly familyReportDraft = { observations: '', strengths: '', concerns: '', recommendation: '' };
  editingAppointmentId: string | null = null;
  familyAppointmentDraft = { familyId: '', date: '', time: '', note: '' };
  calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  selectedCalendarDate = this.toDateKey(new Date());
  selectedEvaluationId: number | null = null;
  activeCaseFilter = 'Todos';
  activeEvaluationFilter = 'Todas';
  activeNotificationFilter = 'Todas';
  notificationError = '';
  notificationsLoading = false;
  private authSubscription: { unsubscribe: () => void } | null = null;
  private workspaceLoadPromise: Promise<void> | null = null;
  private workspaceReloadRequested = false;

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
      id: '2025-0147', name: 'Expediente 2025-0147', status: 'Evaluación psicológica pendiente', tone: 'lilac', documents: '',
      childInfo: {
        name: 'No especificado', age: 'No especificada', sex: 'No especificado', height: 'No especificada', favoriteColor: 'No especificado', music: 'No especificada',
        hobbies: 'Baile · Dibujo', favoriteFoods: 'Pizza · Frutas', personality: 'Alegre, creativa y empática',
        familyWish: 'Quiero una familia que me quiera, me escuche y con la que pueda seguir soñando.', privateNotes: '',
      },
    },
    { id: '2025-0136', name: 'Expediente 2025-0136', status: 'Evaluación registrada', tone: 'mint', documents: '' },
  ];

  readonly caseFilters = ['Todos', 'Pendientes', 'Registrados'];
  readonly evaluationFilters = ['Todas', 'Pendiente', 'En progreso', 'Completada'];
  readonly notificationFilters = ['Todas', 'Citas', 'Expedientes', 'Evaluaciones', 'Sistema'];

  readonly evaluations: Evaluation[] = [
    { id: 1, caseId: '2025-0147', caseName: 'Expediente 2025-0147', title: 'Evaluación psicológica', status: 'Pendiente', updated: 'Pendiente de revisión · Demo', observations: '', results: '', recommendations: '' },
    { id: 2, caseId: '2025-0136', caseName: 'Expediente 2025-0136', title: 'Evaluación psicológica', status: 'Completada', updated: 'Registro demostrativo existente', observations: '', results: '', recommendations: '' },
  ];


  readonly recentActivity = [
    { title: 'Evaluación pendiente', detail: 'Exp. 2025-0147 · dato demostrativo', when: 'Demo' },
    { title: 'Evaluación registrada', detail: 'Exp. 2025-0136 · dato demostrativo', when: 'Demo' },
  ];

  notifications: NotificationItem[] = [];

  readonly evaluationDraft = { caseId: '2025-0147', status: 'En progreso' as RecordStatus, observations: '', results: '', recommendations: '' };

  profile = {
    name: 'Usuario', email: '', phone: '', specialty: 'Psicóloga especializada',
    education: '', credentials: '', institution: '', officeHours: '',
  };

  constructor(
    private readonly router: Router,
    private readonly supabase: SupabaseService,
    private readonly changeDetector: ChangeDetectorRef,
  ) {
    this.authSubscription = this.supabase.client.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      window.setTimeout(() => {
        this.applyUser(user);
        if (user) void this.loadWorkspaceData();
      }, 0);
    }).data.subscription;
    void this.loadWorkspaceData();
  }

  ionViewWillEnter(): void {
    void this.loadWorkspaceData();
  }

  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
  }

  private loadWorkspaceData(): Promise<void> {
    if (this.workspaceLoadPromise) {
      this.workspaceReloadRequested = true;
      return this.workspaceLoadPromise;
    }
    this.workspaceLoadPromise = Promise.all([
      this.loadProfile(),
      this.loadApprovedFamilies(),
      this.loadPsychologistAppointments(),
      this.loadPsychologistReports(),
      this.loadNotifications(),
    ]).then(() => undefined).finally(() => {
      this.changeDetector.detectChanges();
      this.workspaceLoadPromise = null;
      if (this.workspaceReloadRequested) {
        this.workspaceReloadRequested = false;
        void this.loadWorkspaceData();
      }
    });
    return this.workspaceLoadPromise;
  }

  private async loadApprovedFamilies(): Promise<void> {
    try {
      this.approvedFamilies = await this.supabase.listApprovedFamilies();
      if (!this.familyAppointmentDraft.familyId && this.approvedFamilies.length) this.familyAppointmentDraft.familyId = this.approvedFamilies[0].family_id;
    } catch { /* Supabase migration may not be installed yet. */ }
    finally { this.changeDetector.detectChanges(); }
  }

  private async loadPsychologistAppointments(): Promise<void> {
    try { this.psychologistAppointments = await this.supabase.listPsychologistFamilyAppointments(); }
    catch { /* La migración de citas debe estar aplicada. */ }
    finally { this.changeDetector.detectChanges(); }
  }

  private async loadPsychologistReports(): Promise<void> {
    try { this.familyPsychReports = await this.supabase.listPsychologistReports(); }
    catch { /* La migración de informes puede no estar instalada aún. */ }
    finally { this.changeDetector.detectChanges(); }
  }

  private async loadNotifications(): Promise<void> {
    this.notificationsLoading = true;
    try {
      const rows = await this.supabase.listMyFamilyNotifications();
      this.notifications = rows.map((item: FamilyNotification) => ({
        id: item.id,
        category: item.title === 'Familia lista para evaluación' ? 'Expedientes' : item.category === 'cita' ? 'Citas' : item.category === 'documento' ? 'Expedientes' : 'Sistema',
        title: item.title,
        description: item.message,
        when: new Date(item.created_at).toLocaleString('es-DO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
        icon: item.title === 'Familia lista para evaluación' || item.category === 'documento' ? 'folder' : item.category === 'cita' ? 'calendar' : 'bell',
        tone: item.title === 'Familia lista para evaluación' || item.category === 'documento' ? 'lilac-tone' : item.category === 'cita' ? 'blue-tone' : 'pink-tone',
        read: !!item.read_at,
        relatedFamilyId: item.related_family_id ?? null,
      }));
      this.notificationError = '';
    } catch {
      this.notifications = [];
      this.notificationError = 'No se pudieron cargar las notificaciones. Verifica que el módulo esté configurado.';
    } finally {
      this.notificationsLoading = false;
      this.changeDetector.detectChanges();
    }
  }

  get calendarMonthLabel(): string {
    return this.calendarMonth.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });
  }

  get selectedCalendarLabel(): string {
    return new Date(`${this.selectedCalendarDate}T12:00:00`).toLocaleDateString('es-DO', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
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

  get selectedDayAppointments(): import('../core/supabase/supabase.service').FamilyAppointment[] {
    return this.psychologistAppointments.filter((appointment) => appointment.appointment_date === this.selectedCalendarDate);
  }

  hasAppointment(date: string): boolean {
    return this.psychologistAppointments.some((appointment) => appointment.appointment_date === date);
  }

  selectCalendarDay(date: string): void {
    this.selectedCalendarDate = date;
    this.familyAppointmentDraft.date = date;
  }

  moveCalendarMonth(amount: number): void {
    this.calendarMonth = new Date(this.calendarMonth.getFullYear(), this.calendarMonth.getMonth() + amount, 1);
  }

  goToToday(): void {
    const today = new Date();
    this.calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    this.selectCalendarDay(this.toDateKey(today));
  }

  formatAppointmentDate(value: string): string {
    return new Date(`${value}T12:00:00`).toLocaleDateString('es-DO', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  private toDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  familyDocumentDate(value: string): string {
    return new Date(value).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  openApprovedFamily(family: FamilyCase): void {
    this.selectedPsychologistFamily = family;
  }

  closeApprovedFamily(): void {
    this.selectedPsychologistFamily = null;
  }

  scheduleFamilyFromRecord(family: FamilyCase): void {
    this.familyAppointmentDraft.familyId = family.family_id;
    this.showSection('citas');
  }

  async scheduleApprovedFamilyAppointment(): Promise<void> {
    const family = this.approvedFamilies.find((item) => item.family_id === this.familyAppointmentDraft.familyId);
    if (!family || !this.familyAppointmentDraft.date || !this.familyAppointmentDraft.time) {
      this.appointmentFeedback = 'Elige una familia aprobada, fecha y hora.';
      return;
    }
    try {
      const details = { familyId: family.family_id, date: this.familyAppointmentDraft.date, time: this.familyAppointmentDraft.time, note: this.familyAppointmentDraft.note };
      if (this.editingAppointmentId) {
        await this.supabase.updateFamilyAppointment(this.editingAppointmentId, details);
        this.appointmentFeedback = 'Cita actualizada y visible en la cuenta familiar.';
      } else {
        await this.supabase.scheduleFamilyAppointment({ ...details, title: 'Cita psicológica' });
        this.appointmentFeedback = `Cita agendada para ${family.full_name}. Ya está disponible en su cuenta familiar.`;
      }
      const appointmentDate = new Date(`${details.date}T12:00:00`);
      this.calendarMonth = new Date(appointmentDate.getFullYear(), appointmentDate.getMonth(), 1);
      this.selectedCalendarDate = details.date;
      await this.loadPsychologistAppointments();
      this.editingAppointmentId = null;
      this.familyAppointmentDraft.familyId = this.approvedFamilies[0]?.family_id ?? '';
      this.familyAppointmentDraft.date = '';
      this.familyAppointmentDraft.time = '';
      this.familyAppointmentDraft.note = '';
    } catch (error) { this.appointmentFeedback = error instanceof Error ? error.message : 'No se pudo agendar la cita.'; }
  }

  async confirmFamilyArrival(appointment: import('../core/supabase/supabase.service').FamilyAppointment): Promise<void> {
    try {
      await this.supabase.markFamilyAppointmentAttended(appointment.id);
      await this.loadPsychologistAppointments();
      this.reportAppointmentId = appointment.id;
      this.familyReportDraft.observations = '';
      this.familyReportDraft.strengths = '';
      this.familyReportDraft.concerns = '';
      this.familyReportDraft.recommendation = '';
      this.showSection('informes');
      this.reportFeedback = `Asistencia de ${appointment.family_name ?? 'la familia'} confirmada. Completa el informe para enviarlo a la institución.`;
    } catch (error) {
      this.appointmentFeedback = error instanceof Error ? error.message : 'No se pudo confirmar la asistencia.';
    } finally { this.changeDetector.detectChanges(); }
  }

  get reportAppointment(): import('../core/supabase/supabase.service').FamilyAppointment | null {
    const appointment = this.psychologistAppointments.find((item) => item.id === this.reportAppointmentId);
    if (appointment) return appointment;
    const report = this.familyPsychReports.find((item) => item.appointment_id === this.reportAppointmentId);
    return report ? {
      id: report.appointment_id,
      family_id: report.family_id,
      psychologist_id: report.psychologist_id,
      title: 'Evaluación psicológica',
      appointment_date: report.appointment_date,
      appointment_time: report.appointment_time,
      note: null,
      created_at: report.created_at,
      family_name: report.family_name,
      attended_at: null,
    } : null;
  }

  hasReportForAppointment(appointmentId: string): boolean {
    return this.familyPsychReports.some((report) => report.appointment_id === appointmentId);
  }

  async submitFamilyPsychReport(): Promise<void> {
    if (!this.reportAppointmentId) return;
    this.reportSaving = true;
    this.reportFeedback = '';
    try {
      if (this.editingReportId) {
        await this.supabase.updatePsychologistFamilyReport(this.editingReportId, this.familyReportDraft);
        this.reportFeedback = 'Informe actualizado y enviado nuevamente a la institución para su revisión.';
      } else {
        await this.supabase.saveFamilyPsychReport({ appointmentId: this.reportAppointmentId, ...this.familyReportDraft });
        this.reportFeedback = 'Informe enviado a las instituciones para su decisión.';
      }
      this.reportAppointmentId = null;
      this.editingReportId = null;
      this.familyReportDraft.observations = '';
      this.familyReportDraft.strengths = '';
      this.familyReportDraft.concerns = '';
      this.familyReportDraft.recommendation = '';
      await this.loadPsychologistReports();
      await this.loadPsychologistAppointments();
    } catch (error) { this.reportFeedback = error instanceof Error ? error.message : 'No se pudo enviar el informe.'; }
    finally { this.reportSaving = false; this.changeDetector.detectChanges(); }
  }

  editFamilyPsychReport(report: FamilyPsychReport): void {
    if (report.status !== 'pendiente') {
      this.reportFeedback = 'Este informe ya fue revisado por la institución y no se puede editar.';
      this.changeDetector.detectChanges();
      return;
    }
    this.editingReportId = report.id;
    this.reportAppointmentId = report.appointment_id;
    this.familyReportDraft.observations = report.observations;
    this.familyReportDraft.strengths = report.strengths;
    this.familyReportDraft.concerns = report.concerns;
    this.familyReportDraft.recommendation = report.recommendation;
    this.reportFeedback = 'Editando este informe. Al guardar, la institución tendrá que revisar la versión actualizada.';
    this.activeSection = 'informes';
    this.mobileMenuOpen = false;
  }

  cancelReportEdit(): void {
    this.editingReportId = null;
    this.reportAppointmentId = null;
    this.familyReportDraft.observations = '';
    this.familyReportDraft.strengths = '';
    this.familyReportDraft.concerns = '';
    this.familyReportDraft.recommendation = '';
    this.reportFeedback = '';
  }

  async deleteFamilyPsychReport(report: FamilyPsychReport): Promise<void> {
    const confirmed = window.confirm(`¿Eliminar el informe de ${report.family_name}? La institución ya no podrá revisarlo.`);
    if (!confirmed) return;
    this.deletingReportId = report.id;
    this.reportFeedback = '';
    try {
      await this.supabase.deletePsychologistFamilyReport(report.id);
      if (this.editingReportId === report.id) this.cancelReportEdit();
      this.reportFeedback = 'Informe eliminado. El resultado de la familia queda pendiente hasta que envíes otro informe.';
      await this.loadPsychologistReports();
    } catch (error) { this.reportFeedback = error instanceof Error ? error.message : 'No se pudo eliminar el informe.'; }
    finally { this.deletingReportId = null; this.changeDetector.detectChanges(); }
  }

  editFamilyAppointment(appointment: import('../core/supabase/supabase.service').FamilyAppointment): void {
    this.editingAppointmentId = appointment.id;
    this.familyAppointmentDraft = {
      familyId: appointment.family_id,
      date: appointment.appointment_date,
      time: appointment.appointment_time.slice(0, 5),
      note: appointment.note ?? '',
    };
    this.appointmentFeedback = '';
  }

  async deleteFamilyAppointment(appointmentId: string): Promise<void> {
    try {
      await this.supabase.deleteFamilyAppointment(appointmentId);
      this.psychologistAppointments = this.psychologistAppointments.filter((appointment) => appointment.id !== appointmentId);
      if (this.editingAppointmentId === appointmentId) this.editingAppointmentId = null;
      this.appointmentFeedback = 'Cita eliminada.';
    } catch (error) { this.appointmentFeedback = error instanceof Error ? error.message : 'No se pudo eliminar la cita.'; }
  }

  async openFamilyDocument(path: string): Promise<void> {
    try {
      const url = await this.supabase.getFamilyDocumentUrl(path);
      window.open(url, '_blank', 'noopener');
    } catch (error) {
      this.appointmentFeedback = error instanceof Error ? error.message : 'No se pudo abrir el documento.';
    }
  }

  private async loadProfile(): Promise<void> {
    try {
      const { data } = await this.supabase.client.auth.getUser();
      this.applyUser(data.user);
    } catch { /* El listener de sesión volverá a cargar el perfil cuando esté disponible. */ }
    finally { this.changeDetector.detectChanges(); }
  }

  private applyUser(user: { email?: string; user_metadata?: Record<string, unknown> } | null): void {
    if (!user) return;
    const metadata = user.user_metadata ?? {};
    const name = metadata['full_name'] ?? metadata['name'] ?? metadata['display_name'];
    this.profile.name = typeof name === 'string' && name.trim()
      ? name.trim()
      : user.email?.split('@')[0]?.replace(/[._-]+/g, ' ') ?? 'Usuario';
    this.profile.email = user.email ?? '';
    if (typeof metadata['phone'] === 'string') this.profile.phone = metadata['phone'];
  }

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

  get filteredNotifications(): NotificationItem[] {
    return this.notifications.filter((item) => this.activeNotificationFilter === 'Todas' || item.category === this.activeNotificationFilter);
  }

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
    this.mobileMenuOpen = false;
    if (section === 'notificaciones') void this.loadNotifications();
    if (section === 'informes') { void this.loadPsychologistReports(); void this.loadPsychologistAppointments(); }
    if (section !== 'expedientes') this.selectedPsychologistFamily = null;
    this.selectedCase = null;
    this.appointmentFeedback = '';
    this.evaluationFeedback = '';
    this.reportFeedback = '';
    this.profileFeedback = '';
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  openCase(item: PsychologistCase): void {
    this.showSection('expedientes');
    this.selectedCase = item;
    this.selectedEvaluationId = this.evaluations.find((evaluation) => evaluation.caseId === item.id)?.id ?? null;
  }
  closeCase(): void { this.selectedCase = null; this.selectedEvaluationId = null; }

  focusEvaluationForm(caseId: string): void {
    this.evaluationDraft.caseId = caseId;
    document.getElementById('evaluation-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  async toggleNotification(id: string): Promise<void> {
    const item = this.notifications.find((notification) => notification.id === id);
    if (!item || item.read) return;
    item.read = true;
    try { await this.supabase.markFamilyNotificationRead(id); }
    catch { item.read = false; this.notificationError = 'No se pudo marcar la notificación como leída.'; }
  }

  async openNotification(notification: NotificationItem): Promise<void> {
    await this.toggleNotification(notification.id);
    const scheduleFromReview = notification.title === 'Familia lista para evaluación'
      || notification.title === 'Familia no aceptada para el catálogo';
    if (!scheduleFromReview || !notification.relatedFamilyId) return;

    if (!this.approvedFamilies.some((family) => family.family_id === notification.relatedFamilyId)) {
      await this.loadApprovedFamilies();
    }
    const family = this.approvedFamilies.find((item) => item.family_id === notification.relatedFamilyId);
    if (!family) {
      this.notificationError = 'La familia de esta notificación ya no está disponible para agendar.';
      this.changeDetector.detectChanges();
      return;
    }

    this.showSection('citas');
    this.familyAppointmentDraft.familyId = family.family_id;
    if (notification.title === 'Familia no aceptada para el catálogo') {
      this.appointmentFeedback = 'La institución dejó indicaciones para seguimiento. Puedes programar una nueva cita con esta familia.';
    }
    window.setTimeout(() => {
      const form = document.getElementById('appointment-form');
      form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      form?.querySelector<HTMLSelectElement>('select[name="approvedFamily"]')?.focus({ preventScroll: true });
    }, 0);
  }

  async markAllRead(): Promise<void> {
    this.notifications.forEach((item) => item.read = true);
    try { await this.supabase.markAllMyFamilyNotificationsRead(); }
    catch { await this.loadNotifications(); this.notificationError = 'No se pudieron marcar las notificaciones como leídas.'; }
  }
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
  async saveProfile(): Promise<void> {
    const { error } = await this.supabase.client.auth.updateUser({
      data: { full_name: this.profile.name.trim(), phone: this.profile.phone.trim() },
    });
    this.profileFeedback = error ? 'No se pudo guardar la información.' : 'Información personal guardada.';
  }
  async signOut(): Promise<void> {
    this.mobileMenuOpen = false;
    await this.supabase.client.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
