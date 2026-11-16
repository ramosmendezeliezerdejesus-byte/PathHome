import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, IonContent, IonIcon } from '@ionic/angular';
import { SupabaseService } from '../core/supabase/supabase.service';
import { addIcons } from 'ionicons';
import {
  calendarOutline, checkmarkCircleOutline, chatbubbleEllipsesOutline, documentTextOutline,
  folderOpenOutline, gridOutline, helpCircleOutline, homeOutline, informationCircleOutline,
  lockClosedOutline, logOutOutline, notificationsOutline, personOutline, settingsOutline,
} from 'ionicons/icons';

type DashboardSection = 'inicio' | 'proceso' | 'documentos' | 'citas' | 'notificaciones' | 'perfil' | 'mas' | 'asistente' | 'mensajes' | 'hogar' | 'solicitud' | 'menor' | 'seguimiento' | 'datos' | 'seguridad' | 'preferencias' | 'ayuda' | 'informacion' | 'terminos';
type NotificationFilter = 'Todas' | 'Citas' | 'Documentos' | 'Sistema';
type DocumentTab = 'requeridos' | 'subidos';
type AppointmentTab = 'proximas' | 'historial';

interface DashboardNotification {
  category: Exclude<NotificationFilter, 'Todas'>;
  icon: string;
  tone: 'appointment' | 'document' | 'system';
  title: string;
  description: string;
  date: string;
  unread: boolean;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: true,
  imports: [IonContent, IonIcon],
})
export class DashboardPage {
  activeSection: DashboardSection = 'inicio';
  activeFilter: NotificationFilter = 'Todas';
  documentTab: DocumentTab = 'requeridos';
  appointmentTab: AppointmentTab = 'proximas';
  assistantOpen = false;
  notificationsEnabled = true;
  appointmentNotificationsEnabled = true;
  documentNotificationsEnabled = true;
  progressNotificationsEnabled = true;
  localNotice = '';
  profileName = '';
  profileEmail = '';
  profileRole = 'Familia solicitante';
  readonly filters: NotificationFilter[] = ['Todas', 'Citas', 'Documentos', 'Sistema'];

  readonly stages = [
    { name: 'Solicitud creada', status: 'Demostración', icon: 'checkmark-circle-outline', current: false, complete: true },
    { name: 'Documentación', status: 'Completado · ejemplo', icon: 'checkmark-circle-outline', current: false, complete: true },
    { name: 'Entrevista inicial', status: 'Completado · ejemplo', icon: 'checkmark-circle-outline', current: false, complete: true },
    { name: 'Evaluación psicológica', status: 'En curso · ejemplo', icon: 'person-outline', current: true, complete: false },
    { name: 'Estudio social', status: 'Pendiente · ejemplo', icon: 'document-text-outline', current: false, complete: false },
    { name: 'Decisión final', status: 'Pendiente · ejemplo', icon: 'document-text-outline', current: false, complete: false },
  ];

  readonly requiredDocuments = [
    { name: 'Cédula de identidad', description: 'Documento obligatorio', demoProvided: true, fileName: '' },
    { name: 'Certificado de antecedentes penales', description: 'Documento obligatorio', demoProvided: false, fileName: '' },
    { name: 'Informe médico', description: 'Documento obligatorio', demoProvided: false, fileName: '' },
    { name: 'Comprobante de ingresos', description: 'Documento obligatorio', demoProvided: true, fileName: '' },
    { name: 'Formulario de solicitud', description: 'Documento obligatorio', demoProvided: true, fileName: '' },
  ];

  readonly demoAppointments = [
    { title: 'Evaluación psicológica', date: '15 de noviembre de 2025', time: '10:00 a. m.', location: 'Sede CONANI', status: 'Próxima · demostración' },
    { title: 'Evaluación final', date: '20 de diciembre de 2025', time: '09:30 a. m.', location: 'Ubicación de ejemplo', status: 'Próxima · demostración' },
  ];

  readonly notifications: DashboardNotification[] = [
    {
      category: 'Citas',
      icon: 'calendar-outline',
      tone: 'appointment',
      title: 'Nueva cita agendada',
      description: 'Evaluación psicológica · 10 de mayo de 2025 · 10:00 a. m.',
      date: 'Hace 2 h',
      unread: true,
    },
    {
      category: 'Documentos',
      icon: 'document-text-outline',
      tone: 'document',
      title: 'Documento pendiente',
      description: 'Informe médico. Por favor, sube tu documento.',
      date: 'Hace 5 h',
      unread: true,
    },
    {
      category: 'Sistema',
      icon: 'information-circle-outline',
      tone: 'system',
      title: 'Avance en tu proceso',
      description: 'Has completado la etapa de entrevista inicial.',
      date: 'Hace 1 día',
      unread: false,
    },
    {
      category: 'Sistema',
      icon: 'information-circle-outline',
      tone: 'system',
      title: 'Información importante',
      description: 'Recuerda mantener tus datos actualizados.',
      date: 'Hace 2 días',
      unread: false,
    },
    {
      category: 'Citas',
      icon: 'calendar-outline',
      tone: 'appointment',
      title: 'Nueva cita agendada',
      description: 'Reunión con la institución · 25 de abril, 2:00 p. m.',
      date: 'Hace 3 días',
      unread: false,
    },
  ];

  constructor(
    private readonly router: Router,
    private readonly supabase: SupabaseService,
    private readonly alertController: AlertController,
  ) {
    addIcons({
      calendarOutline, checkmarkCircleOutline, chatbubbleEllipsesOutline, documentTextOutline,
      folderOpenOutline, gridOutline, helpCircleOutline, homeOutline, informationCircleOutline,
      lockClosedOutline, logOutOutline, notificationsOutline, personOutline, settingsOutline,
    });
    void this.loadProfile();
    this.supabase.client.auth.onAuthStateChange((_event, session) => {
      if (session?.user) this.applyUser(session.user);
    });
  }

  get firstName(): string {
    const firstName = this.profileName.trim().split(/\s+/)[0];
    return firstName
      ? firstName.toLocaleLowerCase('es').replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase('es'))
      : 'Usuario';
  }

  private async loadProfile(): Promise<void> {
    const { data } = await this.supabase.client.auth.getUser();
    if (data.user) this.applyUser(data.user);
    else this.profileName = 'Usuario';
  }

  private applyUser(user: { email?: string; user_metadata?: Record<string, unknown> } | null): void {
    if (!user) return;
    const metadata = user.user_metadata ?? {};
    const metadataName = metadata['full_name']
      ?? metadata['fullName']
      ?? metadata['name']
      ?? metadata['display_name']
      ?? metadata['given_name']
      ?? metadata['first_name']
      ?? metadata['nombre'];
    const emailName = user.email?.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
    this.profileName = typeof metadataName === 'string' && metadataName.trim()
      ? metadataName.trim()
      : emailName
        ? emailName.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase())
        : 'Usuario';
    this.profileEmail = user.email ?? '';
    this.profileRole = metadata['account_type'] === 'psicologo'
      ? 'Psicólogo/a'
      : 'Familia solicitante';
  }

  get visibleNotifications(): DashboardNotification[] {
    return this.activeFilter === 'Todas'
      ? this.notifications
      : this.notifications.filter((notification) => notification.category === this.activeFilter);
  }

  get unreadCount(): number {
    return this.notifications.filter((notification) => notification.unread).length;
  }

  get primarySection(): 'inicio' | 'proceso' | 'notificaciones' | 'perfil' {
    if (this.activeSection === 'documentos' || this.activeSection === 'citas') return 'proceso';
    if (this.activeSection === 'datos') return 'perfil';
    if (this.activeSection === 'notificaciones') return 'notificaciones';
    return this.activeSection === 'proceso' ? 'proceso' : this.activeSection === 'perfil' ? 'perfil' : 'inicio';
  }

  get selectedDocuments(): typeof this.requiredDocuments {
    return this.requiredDocuments.filter((document) => document.fileName || document.demoProvided);
  }

  showSection(section: DashboardSection): void {
    this.activeSection = section;
    this.assistantOpen = false;
  }

  openQuickLink(destination: 'documentos' | 'citas' | 'notificaciones' | 'mas'): void {
    this.showSection(destination);
  }

  selectLocalFile(event: Event, document: (typeof this.requiredDocuments)[number]): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    document.fileName = file.name;
    this.documentTab = 'subidos';
    this.localNotice = `Archivo seleccionado en este dispositivo: ${file.name}. No se envió ni guardó en PathHome.`;
  }

  downloadCalendar(appointment: (typeof this.demoAppointments)[number]): void {
    const start = appointment.date.includes('15 de noviembre') ? '20251115T100000' : '20251220T093000';
    const end = appointment.date.includes('15 de noviembre') ? '20251115T110000' : '20251220T103000';
    const content = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PathHome//Citas de demostracion//ES',
      'BEGIN:VEVENT', `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${appointment.title} (demostración)`,
      `LOCATION:${appointment.location}`, 'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cita-pathhome-demostracion.ics';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.localNotice = 'Se descargó un archivo de calendario de demostración. No se creó ni notificó una cita real.';
  }

  profileAction(action: 'editar' | 'hogar' | 'ayuda'): void {
    const messages = {
      editar: 'La edición del perfil estará disponible cuando se conecte el servicio. No se guardaron cambios.',
      hogar: 'Los datos del hogar se mostrarán aquí cuando estén disponibles en tu cuenta.',
      ayuda: 'La ayuda y el soporte estarán disponibles cuando se conecte el servicio.',
    };
    this.localNotice = messages[action];
  }

  toggleAssistant(): void {
    this.assistantOpen = !this.assistantOpen;
  }

  async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
    await this.router.navigateByUrl('/login');
  }

  async confirmSignOut(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Cerrar sesión',
      message: '¿Estás seguro de que deseas cerrar sesión?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Cerrar sesión', role: 'confirm' },
      ],
    });

    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role === 'confirm') await this.signOut();
  }
}
