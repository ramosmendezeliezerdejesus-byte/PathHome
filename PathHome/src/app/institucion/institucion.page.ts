import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline,
  businessOutline,
  calendarOutline,
  cameraOutline,
  checkmarkCircleOutline,
  chevronDownOutline,
  documentTextOutline,
  eyeOutline,
  folderOutline,
  homeOutline,
  logOutOutline,
  notificationsOutline,
  personOutline,
  peopleOutline,
  pieChartOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';
import { SupabaseService } from '../core/supabase/supabase.service';

type InstitutionSection = 'inicio' | 'expedientes' | 'citas' | 'ninos' | 'reportes' | 'perfil' | 'catalogo' | 'evaluaciones' | 'notificaciones' | 'detalle' | 'nuevoexp' | 'documentos' | 'asignaciones' | 'nino' | 'estudio' | 'entrevista' | 'familia' | 'historial';

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
  styleUrls: ['./institucion.page.scss', './institucion.navigation.scss', './institucion.home.scss', './institucion.home-panels.scss', './institucion.home-cases.scss', './institucion.workspaces.scss', './institucion.records.scss', './institucion.reports.scss'],
})
export class InstitutionPage {
  activeSection: InstitutionSection = 'inicio';
  readonly sections: { id: InstitutionSection; label: string; icon: string }[] = [
    { id: 'inicio', label: 'Inicio', icon: 'home-outline' },
    { id: 'ninos', label: 'Registrar niño o niña', icon: 'people-outline' },
    { id: 'catalogo', label: 'Catálogo', icon: 'people-outline' },
    { id: 'expedientes', label: 'Expedientes', icon: 'folder-outline' },
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
    { id: 'citas', label: 'Citas', mobileLabel: 'Citas', icon: 'calendar-outline' },
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
    { id: 'CIT-2026-0018', date: '18/11/2026', time: '10:00 a. m.', title: 'Entrevista inicial', family: 'Familia de ejemplo 01', caseId: 'EXP-2026-1048', location: 'Centro de Acogida Esperanza · Sala 1' },
    { id: 'CIT-2026-0020', date: '20/11/2026', time: '02:00 p. m.', title: 'Reunión de seguimiento', family: 'Familia de ejemplo 02', caseId: 'EXP-2026-1047', location: 'Centro de Acogida Esperanza · Sala 2' },
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
    if (this.activeSection === 'notificaciones') return null;
    return this.activeSection;
  }

  constructor(private readonly supabase: SupabaseService, private readonly router: Router) {
    addIcons({ addOutline, businessOutline, calendarOutline, cameraOutline, checkmarkCircleOutline, chevronDownOutline, documentTextOutline, eyeOutline, folderOutline, homeOutline, logOutOutline, notificationsOutline, personOutline, peopleOutline, pieChartOutline, shieldCheckmarkOutline });
  }

  showSection(section: InstitutionSection): void {
    this.activeSection = section;
    this.demoNotice = '';
    this.selectedAppointment = null;
    if (section !== 'evaluaciones') this.selectedEvaluation = null;
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
    await this.supabase.client.auth.signOut();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
