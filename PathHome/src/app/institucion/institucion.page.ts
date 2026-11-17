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

type InstitutionSection = 'inicio' | 'ninos' | 'expedientes' | 'evaluaciones' | 'citas' | 'notificaciones' | 'reportes' | 'perfil' | 'detalle' | 'nuevoexp' | 'nino' | 'estudio' | 'entrevista' | 'familia' | 'historial';

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
  category: 'Cita' | 'Documento' | 'Sistema';
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
  styleUrls: ['./institucion.page.scss'],
})
export class InstitutionPage {
  activeSection: InstitutionSection = 'inicio';
  readonly sections: { id: InstitutionSection; label: string; icon: string }[] = [
    { id: 'inicio', label: 'Inicio', icon: 'home-outline' },
    { id: 'ninos', label: 'Niños a cargo', icon: 'people-outline' },
    { id: 'expedientes', label: 'Seguimiento', icon: 'folder-outline' },
    { id: 'evaluaciones', label: 'Evaluaciones', icon: 'document-text-outline' },
    { id: 'citas', label: 'Citas', icon: 'calendar-outline' },
    { id: 'notificaciones', label: 'Notificaciones', icon: 'notifications-outline' },
    { id: 'reportes', label: 'Reportes', icon: 'pie-chart-outline' },
    { id: 'perfil', label: 'Perfil', icon: 'person-outline' },
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

  readonly demoAppointments: DemoAppointment[] = [
    { id: 'CIT-2026-0018', date: '18/11/2026', time: '10:00 a. m.', title: 'Entrevista inicial', family: 'Familia de ejemplo 01', caseId: 'EXP-2026-1048', location: 'Centro de Acogida Esperanza · Sala 1' },
    { id: 'CIT-2026-0020', date: '20/11/2026', time: '02:00 p. m.', title: 'Reunión de seguimiento', family: 'Familia de ejemplo 02', caseId: 'EXP-2026-1047', location: 'Centro de Acogida Esperanza · Sala 2' },
  ];

  readonly demoEvaluations = [
    { id: 'EVA-2026-0041', title: 'Evaluación psicológica', caseId: 'EXP-2026-1048', status: 'Pendiente', date: 'Fecha ficticia · 17/11/2026' },
    { id: 'EVA-2026-0039', title: 'Evaluación de seguimiento', caseId: 'EXP-2026-1047', status: 'Registrada', date: 'Fecha ficticia · 12/11/2026' },
  ];

  readonly demoNotifications: DemoNotification[] = [
    { id: 'NOT-001', category: 'Cita', title: 'Cita de demostración próxima', message: 'Entrevista inicial · 18/11/2026 · 10:00 a. m.', time: 'Aviso ficticio', icon: 'calendar-outline' },
    { id: 'NOT-002', category: 'Documento', title: 'Documento pendiente de ejemplo', message: 'Expediente EXP-2026-1048 · documentación de demostración.', time: 'Aviso ficticio', icon: 'document-text-outline' },
    { id: 'NOT-003', category: 'Sistema', title: 'Actividad de ejemplo', message: 'Se muestra información demostrativa de la institución.', time: 'Aviso ficticio', icon: 'notifications-outline' },
  ];

  readonly dashboardChildren = this.demoChildren.slice(0, 3);
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

  get activeNavigationSection(): InstitutionSection {
    if (['detalle', 'nuevoexp', 'familia', 'nino', 'estudio', 'entrevista', 'historial'].includes(this.activeSection)) {
      return this.activeSection === 'nino' ? 'ninos' : 'expedientes';
    }
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
