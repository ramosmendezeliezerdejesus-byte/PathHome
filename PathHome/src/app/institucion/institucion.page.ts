import { ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline,
  businessOutline,
  calendarOutline,
  cameraOutline,
  checkmarkCircleOutline,
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
} from 'ionicons/icons';
import { FamilyCase, FamilyPsychReport, InstitutionNotification, SupabaseService } from '../core/supabase/supabase.service';

type InstitutionSection = 'inicio' | 'expedientes' | 'informes' | 'citas' | 'ninos' | 'reportes' | 'perfil' | 'catalogo' | 'evaluaciones' | 'notificaciones' | 'detalle' | 'nuevoexp' | 'documentos' | 'asignaciones' | 'nino' | 'estudio' | 'entrevista' | 'familia' | 'historial';

interface DemoChild {
  type: string;
  age: string;
  profile: string;
  tone: string;
  status: string;
  caseId: string;
  photo?: string;
}

interface DemoCase {
  id: string;
  family: string;
  stage: string;
  status: string;
}

interface DemoAppointment {
  id: string;
  date: string;
  time: string;
  title: string;
  family: string;
  caseId: string;
  location: string;
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
  imports: [IonContent, IonIcon],
  templateUrl: './institucion.page.html',
  styleUrls: ['./institucion.page.scss', './institucion.navigation.scss', './institucion.mobile-topbar.scss', './institucion.mobile-drawer.scss', './institucion.home.scss', './institucion.home-panels.scss', './institucion.home-cases.scss', './institucion.workspaces.scss', './institucion.records.scss', './institucion.reports.scss', './institucion.family-cases.scss', './institucion.family-cases-detail.scss'],
})
export class InstitutionPage implements OnDestroy {
  activeSection: InstitutionSection = 'inicio';
  mobileMenuOpen = false;
  institutionName = 'Institución';
  institutionEmail = '';
  familyCases: FamilyCase[] = [];
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
  notificationsLoading = false;
  notificationsError = '';
  notificationActionBusy = false;
  private institutionNotificationChannel: { unsubscribe: () => Promise<unknown> } | null = null;

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

  readonly demoAppointments: DemoAppointment[] = [
    { id: 'CIT-2026-0018', date: '18/11/2026', time: '10:00 a. m.', title: 'Entrevista inicial', family: 'Familia de ejemplo 01', caseId: 'EXP-2026-1048', location: 'Sala 1' },
    { id: 'CIT-2026-0020', date: '20/11/2026', time: '02:00 p. m.', title: 'Reunión de seguimiento', family: 'Familia de ejemplo 02', caseId: 'EXP-2026-1047', location: 'Sala 2' },
  ];

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
  selectedAppointment: DemoAppointment | null = null;
  selectedEvaluation: (typeof this.demoEvaluations)[number] | null = null;
  childReturnSection: InstitutionSection = 'ninos';
  readonly readNotificationIds = new Set<string>();
  demoNotice = '';

  get unreadDemoNotificationCount(): number {
    return this.demoNotifications.length - this.readNotificationIds.size;
  }

  get pendingAppointmentCount(): number {
    return this.demoAppointments.length;
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
    addIcons({ addOutline, businessOutline, calendarOutline, cameraOutline, checkmarkCircleOutline, documentTextOutline, eyeOutline, folderOutline, folderOpenOutline, homeOutline, logOutOutline, notificationsOutline, personOutline, peopleOutline, pieChartOutline, shieldCheckmarkOutline });
    this.institutionNotificationChannel = this.supabase.client.channel('institution-notifications-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'institution_notifications' }, () => {
        void this.loadInstitutionNotifications();
        void this.loadInstitutionReports();
      })
      .subscribe();
    void this.loadInstitutionProfile();
    void this.loadFamilyCases();
    void this.loadInstitutionReports();
    void this.loadInstitutionNotifications();
  }

  ngOnDestroy(): void {
    if (this.institutionNotificationChannel) void this.institutionNotificationChannel.unsubscribe();
  }

  get institutionInitials(): string {
    return this.institutionName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase('es') ?? '').join('') || 'IN';
  }

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
    this.selectedAppointment = null;
    if (section !== 'evaluaciones') this.selectedEvaluation = null;
    if (section === 'expedientes') void this.loadFamilyCases();
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

  selectDemoFile(event: Event, kind: 'child' | 'document'): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;

    const file = input.files?.[0];
    if (!file) return;

    const allowedTypes = kind === 'child' ? ['image/jpeg', 'image/png'] : ['image/jpeg', 'image/png', 'application/pdf'];
    const allowedType = allowedTypes.includes(file.type);
    if (!allowedType || file.size > 5 * 1024 * 1024) {
      input.value = '';
      const message = 'Selecciona un archivo JPG, PNG o PDF de hasta 5 MB. No se envió ningún archivo.';
      if (kind === 'child') this.childPhotoNotice = message;
      else this.selectedDocumentNotice = message;
      return;
    }

    const notice = `${file.name} · selección local, no se subió ni guardó.`;
    if (kind === 'child') this.childPhotoNotice = notice;
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

  openAppointmentDetails(appointment: DemoAppointment): void {
    this.selectedAppointment = appointment;
    this.demoNotice = '';
  }

  openDashboardAppointment(appointment: DemoAppointment): void {
    this.showSection('citas');
    this.openAppointmentDetails(appointment);
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
