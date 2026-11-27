import { ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline,
  businessOutline,
  calendarOutline,
  cameraOutline,
  checkmarkCircleOutline,
  createOutline,
  documentTextOutline,
  eyeOutline,
  folderOutline,
  folderOpenOutline,
  homeOutline,
  logOutOutline,
  notificationsOutline,
  personOutline,
  peopleOutline,
  pieChartOutline,
  shieldCheckmarkOutline,
  trashOutline,
} from 'ionicons/icons';
import { ChildInterestCase, FamilyCase, FamilyPsychReport, InstitutionChildProfile, InstitutionNotification, SupabaseService } from '../core/supabase/supabase.service';
import { AppointmentSchedulerComponent, AppointmentSchedulerDraft } from '../shared/appointment-scheduler/appointment-scheduler.component';

type InstitutionSection = 'inicio' | 'expedientes' | 'informes' | 'citas' | 'ninos' | 'reportes' | 'perfil' | 'catalogo' | 'evaluaciones' | 'notificaciones' | 'casos' | 'detalle' | 'nuevoexp' | 'documentos' | 'asignaciones' | 'nino' | 'estudio' | 'entrevista' | 'familia' | 'historial';

interface InstitutionCalendarDay { key: string; day: number; inMonth: boolean; }

interface DemoChild {
  type: string;
  age: string;
  profile: string;
  tone: string;
  status: string;
  caseId: string;
  photo?: string;
}

interface ChildDraft {
  name: string;
  age: number | null;
  gender: '' | 'Niño' | 'Niña';
  summary: string;
  characteristics: string;
  interests: string;
}

interface DemoCase {
  id: string;
  family: string;
  stage: string;
  status: string;
}

interface DemoNotification {
  id: string;
  category: 'Cita' | 'Documento' | 'Sistema' | 'Interés familiar';
  title: string;
  message: string;
  time: string;
  icon: string;
}

@Component({
  selector: 'app-institucion',
  standalone: true,
  imports: [IonContent, IonIcon, FormsModule, AppointmentSchedulerComponent],
  templateUrl: './institucion.page.html',
  styleUrls: ['./institucion.page.scss', './institucion.navigation.scss', './institucion.mobile-topbar.scss', './institucion.mobile-drawer.scss', './institucion.home.scss', './institucion.home-panels.scss', './institucion.home-cases.scss', './institucion.workspaces.scss', './institucion.records.scss', './institucion.child-photos.scss', './institucion.reports.scss', './institucion.family-cases.scss', './institucion.family-cases-detail.scss', './institucion.workflow.scss', './institucion.workflow-actions.scss', './institucion.report-submit.scss', './institucion.calendar.scss', './institucion.calendar-details.scss'],
})
export class InstitutionPage implements OnDestroy {
  activeSection: InstitutionSection = 'inicio';
  mobileMenuOpen = false;
  institutionName = 'Institución';
  institutionEmail = '';
  familyCases: FamilyCase[] = [];
  institutionChildren: InstitutionChildProfile[] = [];
  childSaving = false;
  childError = '';
  editingChildId: string | null = null;
  childDraft: ChildDraft = this.emptyChildDraft();
  selectedChildPhoto: File | null = null;
  editingChildPhotoUrl: string | null = null;
  selectedFamily: FamilyCase | null = null;
  familyCasesLoading = false;
  familyCasesError = '';
  familyCasesNotice = '';
  familyReviewLoading = false;
  institutionReports: FamilyPsychReport[] = [];
  reportsLoading = false;
  reportsError = '';
  selectedReport: FamilyPsychReport | null = null;
  reportDecisionReason = '';
  reportDecisionBusy = false;
  institutionNotifications: InstitutionNotification[] = [];
  childInterestCases: ChildInterestCase[] = [];
  calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  selectedCalendarDate = this.toDateKey(new Date());
  caseWorkflowBusy = false;
  editingInitialVisitCaseId: string | null = null;
  caseWorkflowNotice = '';
  caseWorkflowError = '';
  caseDecisionReason = '';
  workflowDraft = { caseId: '', date: '', time: '', location: '', note: '', observations: '', strengths: '', concerns: '', recommendation: '' };
  notificationsLoading = false;
  notificationsError = '';
  notificationActionBusy = false;
  private institutionNotificationChannel: { unsubscribe: () => Promise<unknown> } | null = null;
  private institutionChildrenChannel: { unsubscribe: () => Promise<unknown> } | null = null;

  get unreadNotificationCount(): number {
    return this.institutionNotifications.filter((notification) => !notification.read_at).length;
  }

  get pendingFamilyCount(): number {
    return this.familyCases.filter((family) => family.status === 'pendiente').length;
  }

  get pendingPsychReportCount(): number {
    return this.institutionReports.filter((report) => report.status === 'pendiente').length;
  }

  get institutionFamilyDocumentCount(): number {
    return this.familyCases.reduce((count, family) => count + family.documents.length, 0);
  }
  readonly sections: { id: InstitutionSection; label: string; icon: string }[] = [
    { id: 'inicio', label: 'Inicio', icon: 'home-outline' },
    { id: 'ninos', label: 'Registrar niño o niña', icon: 'people-outline' },
    { id: 'catalogo', label: 'Catálogo', icon: 'people-outline' },
    { id: 'expedientes', label: 'Expedientes', icon: 'folder-outline' },
    { id: 'casos', label: 'Intereses y procesos', icon: 'people-outline' },
    { id: 'informes', label: 'Revisión psicológica', icon: 'document-text-outline' },
    { id: 'evaluaciones', label: 'Evaluaciones', icon: 'document-text-outline' },
    { id: 'citas', label: 'Citas', icon: 'calendar-outline' },
    { id: 'notificaciones', label: 'Notificaciones', icon: 'notifications-outline' },
    { id: 'reportes', label: 'Reportes', icon: 'pie-chart-outline' },
    { id: 'perfil', label: 'Perfil', icon: 'person-outline' },
    { id: 'documentos', label: 'Documentos del expediente', icon: 'document-text-outline' },
    { id: 'asignaciones', label: 'Asignaciones relacionadas', icon: 'people-outline' },
    { id: 'detalle', label: 'Detalle del expediente', icon: 'folder-outline' },
    { id: 'nuevoexp', label: 'Crear expediente', icon: 'add-outline' },
    { id: 'nino', label: 'Perfil protegido', icon: 'person-outline' },
    { id: 'estudio', label: 'Estudio social', icon: 'document-text-outline' },
    { id: 'entrevista', label: 'Entrevistas', icon: 'calendar-outline' },
    { id: 'familia', label: 'Datos de la familia', icon: 'person-outline' },
    { id: 'historial', label: 'Historial del expediente', icon: 'document-text-outline' },
  ];

  readonly mainNavigation: { id: InstitutionSection; label: string; mobileLabel: string; icon: string }[] = [
    { id: 'inicio', label: 'Inicio', mobileLabel: 'Inicio', icon: 'home-outline' },
    { id: 'expedientes', label: 'Expedientes', mobileLabel: 'Exped.', icon: 'folder-outline' },
    { id: 'casos', label: 'Intereses', mobileLabel: 'Intereses', icon: 'people-outline' },
    { id: 'informes', label: 'Informes', mobileLabel: 'Informes', icon: 'document-text-outline' },
    { id: 'citas', label: 'Citas', mobileLabel: 'Citas', icon: 'calendar-outline' },
    { id: 'notificaciones', label: 'Notificaciones', mobileLabel: 'Avisos', icon: 'notifications-outline' },
    { id: 'ninos', label: 'Registrar niño o niña', mobileLabel: 'Registrar', icon: 'people-outline' },
    { id: 'catalogo', label: 'Catálogo', mobileLabel: 'Catálogo', icon: 'people-outline' },
    { id: 'reportes', label: 'Reportes estadísticos', mobileLabel: 'Reportes', icon: 'pie-chart-outline' },
    { id: 'perfil', label: 'Perfil', mobileLabel: 'Perfil', icon: 'person-outline' },
  ];

  readonly demoChildren: DemoChild[] = [
    { type: 'Niña', age: '6 años', profile: 'NNA-0012', tone: 'lilac', status: 'En seguimiento', caseId: 'EXP-2026-1048', photo: 'assets/img/img14.jpg' },
    { type: 'Niño', age: '8 años', profile: 'NNA-0013', tone: 'blue', status: 'Cita pendiente', caseId: 'EXP-2026-1047' },
    { type: 'Niña', age: '10 años', profile: 'NNA-0014', tone: 'rose', status: 'En seguimiento', caseId: 'EXP-2026-1048' },
    { type: 'Niño', age: '7 años', profile: 'NNA-0015', tone: 'mint', status: 'En seguimiento', caseId: 'EXP-2026-1047' },
  ];

  readonly demoCases: DemoCase[] = [
    { id: 'EXP-2026-1048', family: 'Familia de ejemplo 01', stage: 'Documentación', status: 'En revisión' },
    { id: 'EXP-2026-1047', family: 'Familia de ejemplo 02', stage: 'Evaluación psicológica', status: 'En curso' },
  ];

  readonly recentDemoCases = this.demoCases;

  readonly documentNotice = 'Los expedientes de esta vista son demostrativos y no contienen archivos personales.';

  readonly demoEvaluations = [
    { id: 'EVA-2026-0041', title: 'Evaluación psicológica', caseId: 'EXP-2026-1048', status: 'Pendiente', date: 'Fecha ficticia · 17/11/2026' },
    { id: 'EVA-2026-0039', title: 'Evaluación de seguimiento', caseId: 'EXP-2026-1047', status: 'Registrada', date: 'Fecha ficticia · 12/11/2026' },
  ];

  readonly demoNotifications: DemoNotification[] = [
    { id: 'NOT-000', category: 'Interés familiar', title: 'Interés familiar recibido', message: 'Familia de ejemplo 01 manifestó interés · expediente EXP-2026-1048.', time: 'Aviso ficticio', icon: 'people-outline' },
    { id: 'NOT-001', category: 'Cita', title: 'Cita de demostración próxima', message: 'Entrevista inicial · 18/11/2026 · 10:00 a. m.', time: 'Aviso ficticio', icon: 'calendar-outline' },
    { id: 'NOT-002', category: 'Documento', title: 'Documento pendiente de ejemplo', message: 'Expediente EXP-2026-1048 · documentación de demostración.', time: 'Aviso ficticio', icon: 'document-text-outline' },
    { id: 'NOT-003', category: 'Sistema', title: 'Actividad de ejemplo', message: 'Se muestra información demostrativa de la institución.', time: 'Aviso ficticio', icon: 'notifications-outline' },
  ];

  readonly dashboardChildren = this.demoChildren.slice(0, 3);
  childPhotoNotice = 'JPG o PNG · máximo 5 MB';
  selectedDocumentNotice = 'No se ha seleccionado ningún archivo.';
  selectedChild: DemoChild | null = null;
  selectedCase: DemoCase | null = null;
  selectedEvaluation: (typeof this.demoEvaluations)[number] | null = null;
  childReturnSection: InstitutionSection = 'ninos';
  readonly readNotificationIds = new Set<string>();
  demoNotice = '';

  get unreadDemoNotificationCount(): number {
    return this.demoNotifications.length - this.readNotificationIds.size;
  }

  get institutionAppointments(): ChildInterestCase[] {
    return this.childInterestCases.filter((item) => item.appointment_id && item.appointment_date && item.appointment_time);
  }

  get calendarMonthLabel(): string {
    return this.calendarMonth.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });
  }

  get selectedCalendarLabel(): string {
    return new Date(`${this.selectedCalendarDate}T12:00:00`).toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  get calendarWeeks(): InstitutionCalendarDay[][] {
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

  get selectedDayAppointments(): ChildInterestCase[] {
    return this.institutionAppointments.filter((item) => item.appointment_date === this.selectedCalendarDate);
  }

  hasAppointment(date: string): boolean {
    return this.institutionAppointments.some((item) => item.appointment_date === date);
  }

  appointmentTitle(item: ChildInterestCase): string {
    if (item.appointment_type === 'visita_inicial') return 'Visita inicial en la institución';
    if (item.appointment_type === 'entrega') return 'Cita para recoger al niño';
    if (item.appointment_type === 'visita_hogar') return 'Visita al hogar';
    return 'Cita del proceso';
  }

  appointmentTone(item: ChildInterestCase): 'initial-visit' | 'child-pickup' | 'home-visit' {
    if (item.appointment_type === 'visita_inicial') return 'initial-visit';
    if (item.appointment_type === 'entrega') return 'child-pickup';
    return 'home-visit';
  }

  selectCalendarDay(date: string): void { this.selectedCalendarDate = date; }

  moveCalendarMonth(amount: number): void {
    this.calendarMonth = new Date(this.calendarMonth.getFullYear(), this.calendarMonth.getMonth() + amount, 1);
  }

  goToToday(): void {
    const today = new Date();
    this.calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    this.selectedCalendarDate = this.toDateKey(today);
  }

  private toDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  get familyInterestCount(): number {
    return this.demoNotifications.filter((notification) => notification.category === 'Interés familiar').length;
  }

  get followUpChildrenCount(): number {
    return this.demoChildren.filter((child) => child.status === 'En seguimiento').length;
  }

  get pendingEvaluationCount(): number {
    return this.demoEvaluations.filter((evaluation) => evaluation.status === 'Pendiente').length;
  }

  get selectedCaseChildren(): DemoChild[] {
    return this.demoChildren.filter((child) => child.caseId === this.selectedCase?.id);
  }

  get reportStages(): { label: string; count: number }[] {
    const stages = ['Documentación', 'Entrevista inicial', 'Evaluación psicológica', 'Estudio social', 'Seguimiento'];
    return stages.map((label) => ({ label, count: this.demoCases.filter((record) => record.stage === label).length }));
  }

  get activeNavigationSection(): InstitutionSection | null {
    if (['detalle', 'nuevoexp', 'documentos', 'asignaciones', 'familia', 'nino', 'estudio', 'entrevista', 'historial', 'evaluaciones'].includes(this.activeSection)) {
      return 'expedientes';
    }
    return this.activeSection;
  }

  constructor(private readonly supabase: SupabaseService, private readonly router: Router, private readonly changeDetector: ChangeDetectorRef) {
    addIcons({ addOutline, businessOutline, calendarOutline, cameraOutline, checkmarkCircleOutline, createOutline, documentTextOutline, eyeOutline, folderOutline, folderOpenOutline, homeOutline, logOutOutline, notificationsOutline, personOutline, peopleOutline, pieChartOutline, shieldCheckmarkOutline, trashOutline });
    this.institutionNotificationChannel = this.supabase.client.channel('institution-notifications-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'institution_notifications' }, () => {
        void this.loadInstitutionNotifications();
        void this.loadInstitutionReports();
        void this.loadChildInterestCases();
      })
      .subscribe();
    this.institutionChildrenChannel = this.supabase.client.channel('institution-child-profiles-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'institution_children' }, () => {
        void this.loadInstitutionChildren();
      })
      .subscribe();
    void this.loadInstitutionProfile();
    void this.loadFamilyCases();
    void this.loadInstitutionReports();
    void this.loadInstitutionNotifications();
    void this.loadInstitutionChildren();
    void this.loadChildInterestCases();
  }

  ngOnDestroy(): void {
    if (this.institutionNotificationChannel) void this.institutionNotificationChannel.unsubscribe();
    if (this.institutionChildrenChannel) void this.institutionChildrenChannel.unsubscribe();
  }

  get institutionInitials(): string {
    return this.institutionName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase('es') ?? '').join('') || 'IN';
  }

  get todayDate(): string { return this.toDateKey(new Date()); }

  private async loadInstitutionProfile(): Promise<void> {
    try {
      const { data: authData, error: authError } = await this.supabase.client.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) return;

      const { data, error } = await this.supabase.client
        .from('profiles')
        .select('full_name')
        .eq('id', authData.user.id)
        .maybeSingle();
      if (error) throw error;

      const savedName = data?.full_name?.trim();
      if (savedName) this.institutionName = savedName;
      this.institutionEmail = authData.user.email ?? '';
    } catch {
      // Mantener una etiqueta neutral si no se puede consultar el perfil.
    }
  }

  showSection(section: InstitutionSection): void {
    if (section === 'catalogo') { void this.router.navigateByUrl('/catalogo'); return; }
    this.activeSection = section;
    this.mobileMenuOpen = false;
    this.demoNotice = '';
    if (section !== 'evaluaciones') this.selectedEvaluation = null;
    if (section === 'expedientes') void this.loadFamilyCases();
    if (section === 'casos') void this.loadChildInterestCases();
    if (section === 'citas') void this.loadChildInterestCases();
    if (section === 'informes') void this.loadInstitutionReports();
    if (section === 'notificaciones') void this.loadInstitutionNotifications();
    this.selectedReport = null;
    this.reportDecisionReason = '';
  }

  async loadInstitutionNotifications(): Promise<void> {
    this.notificationsLoading = true;
    this.notificationsError = '';
    this.changeDetector.markForCheck();
    try { this.institutionNotifications = await this.supabase.listInstitutionNotifications(); }
    catch (error) { this.notificationsError = error instanceof Error ? error.message : 'No se pudieron cargar las notificaciones.'; }
    finally { this.notificationsLoading = false; this.changeDetector.markForCheck(); }
  }

  async loadChildInterestCases(): Promise<void> {
    this.caseWorkflowError = '';
    try { this.childInterestCases = (await this.supabase.listChildInterestCases()).filter((item) => item.institution_id); }
    catch (error) { this.caseWorkflowError = error instanceof Error ? error.message : 'No se pudieron cargar los procesos de interés.'; }
    finally { this.changeDetector.markForCheck(); }
  }

  async scheduleInterestAppointment(item: ChildInterestCase, type: 'visita_inicial' | 'entrega', draft?: AppointmentSchedulerDraft): Promise<void> {
    const date = draft?.date ?? this.workflowDraft.date;
    const time = draft?.time ?? this.workflowDraft.time;
    const location = draft?.location ?? this.workflowDraft.location;
    const note = draft?.note ?? this.workflowDraft.note;
    if (!date || !time || !location.trim()) { this.caseWorkflowError = 'Selecciona la fecha, la hora y la dirección.'; return; }
    this.caseWorkflowBusy = true; this.caseWorkflowError = '';
    try {
      await this.supabase.scheduleChildCaseAppointment({ caseId: item.id, type, date, time, location, note });
      this.caseWorkflowNotice = type === 'visita_inicial' ? 'Cita inicial agendada y notificada a la familia.' : 'Cita de entrega agendada y notificada a la familia y al psicólogo responsable.';
      this.workflowDraft = { ...this.workflowDraft, date: '', time: '', location: '', note: '' };
      await this.loadChildInterestCases();
    } catch (error) { this.caseWorkflowError = error instanceof Error ? error.message : 'No se pudo agendar la cita.'; }
    finally { this.caseWorkflowBusy = false; this.changeDetector.markForCheck(); }
  }

  async confirmInitialVisit(item: ChildInterestCase): Promise<void> {
    if (!item.appointment_id || !item.appointment_date || item.appointment_date > new Date().toISOString().slice(0,10)) { this.caseWorkflowError = 'La asistencia se confirma el día de la cita o después.'; return; }
    this.caseWorkflowBusy = true;
    try { await this.supabase.confirmChildCaseAppointment(item.appointment_id); this.caseWorkflowNotice = 'Asistencia confirmada. Ya puedes completar el informe de la visita.'; await this.loadChildInterestCases(); }
    catch (error) { this.caseWorkflowError = this.actionError(error, 'No se pudo confirmar la asistencia.'); }
    finally { this.caseWorkflowBusy = false; this.changeDetector.markForCheck(); }
  }

  editInitialVisit(item: ChildInterestCase): void {
    this.caseWorkflowError = '';
    this.editingInitialVisitCaseId = item.id;
    this.workflowDraft = { ...this.workflowDraft, caseId: item.id, date: item.appointment_date ?? '', time: item.appointment_time?.slice(0, 5) ?? '', location: item.appointment_location ?? '', note: item.appointment_note ?? '' };
  }

  cancelInitialVisitEdit(): void {
    this.editingInitialVisitCaseId = null;
    this.caseWorkflowError = '';
    this.workflowDraft = { ...this.workflowDraft, date: '', time: '', location: '', note: '' };
  }

  async saveInitialVisit(item: ChildInterestCase, draft?: AppointmentSchedulerDraft): Promise<void> {
    const date = draft?.date ?? this.workflowDraft.date;
    const time = draft?.time ?? this.workflowDraft.time;
    const location = draft?.location ?? this.workflowDraft.location;
    const note = draft?.note ?? this.workflowDraft.note;
    if (!date || !time || !location.trim()) { this.caseWorkflowError = 'Selecciona la fecha, la hora y la dirección.'; return; }
    this.caseWorkflowBusy = true;
    this.caseWorkflowError = '';
    try {
      await this.supabase.updateInitialVisitAppointment({ caseId: item.id, date, time, location, note });
      this.caseWorkflowNotice = 'Cita actualizada y notificada a la familia.';
      this.cancelInitialVisitEdit();
      await this.loadChildInterestCases();
    } catch (error) { this.caseWorkflowError = error instanceof Error ? error.message : 'No se pudo actualizar la cita.'; }
    finally { this.caseWorkflowBusy = false; this.changeDetector.markForCheck(); }
  }

  async deleteInitialVisit(item: ChildInterestCase): Promise<void> {
    if (!window.confirm(`¿Cancelar la visita inicial para ${item.family_name}? La familia recibirá un aviso y el caso quedará disponible para agendar otra fecha.`)) return;
    this.caseWorkflowBusy = true;
    this.caseWorkflowError = '';
    try {
      await this.supabase.deleteInitialVisitAppointment(item.id);
      this.caseWorkflowNotice = 'Cita cancelada. El proceso quedó disponible para elegir una nueva fecha.';
      this.cancelInitialVisitEdit();
      await this.loadChildInterestCases();
    } catch (error) { this.caseWorkflowError = error instanceof Error ? error.message : 'No se pudo cancelar la cita.'; }
    finally { this.caseWorkflowBusy = false; this.changeDetector.markForCheck(); }
  }

  async submitInitialVisitReport(item: ChildInterestCase): Promise<void> {
    const d = this.workflowDraft;
    if (!d.observations.trim() || !d.recommendation.trim()) { this.caseWorkflowError = 'Completa las observaciones y la recomendación.'; return; }
    this.caseWorkflowBusy = true;
    try { await this.supabase.submitChildCaseReport({ caseId: item.id, observations: d.observations, strengths: d.strengths, concerns: d.concerns, recommendation: d.recommendation }); this.caseWorkflowNotice = 'Informe enviado al psicólogo asignado.'; this.workflowDraft = { ...d, observations: '', strengths: '', concerns: '', recommendation: '' }; await this.loadChildInterestCases(); }
    catch (error) { this.caseWorkflowError = error instanceof Error ? error.message : 'No se pudo enviar el informe.'; }
    finally { this.caseWorkflowBusy = false; this.changeDetector.markForCheck(); }
  }

  async decideHomeVisit(item: ChildInterestCase, favorable: boolean): Promise<void> {
    this.caseWorkflowBusy = true;
    try { await this.supabase.decideHomeEvaluation(item.id, favorable, this.caseDecisionReason); this.caseWorkflowNotice = favorable ? 'Evaluación favorable. Ya puedes coordinar la cita de entrega.' : 'Decisión no favorable guardada; el caso permanece abierto.'; this.caseDecisionReason = ''; await this.loadChildInterestCases(); }
    catch (error) { this.caseWorkflowError = error instanceof Error ? error.message : 'No se pudo registrar la decisión.'; }
    finally { this.caseWorkflowBusy = false; this.changeDetector.markForCheck(); }
  }

  async markInstitutionNotificationRead(notification: InstitutionNotification): Promise<void> {
    if (notification.read_at) return;
    this.notificationActionBusy = true;
    try {
      await this.supabase.markInstitutionNotificationRead(notification.id);
      const readAt = new Date().toISOString();
      this.institutionNotifications = this.institutionNotifications.map((item) => item.id === notification.id ? { ...item, read_at: readAt } : item);
    } catch (error) { this.notificationsError = error instanceof Error ? error.message : 'No se pudo marcar la notificación como leída.'; }
    finally { this.notificationActionBusy = false; this.changeDetector.markForCheck(); }
  }

  async markAllInstitutionNotificationsRead(): Promise<void> {
    if (!this.unreadNotificationCount) return;
    this.notificationActionBusy = true;
    try {
      await this.supabase.markAllInstitutionNotificationsRead();
      const readAt = new Date().toISOString();
      this.institutionNotifications = this.institutionNotifications.map((item) => item.read_at ? item : { ...item, read_at: readAt });
      this.notificationsError = '';
    } catch (error) { this.notificationsError = error instanceof Error ? error.message : 'No se pudieron actualizar las notificaciones.'; }
    finally { this.notificationActionBusy = false; this.changeDetector.markForCheck(); }
  }

  formatNotificationDate(value: string): string {
    return new Intl.DateTimeFormat('es-DO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  }

  notificationIcon(category: InstitutionNotification['category']): string {
    return category === 'sistema' ? 'notifications-outline' : 'document-text-outline';
  }

  async loadInstitutionReports(): Promise<void> {
    this.reportsLoading = true;
    this.reportsError = '';
    this.changeDetector.markForCheck();
    try { this.institutionReports = await this.supabase.listInstitutionPsychReports(); }
    catch (error) { this.reportsError = error instanceof Error ? error.message : 'No se pudieron cargar los informes psicológicos.'; }
    finally { this.reportsLoading = false; this.changeDetector.markForCheck(); }
  }

  async decidePsychologicalReport(report: FamilyPsychReport, status: 'aceptada' | 'rechazada'): Promise<void> {
    if (status === 'rechazada' && !this.reportDecisionReason.trim()) {
      this.reportsError = 'Escribe el motivo para que la familia y el psicólogo sepan qué deben atender.';
      return;
    }
    this.reportDecisionBusy = true;
    this.reportsError = '';
    this.changeDetector.markForCheck();
    try {
      await this.supabase.decidePsychReport(report.id, status, this.reportDecisionReason);
      this.selectedReport = null;
      this.reportDecisionReason = '';
      await this.loadInstitutionReports();
    } catch (error) { this.reportsError = error instanceof Error ? error.message : 'No se pudo guardar la decisión.'; }
    finally { this.reportDecisionBusy = false; this.changeDetector.markForCheck(); }
  }

  formatReportDate(value: string): string {
    return new Intl.DateTimeFormat('es-DO', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`));
  }

  async loadFamilyCases(): Promise<void> {
    this.familyCasesLoading = true;
    this.familyCasesError = '';
    this.changeDetector.markForCheck();
    try {
      this.familyCases = await Promise.race([
        this.supabase.listInstitutionFamilyCases(),
        new Promise<FamilyCase[]>((_, reject) => setTimeout(() => reject(new Error('La consulta está tardando demasiado. Revisa tu conexión e intenta actualizar.')), 20000)),
      ]);
    }
    catch (error) { this.familyCasesError = error instanceof Error ? error.message : 'No se pudieron cargar los documentos enviados por las familias.'; }
    finally { this.familyCasesLoading = false; this.changeDetector.markForCheck(); }
  }

  async reviewFamily(family: FamilyCase, status: 'aprobada' | 'rechazada'): Promise<void> {
    this.familyCasesError = '';
    this.familyReviewLoading = true;
    this.changeDetector.markForCheck();
    try {
      await this.supabase.reviewInstitutionFamily(family.family_id, status);
      this.familyCasesNotice = status === 'aprobada' ? `${family.full_name} fue aprobada.` : `El expediente de ${family.full_name} fue rechazado.`;
      this.selectedFamily = { ...family, status, approved_at: new Date().toISOString() };
      await this.loadFamilyCases();
      this.selectedFamily = this.familyCases.find((item) => item.family_id === family.family_id) ?? this.selectedFamily;
    } catch (error) { this.familyCasesError = error instanceof Error ? error.message : 'No se pudo actualizar el expediente.'; }
    finally { this.familyReviewLoading = false; this.changeDetector.markForCheck(); }
  }

  async openFamilyDocument(path: string): Promise<void> {
    try {
      const url = await this.supabase.getFamilyDocumentUrl(path);
      window.open(url, '_blank', 'noopener');
    } catch (error) { this.familyCasesError = error instanceof Error ? error.message : 'No se pudo abrir el documento.'; this.changeDetector.markForCheck(); }
  }

  familyStatusLabel(status: FamilyCase['status']): string {
    return status === 'aprobada' ? 'Aprobada' : status === 'rechazada' ? 'Rechazada' : 'Pendiente';
  }

  formatFamilyDate(value: string): string {
    return new Intl.DateTimeFormat('es-DO', { dateStyle: 'medium' }).format(new Date(value));
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  showDemoSaveNotice(): void {
    this.demoNotice = 'Demostración: no se guardó ni se envió información.';
  }

  async loadInstitutionChildren(): Promise<void> {
    if (!this.supabase.isConfigured) return;
    this.childError = '';
    try {
      this.institutionChildren = await this.supabase.listInstitutionChildren();
    } catch (error) {
      this.childError = error instanceof Error ? error.message : 'No se pudieron cargar los perfiles registrados.';
    }
    this.changeDetector.markForCheck();
  }

  async registerChild(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.reportValidity()) return;
    const values = new FormData(form);
    const age = Number(values.get('age'));
    const name = String(values.get('name') ?? '').trim();
    const characteristics = String(values.get('characteristics') ?? '').split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean);
    const interests = String(values.get('interests') ?? '').split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean);
    this.childSaving = true;
    this.childError = '';
    this.demoNotice = '';
    try {
      const input = {
        name, age, gender: String(values.get('gender')) as 'Niño' | 'Niña',
        institution_name: this.institutionName,
        summary: String(values.get('summary') ?? '').trim() || null,
        characteristics, interests,
      };
      if (this.editingChildId) await this.supabase.updateInstitutionChild(this.editingChildId, input, this.selectedChildPhoto ?? undefined);
      else await this.supabase.createInstitutionChild(input, this.selectedChildPhoto ?? undefined);
      const wasEditing = !!this.editingChildId;
      this.editingChildId = null;
      this.childDraft = this.emptyChildDraft();
      this.selectedChildPhoto = null;
      this.editingChildPhotoUrl = null;
      const photoInput = form.querySelector<HTMLInputElement>('#child-photo');
      if (photoInput) photoInput.value = '';
      form.reset();
      this.demoNotice = wasEditing ? 'Cambios guardados en el perfil.' : 'Perfil registrado y agregado al catálogo institucional.';
      await this.loadInstitutionChildren();
    } catch (error) {
      this.childError = error instanceof Error ? error.message : 'No se pudo registrar el perfil.';
    } finally {
      this.childSaving = false;
      this.changeDetector.markForCheck();
    }
  }

  editInstitutionChild(child: InstitutionChildProfile): void {
    this.editingChildId = child.id;
    this.childDraft = {
      name: child.name, age: child.age, gender: child.gender,
      summary: child.summary ?? '', characteristics: child.characteristics.join('\n'), interests: child.interests.join('\n'),
    };
    this.selectedChildPhoto = null;
    this.editingChildPhotoUrl = child.photo_url ?? null;
    this.childPhotoNotice = child.photo_path ? 'Foto guardada · elige otra para reemplazarla' : 'JPG o PNG · máximo 5 MB';
    this.childError = '';
    this.demoNotice = `Editando el perfil de ${child.name}.`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelChildEdit(): void {
    this.editingChildId = null;
    this.childDraft = this.emptyChildDraft();
    this.selectedChildPhoto = null;
    this.editingChildPhotoUrl = null;
    this.childPhotoNotice = 'JPG o PNG · máximo 5 MB';
    this.demoNotice = '';
  }

  async deleteInstitutionChild(child: InstitutionChildProfile): Promise<void> {
    if (!window.confirm(`¿Eliminar el perfil de ${child.name}? Esta acción no se puede deshacer.`)) return;
    this.childSaving = true;
    this.childError = '';
    try {
      await this.supabase.deleteInstitutionChild(child.id);
      this.institutionChildren = this.institutionChildren.filter((item) => item.id !== child.id);
      if (this.editingChildId === child.id) this.cancelChildEdit();
      this.demoNotice = `Se eliminó el perfil de ${child.name}.`;
    } catch (error) {
      this.childError = error instanceof Error ? error.message : 'No se pudo eliminar el perfil.';
    } finally {
      this.childSaving = false;
      this.changeDetector.markForCheck();
    }
  }

  private actionError(error: unknown, fallback: string): string {
    if (error instanceof Error) return error.message;
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
    return fallback;
  }

  private emptyChildDraft(): ChildDraft {
    return { name: '', age: null, gender: '', summary: '', characteristics: '', interests: '' };
  }

  selectDemoFile(event: Event, kind: 'child' | 'document'): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;

    const file = input.files?.[0];
    if (!file) return;

    const allowedTypes = kind === 'child' ? ['image/jpeg', 'image/png'] : ['image/jpeg', 'image/png', 'application/pdf'];
    const allowedType = allowedTypes.includes(file.type);
    if (!allowedType || file.size > 5 * 1024 * 1024) {
      input.value = '';
      const message = kind === 'child' ? 'Selecciona una foto JPG o PNG de hasta 5 MB.' : 'Selecciona un archivo JPG, PNG o PDF de hasta 5 MB.';
      if (kind === 'child') { this.childPhotoNotice = message; this.selectedChildPhoto = null; }
      else this.selectedDocumentNotice = message;
      return;
    }

    const notice = kind === 'child' ? `${file.name} · se guardará al registrar.` : `${file.name} · selección local, no se subió ni guardó.`;
    if (kind === 'child') { this.childPhotoNotice = notice; this.selectedChildPhoto = file; }
    else this.selectedDocumentNotice = notice;
  }

  openChildProfile(child: DemoChild, returnTo: InstitutionSection = this.activeSection): void {
    this.selectedChild = child;
    this.childReturnSection = returnTo;
    this.showSection('nino');
  }

  openCaseChildProfile(): void {
    const caseId = this.selectedCase?.id;
    if (!caseId) {
      this.demoNotice = 'No hay un expediente seleccionado para relacionar un perfil de demostración.';
      return;
    }

    const child = this.demoChildren.find((record) => record.caseId === caseId);
    if (!child) {
      this.demoNotice = `No hay un perfil demostrativo relacionado con el expediente ${caseId}.`;
      return;
    }

    this.openChildProfile(child, 'detalle');
  }

  openCaseDetails(record: DemoCase): void {
    this.selectedCase = record;
    this.showSection('detalle');
  }

  openEvaluationDetails(evaluation: (typeof this.demoEvaluations)[number]): void {
    this.selectedEvaluation = evaluation;
    this.demoNotice = '';
  }

  markDemoNotificationRead(notificationId: string): void {
    this.readNotificationIds.add(notificationId);
    this.demoNotice = 'Cambio visual temporal de demostración; no se guardó en una cuenta.';
  }

  markAllDemoNotificationsRead(): void {
    this.demoNotifications.forEach((notification) => this.readNotificationIds.add(notification.id));
    this.demoNotice = 'Avisos marcados visualmente como leídos en esta demostración; no se guardaron.';
  }

  validateDemoForm(event: Event, formName: string): void {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) return;

    if (!form.reportValidity()) {
      this.demoNotice = `Revisa los campos obligatorios de ${formName}. No se envió información.`;
      return;
    }

    this.demoNotice = `${formName}: validación local completada. No se guardó ni se envió información.`;
  }

  async signOut(): Promise<void> {
    this.mobileMenuOpen = false;
    await this.supabase.client.auth.signOut();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
