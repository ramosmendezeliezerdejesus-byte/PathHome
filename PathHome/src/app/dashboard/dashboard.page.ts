import { Component } from '@angular/core';
import { ChangeDetectorRef } from '@angular/core';
import { OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, IonContent, IonIcon } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from '../core/supabase/supabase.service';
import type { FamilyAppointment, FamilyNotification } from '../core/supabase/supabase.service';
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
  id: string;
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
  imports: [IonContent, IonIcon, FormsModule],
})
export class DashboardPage implements OnDestroy {
  activeSection: DashboardSection = 'inicio';
  dashboardLoading = true;
  private hasLoadedInitialData = false;
  activeFilter: NotificationFilter = 'Todas';
  documentTab: DocumentTab = 'requeridos';
  appointmentTab: AppointmentTab = 'proximas';
  assistantOpen = false;
  notificationsEnabled = true;
  appointmentNotificationsEnabled = true;
  documentNotificationsEnabled = true;
  uploadedDocuments: import('../core/supabase/supabase.service').FamilyDocument[] = [];
  familyApprovalStatus: 'pendiente' | 'aprobada' | 'rechazada' | null = null;
  readonly requiredDocuments = [
    { name: 'Cédula de identidad', description: 'Documento obligatorio' },
    { name: 'Certificado de antecedentes penales', description: 'Documento obligatorio' },
    { name: 'Informe médico', description: 'Documento obligatorio' },
    { name: 'Comprobante de ingresos', description: 'Documento obligatorio' },
    { name: 'Formulario de solicitud', description: 'Documento obligatorio' },
  ];
  familyAppointments: FamilyAppointment[] = [];
  documentBusy = false;
  progressNotificationsEnabled = true;
  localNotice = '';
  profileName = '';
  profileEmail = '';
  profilePhotoUrl = '';
  profileEditName = '';
  profileEditEmail = '';
  profileSaving = false;
  profilePhotoSaving = false;
  profileFeedback = '';
  profileRole = 'Familia solicitante';
  familyNotifications: FamilyNotification[] = [];
  notificationsLoading = false;
  notificationError = '';
  readonly filters: NotificationFilter[] = ['Todas', 'Citas', 'Documentos', 'Sistema'];
  private familyNotificationChannel: RealtimeChannel | null = null;
  private notificationLoadPromise: Promise<void> | null = null;
  private notificationReloadRequested = false;
  private authSubscription: { unsubscribe: () => void } | null = null;
  private lastAuthUserId: string | null = null;

  constructor(
    private readonly router: Router,
    private readonly supabase: SupabaseService,
    private readonly alertController: AlertController,
    private readonly changeDetector: ChangeDetectorRef,
  ) {
    addIcons({
      calendarOutline, checkmarkCircleOutline, chatbubbleEllipsesOutline, documentTextOutline,
      folderOpenOutline, gridOutline, helpCircleOutline, homeOutline, informationCircleOutline,
      lockClosedOutline, logOutOutline, notificationsOutline, personOutline, settingsOutline,
    });
    this.authSubscription = this.supabase.client.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user.id ?? null;
      if (userId === this.lastAuthUserId) return;
      this.lastAuthUserId = userId;
      window.setTimeout(() => {
        if (!userId) return;
        void this.loadDashboardData();
        void this.loadNotifications();
        void this.subscribeToFamilyNotifications();
      }, 0);
    }).data.subscription;
  }

  ionViewWillEnter(): void {
    void this.loadDashboardData();
    void this.loadNotifications();
    void this.subscribeToFamilyNotifications();
  }

  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
    if (this.familyNotificationChannel) void this.supabase.client.removeChannel(this.familyNotificationChannel);
  }

  get firstName(): string {
    const firstName = this.profileName.trim().split(/\s+/)[0];
    return firstName
      ? firstName.toLocaleLowerCase('es').replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase('es'))
      : 'Usuario';
  }

  private async loadDashboardData(): Promise<void> {
    if (!this.hasLoadedInitialData) this.dashboardLoading = true;
    const pendingLoads = Promise.all([
      this.loadProfile(),
      this.loadDocuments(),
      this.loadAppointments(),
      this.loadFamilyApprovalStatus(),
    ]).catch(() => undefined).finally(() => this.changeDetector.detectChanges());
    try {
      if (!this.hasLoadedInitialData) {
        await Promise.race([pendingLoads, new Promise<void>((resolve) => setTimeout(resolve, 1600))]);
      }
    } finally {
      this.hasLoadedInitialData = true;
      this.dashboardLoading = false;
      this.changeDetector.detectChanges();
    }
  }

  private async loadProfile(): Promise<void> {
    let user: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null = null;
    try {
      const { data, error } = await this.supabase.client.auth.getSession();
      if (!error) user = data.session?.user ?? null;
    } catch { /* Fall back to the neutral account label if auth is temporarily unavailable. */ }
    if (!user) {
      this.profileName = 'Usuario';
      this.profileEmail = '';
      return;
    }

    const metadata = user.user_metadata ?? {};
    const metadataName = metadata['full_name']
      ?? metadata['fullName']
      ?? metadata['name']
      ?? metadata['display_name']
      ?? metadata['given_name']
      ?? metadata['first_name']
      ?? metadata['nombre'];
    const emailName = user.email?.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
    this.profileName = (typeof metadataName === 'string' ? metadataName.trim() : '')
      || (emailName ? emailName.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase()) : 'Usuario');
    this.profileEmail = user.email ?? '';
    this.profileEditName = this.profileName;
    this.profileEditEmail = this.profileEmail;
    this.profileRole = metadata['account_type'] === 'psicologo'
      ? 'Psicólogo/a'
      : 'Familia solicitante';
    this.changeDetector.detectChanges();

    try {
      const { data: profile, error } = await this.supabase.client.from('profiles').select('full_name, account_type').eq('id', user.id).maybeSingle();
      if (!error && profile) {
        this.profileName = profile.full_name?.trim() || this.profileName;
        this.profileEditName = this.profileName;
        this.profileRole = profile.account_type === 'profesional' ? 'Psicólogo/a' : 'Familia solicitante';
        this.changeDetector.detectChanges();
      }
    } catch { /* Keep the name and role already available from the local session. */ }

    try {
      const { data: profilePhoto, error } = await this.supabase.client.from('profiles').select('avatar_path').eq('id', user.id).maybeSingle();
      if (!error && profilePhoto?.avatar_path) {
        this.profilePhotoUrl = await this.supabase.getMyFamilyProfilePhotoUrl(profilePhoto.avatar_path);
      } else if (!error) this.profilePhotoUrl = '';
    } catch { /* La foto queda opcional si no se ha configurado su almacenamiento. */ }
    this.changeDetector.detectChanges();
  }

  get visibleNotifications(): DashboardNotification[] {
    const notifications = this.familyNotifications.map((notification) => this.toDashboardNotification(notification));
    return this.activeFilter === 'Todas'
      ? notifications
      : notifications.filter((notification) => notification.category === this.activeFilter);
  }

  get unreadCount(): number {
    return this.familyNotifications.filter((notification) => !notification.read_at).length;
  }

  private toDashboardNotification(notification: FamilyNotification): DashboardNotification {
    const category: Exclude<NotificationFilter, 'Todas'> = notification.category === 'cita'
      ? 'Citas'
      : notification.category === 'documento'
        ? 'Documentos'
        : 'Sistema';
    return {
      id: notification.id,
      category,
      icon: notification.category === 'cita' ? 'calendar-outline' : notification.category === 'documento' ? 'document-text-outline' : 'notifications-outline',
      tone: notification.category === 'cita' ? 'appointment' : notification.category === 'documento' ? 'document' : 'system',
      title: notification.title,
      description: notification.message,
      date: new Date(notification.created_at).toLocaleString('es-DO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
      unread: !notification.read_at,
    };
  }

  private loadNotifications(): Promise<void> {
    if (this.notificationLoadPromise) {
      this.notificationReloadRequested = true;
      return this.notificationLoadPromise;
    }
    this.notificationsLoading = true;
    this.notificationLoadPromise = this.supabase.listMyFamilyNotifications()
      .then((notifications) => {
        this.familyNotifications = notifications;
        this.notificationError = '';
      })
      .catch(() => {
        this.familyNotifications = [];
        this.notificationError = 'No se pudieron cargar las notificaciones. Verifica que el módulo esté configurado.';
      })
      .finally(() => {
        this.notificationsLoading = false;
        this.notificationLoadPromise = null;
        this.changeDetector.detectChanges();
        if (this.notificationReloadRequested) {
          this.notificationReloadRequested = false;
          void this.loadNotifications();
        }
      });
    return this.notificationLoadPromise;
  }

  private async subscribeToFamilyNotifications(): Promise<void> {
    if (this.familyNotificationChannel) return;
    try {
      const { data, error } = await this.supabase.client.auth.getSession();
      const familyId = data.session?.user.id;
      if (error || !familyId) return;
      this.familyNotificationChannel = this.supabase.client
        .channel(`family-notifications-${familyId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'family_notifications', filter: `family_id=eq.${familyId}` }, () => {
          void this.loadNotifications();
        })
        .subscribe();
    } catch { /* Notifications still refresh whenever the section is opened. */ }
  }

  async markNotificationAsRead(notificationId: string): Promise<void> {
    const notification = this.familyNotifications.find((item) => item.id === notificationId);
    if (!notification || notification.read_at) return;
    notification.read_at = new Date().toISOString();
    this.changeDetector.detectChanges();
    try {
      await this.supabase.markFamilyNotificationRead(notificationId);
    } catch {
      notification.read_at = null;
      this.notificationError = 'No se pudo marcar la notificación como leída.';
    } finally {
      this.changeDetector.detectChanges();
    }
  }

  async markAllNotificationsAsRead(): Promise<void> {
    const unread = this.familyNotifications.filter((notification) => !notification.read_at);
    if (!unread.length) return;
    const updatedAt = new Date().toISOString();
    unread.forEach((notification) => { notification.read_at = updatedAt; });
    this.changeDetector.detectChanges();
    try {
      await this.supabase.markAllMyFamilyNotificationsRead();
    } catch {
      unread.forEach((notification) => { notification.read_at = null; });
      this.notificationError = 'No se pudieron marcar las notificaciones como leídas.';
    } finally {
      this.changeDetector.detectChanges();
    }
  }

  get uploadedRequiredDocumentCount(): number {
    const uploadedTypes = new Set(this.uploadedDocuments.map((document) => document.document_type.trim().toLocaleLowerCase('es')));
    return this.requiredDocuments.filter((document) => uploadedTypes.has(document.name.toLocaleLowerCase('es'))).length;
  }

  get documentProgress(): number {
    return Math.round((this.uploadedRequiredDocumentCount / this.requiredDocuments.length) * 100);
  }

  get processStatus(): string {
    if (this.familyApprovalStatus === 'aprobada') return 'Familia aceptada por el administrador';
    if (this.familyApprovalStatus === 'rechazada') return 'La documentación requiere atención';
    if (this.documentProgress === 100) return 'Documentación enviada · pendiente de revisión';
    if (this.uploadedRequiredDocumentCount === 0) return 'Documentos pendientes';
    return `${this.uploadedRequiredDocumentCount} de ${this.requiredDocuments.length} documentos enviados`;
  }

  get stages(): { name: string; status: string; icon: string; current: boolean; complete: boolean }[] {
    const documentsComplete = this.documentProgress === 100;
    const documentsSent = this.uploadedRequiredDocumentCount;
    const reviewComplete = this.familyApprovalStatus === 'aprobada' || this.familyApprovalStatus === 'rechazada';
    const administratorApproved = this.familyApprovalStatus === 'aprobada';
    const administratorRejected = this.familyApprovalStatus === 'rechazada';
    const appointment = this.familyAppointments[0];
    const appointmentStatus = appointment
      ? `Cita agendada: ${this.appointmentDate(appointment.appointment_date)} · ${appointment.appointment_time}`
      : administratorApproved
        ? 'Pendiente de agendar'
        : administratorRejected
          ? 'No disponible mientras la revisión esté rechazada'
          : 'Disponible después de la aprobación';
    const reviewStatus = documentsSent === 0
      ? 'Se habilita al enviar documentos'
      : administratorApproved
        ? 'Aceptada por el administrador'
        : administratorRejected
          ? 'Requiere revisar la documentación'
          : 'Pendiente de revisión administrativa';

    return [
      { name: 'Solicitud creada', status: 'Cuenta familiar registrada', icon: 'checkmark-circle-outline', current: false, complete: true },
      {
        name: 'Documentación',
        status: documentsComplete ? 'Documentación completa' : documentsSent ? `${documentsSent} de ${this.requiredDocuments.length} documentos enviados` : 'Aún no has enviado documentos',
        icon: documentsComplete ? 'checkmark-circle-outline' : 'document-text-outline',
        current: !documentsComplete,
        complete: documentsComplete,
      },
      {
        name: 'Revisión administrativa',
        status: reviewStatus,
        icon: reviewComplete ? 'checkmark-circle-outline' : 'person-outline',
        current: documentsSent > 0 && !reviewComplete,
        complete: reviewComplete,
      },
      {
        name: 'Entrevista inicial',
        status: administratorApproved ? 'Pendiente de registro' : administratorRejected ? 'No disponible mientras la revisión esté rechazada' : 'Disponible después de la aprobación',
        icon: 'chatbubble-ellipses-outline',
        current: false,
        complete: false,
      },
      {
        name: 'Evaluación psicológica',
        status: appointmentStatus,
        icon: appointment ? 'calendar-outline' : 'person-outline',
        current: administratorApproved && Boolean(appointment),
        complete: false,
      },
      {
        name: 'Resultado de aptitud',
        status: administratorApproved ? 'Pendiente del resultado del psicólogo' : administratorRejected ? 'No disponible mientras la revisión esté rechazada' : 'Disponible después de la aprobación',
        icon: 'help-circle-outline',
        current: false,
        complete: false,
      },
      {
        name: 'Catálogo de niños',
        status: 'Se habilita si el resultado psicológico es favorable',
        icon: 'home-outline',
        current: false,
        complete: false,
      },
      {
        name: 'Estudio social',
        status: 'Pendiente de la etapa correspondiente',
        icon: 'document-text-outline',
        current: false,
        complete: false,
      },
      {
        name: 'Decisión final',
        status: 'Pendiente de la etapa correspondiente',
        icon: 'checkmark-circle-outline',
        current: false,
        complete: false,
      },
    ];
  }

  get primarySection(): 'inicio' | 'proceso' | 'notificaciones' | 'perfil' {
    if (this.activeSection === 'documentos' || this.activeSection === 'citas') return 'proceso';
    if (this.activeSection === 'datos') return 'perfil';
    if (this.activeSection === 'notificaciones') return 'notificaciones';
    return this.activeSection === 'proceso' ? 'proceso' : this.activeSection === 'perfil' ? 'perfil' : 'inicio';
  }

  showSection(section: DashboardSection): void {
    this.activeSection = section;
    if (section === 'datos') {
      this.profileEditName = this.profileName;
      this.profileEditEmail = this.profileEmail;
      this.profileFeedback = '';
    }
    this.assistantOpen = false;
    if (section === 'notificaciones') void this.loadNotifications();
  }

  openQuickLink(destination: 'documentos' | 'citas' | 'notificaciones' | 'mas'): void {
    this.showSection(destination);
  }

  uploadRequiredFile(event: Event, documentType: string): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const existing = this.uploadedDocuments.find((document) => document.document_type === documentType);
    this.documentBusy = true;
    const save = existing
      ? this.supabase.replaceFamilyDocument(existing.id, file, documentType)
      : this.supabase.uploadFamilyDocument(file, documentType);
    void save.then(async () => {
      await this.loadDocuments();
      await this.loadNotifications();
      this.documentTab = 'subidos';
      this.localNotice = existing ? `${documentType} actualizado.` : `${documentType} enviado para revisión.`;
    }).catch((error: unknown) => {
      this.localNotice = error instanceof Error ? error.message : 'No se pudo enviar el documento.';
    }).finally(() => { this.documentBusy = false; });
  }

  isDocumentUploaded(documentType: string): boolean {
    return this.uploadedDocuments.some((document) => document.document_type === documentType);
  }

  uploadedDocument(documentType: string): import('../core/supabase/supabase.service').FamilyDocument | undefined {
    return this.uploadedDocuments.find((document) => document.document_type === documentType);
  }

  deleteFamilyDocument(documentId: string): void {
    this.documentBusy = true;
    void this.supabase.deleteFamilyDocument(documentId).then(() => this.loadDocuments())
      .then(() => { this.localNotice = 'Documento eliminado.'; })
      .catch((error: unknown) => { this.localNotice = error instanceof Error ? error.message : 'No se pudo eliminar el documento.'; })
      .finally(() => { this.documentBusy = false; });
  }

  private async loadDocuments(): Promise<void> {
    try { this.uploadedDocuments = await this.supabase.listMyFamilyDocuments(); }
    catch { /* The migration may not be installed yet. */ }
    finally { this.changeDetector.detectChanges(); }
  }

  private async loadAppointments(): Promise<void> {
    try { this.familyAppointments = await this.supabase.listMyFamilyAppointments(); }
    catch { /* The migration may not be installed yet. */ }
    finally { this.changeDetector.detectChanges(); }
  }

  private async loadFamilyApprovalStatus(): Promise<void> {
    try { this.familyApprovalStatus = await this.supabase.getMyFamilyApprovalStatus(); }
    catch { /* The family case may not exist yet. */ }
    finally { this.changeDetector.detectChanges(); }
  }

  appointmentDate(value: string): string {
    return new Date(`${value}T12:00:00`).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  formatDocumentDate(value: string): string {
    return new Date(value).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  profileAction(action: 'editar' | 'hogar' | 'ayuda'): void {
    const messages = {
      editar: 'La edición del perfil estará disponible cuando se conecte el servicio. No se guardaron cambios.',
      hogar: 'Los datos del hogar se mostrarán aquí cuando estén disponibles en tu cuenta.',
      ayuda: 'La ayuda y el soporte estarán disponibles cuando se conecte el servicio.',
    };
    this.localNotice = messages[action];
  }

  async saveProfileChanges(): Promise<void> {
    const fullName = this.profileEditName.trim();
    const email = this.profileEditEmail.trim();
    if (!fullName || !email) {
      this.profileFeedback = 'Completa tu nombre y correo electrónico.';
      return;
    }
    this.profileSaving = true;
    this.profileFeedback = '';
    try {
      const result = await this.supabase.updateMyFamilyProfile({ fullName, email });
      this.profileName = fullName;
      this.profileEmail = result.email;
      this.profileEditEmail = email;
      this.profileFeedback = result.emailChangePending
        ? 'Nombre actualizado. Revisa tu nuevo correo para confirmar el cambio de dirección.'
        : 'Tu perfil se actualizó correctamente.';
    } catch (error) {
      this.profileFeedback = error instanceof Error ? error.message : 'No se pudieron guardar los cambios del perfil.';
    } finally {
      this.profileSaving = false;
      this.changeDetector.detectChanges();
    }
  }

  async changeProfilePhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.profilePhotoSaving = true;
    this.profileFeedback = '';
    try {
      const photo = await this.supabase.uploadMyFamilyProfilePhoto(file);
      this.profilePhotoUrl = photo.signedUrl;
      this.profileFeedback = 'Tu foto de perfil se actualizó.';
    } catch (error) {
      this.profileFeedback = error instanceof Error ? error.message : 'No se pudo actualizar la foto de perfil.';
    } finally {
      this.profilePhotoSaving = false;
      input.value = '';
      this.changeDetector.detectChanges();
    }
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
