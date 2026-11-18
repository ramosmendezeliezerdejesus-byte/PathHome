import { Component } from '@angular/core';
import { ChangeDetectorRef } from '@angular/core';
import { OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, IonContent, IonIcon } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from '../core/supabase/supabase.service';
import type { FamilyAppointment, FamilyNotification, FamilyOutcome } from '../core/supabase/supabase.service';
import { FamilyNavigationComponent } from '../shared/family-navigation/family-navigation.component';
import type { FamilyDashboardSection } from '../shared/family-navigation/family-navigation.component';
import { addIcons } from 'ionicons';
import {
  calendarOutline, checkmarkCircleOutline, chatbubbleEllipsesOutline, documentTextOutline,
  folderOpenOutline, gridOutline, helpCircleOutline, homeOutline, informationCircleOutline,
  lockClosedOutline, logOutOutline, notificationsOutline, personOutline, settingsOutline,
} from 'ionicons/icons';

type DashboardSection = FamilyDashboardSection;
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

interface AssistantMessage {
  role: 'user' | 'assistant';
  text: string;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: true,
  imports: [IonContent, IonIcon, FormsModule, FamilyNavigationComponent],
})
export class DashboardPage implements OnDestroy {
  activeSection: DashboardSection = 'inicio';
  mobileMenuOpen = false;
  dashboardLoading = true;
  private hasLoadedInitialData = false;
  activeFilter: NotificationFilter = 'Todas';
  documentTab: DocumentTab = 'requeridos';
  appointmentTab: AppointmentTab = 'proximas';
  assistantDraft = '';
  assistantBusy = false;
  assistantError = '';
  assistantMessages: AssistantMessage[] = [];
  notificationsEnabled = true;
  appointmentNotificationsEnabled = true;
  documentNotificationsEnabled = true;
  uploadedDocuments: import('../core/supabase/supabase.service').FamilyDocument[] = [];
  familyApprovalStatus: 'pendiente' | 'aprobada' | 'rechazada' | null = null;
  familyOutcome: FamilyOutcome | null = null;
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
  private accountGeneration = 0;
  private assistantConversationGeneration = 0;

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
      this.accountGeneration += 1;
      this.hasLoadedInitialData = false;
      this.dashboardLoading = !!userId;
      this.uploadedDocuments = [];
      this.familyApprovalStatus = null;
      this.familyOutcome = null;
      this.familyAppointments = [];
      this.familyNotifications = [];
      this.notificationsLoading = false;
      this.notificationError = '';
      this.notificationLoadPromise = null;
      this.notificationReloadRequested = false;
      this.profileName = '';
      this.profileEmail = '';
      this.profilePhotoUrl = '';
      this.profileEditName = '';
      this.profileEditEmail = '';
      this.profileRole = 'Familia solicitante';
      this.localNotice = '';
      this.activeFilter = 'Todas';
      this.documentTab = 'requeridos';
      this.appointmentTab = 'proximas';
      this.documentBusy = false;
      this.profileSaving = false;
      this.profilePhotoSaving = false;
      if (this.familyNotificationChannel) {
        void this.supabase.client.removeChannel(this.familyNotificationChannel);
        this.familyNotificationChannel = null;
      }
      this.activeSection = 'inicio';
      this.mobileMenuOpen = false;
      this.assistantConversationGeneration += 1;
      this.assistantMessages = [];
      this.assistantDraft = '';
      this.assistantError = '';
      this.assistantBusy = false;
      this.changeDetector.detectChanges();
      window.setTimeout(() => {
        if (!userId) return;
        void this.loadDashboardData();
        void this.loadNotifications();
        void this.subscribeToFamilyNotifications();
      }, 0);
    }).data.subscription;
  }

  ionViewWillEnter(): void {
    this.applyCatalogNavigationIntent();
    void this.loadDashboardData();
    void this.loadNotifications();
    void this.subscribeToFamilyNotifications();
  }

  private applyCatalogNavigationIntent(): void {
    const state = window.history.state as Record<string, unknown> | null;
    if (!state) return;

    const requestedSection = state['familyDashboardSection'];
    const requestedAction = state['familyDashboardAction'];
    if (!requestedSection && requestedAction !== 'confirm-sign-out') return;

    const nextState = { ...state };
    delete nextState['familyDashboardSection'];
    delete nextState['familyDashboardAction'];
    window.history.replaceState(nextState, '', window.location.href);

    const validSections: DashboardSection[] = [
      'inicio', 'proceso', 'documentos', 'citas', 'notificaciones', 'perfil', 'mas', 'asistente',
      'mensajes', 'hogar', 'solicitud', 'menor', 'seguimiento', 'datos', 'seguridad', 'preferencias',
      'ayuda', 'informacion', 'terminos',
    ];
    if (typeof requestedSection === 'string' && validSections.includes(requestedSection as DashboardSection)) {
      this.showSection(requestedSection as DashboardSection);
    }
    if (requestedAction === 'confirm-sign-out') void this.confirmSignOut();
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

  formatAssistantMessage(text: string): string {
    const escapeHtml = (value: string): string => value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const output: string[] = [];
    let listType: 'ul' | 'ol' | null = null;
    let listItems: string[] = [];
    const closeList = (): void => {
      if (listType && listItems.length) output.push(`<${listType}>${listItems.map((item) => `<li>${item}</li>`).join('')}</${listType}>`);
      listType = null;
      listItems = [];
    };
    for (const line of text.split(/\r?\n/)) {
      const safeLine = escapeHtml(line).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      const numbered = safeLine.match(/^\d+[.)]\s+(.+)$/);
      const bullet = safeLine.match(/^[-*•]\s+(.+)$/);
      if (numbered || bullet) {
        const nextType = numbered ? 'ol' : 'ul';
        if (listType !== nextType) closeList();
        listType = nextType;
        listItems.push((numbered ?? bullet)![1]);
        continue;
      }
      closeList();
      const heading = safeLine.match(/^#{1,3}\s+(.+)$/);
      if (heading) output.push(`<h3>${heading[1]}</h3>`);
      else if (safeLine.trim()) output.push(`<p>${safeLine}</p>`);
    }
    closeList();
    return output.join('');
  }

  private async loadDashboardData(): Promise<void> {
    const generation = this.accountGeneration;
    if (!this.hasLoadedInitialData) this.dashboardLoading = true;
    const pendingLoads = Promise.all([
      this.loadProfile(),
      this.loadDocuments(),
      this.loadAppointments(),
      this.loadFamilyApprovalStatus(),
      this.loadFamilyOutcome(),
    ]).catch(() => undefined).finally(() => this.changeDetector.detectChanges());
    try {
      if (!this.hasLoadedInitialData) {
        await Promise.race([pendingLoads, new Promise<void>((resolve) => setTimeout(resolve, 1600))]);
      }
    } finally {
      if (generation === this.accountGeneration) {
        this.hasLoadedInitialData = true;
        this.dashboardLoading = false;
        this.changeDetector.detectChanges();
      }
    }
  }

  private async loadProfile(): Promise<void> {
    const generation = this.accountGeneration;
    let user: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null = null;
    try {
      const { data, error } = await this.supabase.client.auth.getSession();
      if (!error) user = data.session?.user ?? null;
    } catch { /* Fall back to the neutral account label if auth is temporarily unavailable. */ }
    if (generation !== this.accountGeneration) return;
    if (!user || user.id !== this.lastAuthUserId) {
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
      if (generation !== this.accountGeneration) return;
      if (!error && profile) {
        this.profileName = profile.full_name?.trim() || this.profileName;
        this.profileEditName = this.profileName;
        this.profileRole = profile.account_type === 'profesional' ? 'Psicólogo/a' : 'Familia solicitante';
        this.changeDetector.detectChanges();
      }
    } catch { /* Keep the name and role already available from the local session. */ }

    try {
      const { data: profilePhoto, error } = await this.supabase.client.from('profiles').select('avatar_path').eq('id', user.id).maybeSingle();
      if (generation !== this.accountGeneration) return;
      if (!error && profilePhoto?.avatar_path) {
        const photoUrl = await this.supabase.getMyFamilyProfilePhotoUrl(profilePhoto.avatar_path);
        if (generation === this.accountGeneration) this.profilePhotoUrl = photoUrl;
      } else if (!error) this.profilePhotoUrl = '';
    } catch { /* La foto queda opcional si no se ha configurado su almacenamiento. */ }
    if (generation === this.accountGeneration) this.changeDetector.detectChanges();
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
    const generation = this.accountGeneration;
    if (this.notificationLoadPromise) {
      this.notificationReloadRequested = true;
      return this.notificationLoadPromise;
    }
    this.notificationsLoading = true;
    const loadPromise = this.supabase.listMyFamilyNotifications()
      .then((notifications) => {
        if (generation !== this.accountGeneration) return;
        this.familyNotifications = notifications;
        this.notificationError = '';
      })
      .catch(() => {
        if (generation !== this.accountGeneration) return;
        this.familyNotifications = [];
        this.notificationError = 'No se pudieron cargar las notificaciones. Verifica que el módulo esté configurado.';
      })
      .finally(() => {
        if (generation === this.accountGeneration && this.notificationLoadPromise === loadPromise) {
          this.notificationsLoading = false;
          this.notificationLoadPromise = null;
          this.changeDetector.detectChanges();
        }
        if (this.notificationReloadRequested) {
          this.notificationReloadRequested = false;
          void this.loadNotifications();
        }
      });
    this.notificationLoadPromise = loadPromise;
    return loadPromise;
  }

  private async subscribeToFamilyNotifications(): Promise<void> {
    if (this.familyNotificationChannel) return;
    try {
      const { data, error } = await this.supabase.client.auth.getSession();
      const familyId = data.session?.user.id;
      if (error || !familyId || familyId !== this.lastAuthUserId) return;
      this.familyNotificationChannel = this.supabase.client
        .channel(`family-notifications-${familyId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'family_notifications', filter: `family_id=eq.${familyId}` }, () => {
          void this.loadNotifications();
          void this.loadFamilyOutcome();
          void this.loadAppointments();
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

  get upcomingFamilyAppointments(): FamilyAppointment[] {
    return this.familyAppointments.filter((appointment) => !appointment.attended_at);
  }

  get completedFamilyAppointments(): FamilyAppointment[] {
    return this.familyAppointments.filter((appointment) => !!appointment.attended_at);
  }

  get processStatus(): string {
    if (this.familyOutcome?.status === 'aceptada') return 'Apta para acceder al catálogo';
    if (this.familyOutcome?.status === 'rechazada') return 'La institución solicita una nueva evaluación';
    if (this.familyApprovalStatus === 'aprobada') return 'Familia aceptada por la institución';
    if (this.familyApprovalStatus === 'rechazada') return 'La documentación requiere atención';
    if (this.documentProgress === 100) return 'Documentación enviada · pendiente de revisión';
    if (this.uploadedRequiredDocumentCount === 0) return 'Documentos pendientes';
    return `${this.uploadedRequiredDocumentCount} de ${this.requiredDocuments.length} documentos enviados`;
  }

  get stages(): { name: string; status: string; icon: string; current: boolean; complete: boolean; rejected?: boolean }[] {
    const documentsComplete = this.documentProgress === 100;
    const documentsSent = this.uploadedRequiredDocumentCount;
    const reviewComplete = this.familyApprovalStatus === 'aprobada' || this.familyApprovalStatus === 'rechazada';
    const administratorApproved = this.familyApprovalStatus === 'aprobada';
    const administratorRejected = this.familyApprovalStatus === 'rechazada';
    const appointment = this.upcomingFamilyAppointments[0];
    const appointmentStatus = appointment
      ? `Cita agendada: ${this.appointmentDate(appointment.appointment_date)} · ${appointment.appointment_time}`
      : this.completedFamilyAppointments.length
        ? 'Cita realizada · informe enviado o en preparación'
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
        name: 'Revisión Institucional',
        status: reviewStatus,
        icon: reviewComplete ? 'checkmark-circle-outline' : 'person-outline',
        current: documentsSent > 0 && !reviewComplete,
        complete: reviewComplete,
      },
      {
        name: 'Evaluación psicológica',
        status: appointmentStatus,
        icon: this.completedFamilyAppointments.length ? 'checkmark-circle-outline' : appointment ? 'calendar-outline' : 'person-outline',
        current: administratorApproved && Boolean(appointment) && this.completedFamilyAppointments.length === 0,
        complete: this.completedFamilyAppointments.length > 0,
      },
      {
        name: 'Resultado de aptitud',
        status: this.familyOutcome?.status === 'aceptada' ? 'Aceptada por la institución · acceso al catálogo habilitado' : this.familyOutcome?.status === 'rechazada' ? `La institución solicita una nueva evaluación${this.familyOutcome.reason ? ': ' + this.familyOutcome.reason : ''}` : this.familyOutcome?.status === 'pendiente' ? 'Informe psicológico enviado · pendiente de decisión institucional' : administratorApproved ? 'Pendiente de evaluación psicológica' : administratorRejected ? 'No disponible mientras la revisión esté rechazada' : 'Disponible después de la aprobación',
        icon: this.familyOutcome?.status === 'aceptada' ? 'checkmark-circle-outline' : this.familyOutcome?.status === 'rechazada' ? 'close-circle-outline' : 'help-circle-outline',
        current: this.familyOutcome?.status === 'pendiente',
        complete: this.familyOutcome?.status === 'aceptada',
        rejected: this.familyOutcome?.status === 'rechazada',
      },
      {
        name: 'Catálogo de niños',
        status: this.familyOutcome?.status === 'aceptada' ? 'Acceso habilitado' : this.familyOutcome?.status === 'rechazada' ? 'Aún no habilitado · se puede realizar otra evaluación' : 'Se habilita si la institución acepta el informe',
        icon: this.familyOutcome?.status === 'aceptada' ? 'checkmark-circle-outline' : this.familyOutcome?.status === 'rechazada' ? 'close-circle-outline' : 'home-outline',
        current: false,
        complete: this.familyOutcome?.status === 'aceptada',
        rejected: this.familyOutcome?.status === 'rechazada',
      },
      {
        name: 'Entrevista inicial',
        status: administratorApproved ? 'Pendiente de registro' : administratorRejected ? 'No disponible mientras la revisión esté rechazada' : 'Disponible después de la aprobación',
        icon: 'chatbubble-ellipses-outline',
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

  openCatalog(): void { void this.router.navigateByUrl('/catalogo'); }

  showSection(section: DashboardSection): void {
    this.activeSection = section;
    this.mobileMenuOpen = false;
    if (section === 'datos') {
      this.profileEditName = this.profileName;
      this.profileEditEmail = this.profileEmail;
      this.profileFeedback = '';
    }
    if (section === 'notificaciones') void this.loadNotifications();
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
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
    const generation = this.accountGeneration;
    try { const documents = await this.supabase.listMyFamilyDocuments(); if (generation === this.accountGeneration) this.uploadedDocuments = documents; }
    catch { /* The migration may not be installed yet. */ }
    finally { if (generation === this.accountGeneration) this.changeDetector.detectChanges(); }
  }

  private async loadAppointments(): Promise<void> {
    const generation = this.accountGeneration;
    try { const appointments = await this.supabase.listMyFamilyAppointments(); if (generation === this.accountGeneration) this.familyAppointments = appointments; }
    catch { /* The migration may not be installed yet. */ }
    finally { if (generation === this.accountGeneration) this.changeDetector.detectChanges(); }
  }

  private async loadFamilyApprovalStatus(): Promise<void> {
    const generation = this.accountGeneration;
    try { const status = await this.supabase.getMyFamilyApprovalStatus(); if (generation === this.accountGeneration) this.familyApprovalStatus = status; }
    catch { /* The family case may not exist yet. */ }
    finally { if (generation === this.accountGeneration) this.changeDetector.detectChanges(); }
  }

  private async loadFamilyOutcome(): Promise<void> {
    const generation = this.accountGeneration;
    try { const outcome = await this.supabase.getMyFamilyOutcome(); if (generation === this.accountGeneration) this.familyOutcome = outcome; }
    catch { /* Los resultados se habilitan al aplicar la migración de informes. */ }
    finally { if (generation === this.accountGeneration) this.changeDetector.detectChanges(); }
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

  async askAssistant(question = this.assistantDraft): Promise<void> {
    const text = question.trim();
    if (!text || this.assistantBusy) return;
    const conversationGeneration = this.assistantConversationGeneration;
    const accountId = this.lastAuthUserId;
    this.assistantDraft = '';
    this.assistantError = '';
    this.assistantMessages = [...this.assistantMessages, { role: 'user', text }];
    this.assistantBusy = true;
    try {
      const previousMessages = this.assistantMessages.slice(-9, -1);
      const firstUserMessage = previousMessages.findIndex(({ role }) => role === 'user');
      const history = firstUserMessage < 0 ? [] : previousMessages.slice(firstUserMessage).map(({ role, text: message }) => ({ role, text: message }));
      const { data, error } = await this.supabase.client.functions.invoke('family-assistant', {
        body: { message: text, history },
      });
      if (conversationGeneration !== this.assistantConversationGeneration || accountId !== this.lastAuthUserId) return;
      if (error) throw error;
      if (typeof data?.reply !== 'string' || !data.reply.trim()) throw new Error('No se recibió una respuesta válida.');
      this.assistantMessages = [...this.assistantMessages, { role: 'assistant', text: data.reply }];
    } catch (error) {
      if (conversationGeneration !== this.assistantConversationGeneration || accountId !== this.lastAuthUserId) return;
      let errorMessage = error instanceof Error ? error.message : 'No se pudo conectar con el asistente. Inténtalo de nuevo.';
      const response = error && typeof error === 'object' && 'context' in error ? error.context : null;
      if (response && typeof response === 'object' && 'clone' in response && typeof response.clone === 'function') {
        const payload = await (response.clone() as Response).json().catch(() => null) as { error?: unknown } | null;
        if (typeof payload?.error === 'string') errorMessage = payload.error;
      }
      this.assistantError = errorMessage.includes('Edge Function returned a non-2xx status code')
        ? 'El asistente no pudo responder ahora. Espera unos segundos e inténtalo de nuevo.'
        : errorMessage;
    } finally {
      if (conversationGeneration === this.assistantConversationGeneration && accountId === this.lastAuthUserId) {
        this.assistantBusy = false;
        this.changeDetector.detectChanges();
      }
    }
  }

  async signOut(): Promise<void> {
    this.activeSection = 'inicio';
    this.mobileMenuOpen = false;
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
