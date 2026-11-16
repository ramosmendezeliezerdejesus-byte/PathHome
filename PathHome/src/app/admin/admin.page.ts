import { ChangeDetectorRef, Component } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  barChartOutline, businessOutline, calendarOutline, checkmarkCircleOutline,
  closeCircleOutline, documentTextOutline, folderOpenOutline, homeOutline,
  logOutOutline, peopleOutline, personCircleOutline, personOutline, refreshOutline,
  shieldCheckmarkOutline, timeOutline,
} from 'ionicons/icons';
import {
  AdminUser,
  AdminVerificationRequest,
  FamilyCase,
  SupabaseService,
} from '../core/supabase/supabase.service';

type AdminSection = 'solicitudes' | 'usuarios' | 'expedientes' | 'citas' | 'reportes' | 'perfil';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [IonContent, IonIcon],
  templateUrl: './admin.page.html',
  styleUrls: [
    './admin.page.scss',
    './admin.family-cases.scss',
    './admin.family-detail.scss',
    './admin.polish-shell.scss',
    './admin.polish-pages.scss',
    './admin.polish-details.scss',
    './admin.requests.scss',
    './admin.users.scss',
    './admin.dialogs.scss',
  ],
})
export class AdminPage {
  activeSection: AdminSection = 'solicitudes';
  requests: AdminVerificationRequest[] = [];
  users: AdminUser[] = [];
  loading = true;
  working = false;
  error = '';
  notice = '';
  selectedRequest: AdminVerificationRequest | null = null;
  reviewChoice: 'aprobada' | 'rechazada' | null = null;
  documentUrl = '';
  documentLoadingId: string | null = null;
  documentError = '';
  documentErrorRequestId: string | null = null;
  documentPreviewFailed = false;
  familyCases: FamilyCase[] = [];
  selectedFamily: FamilyCase | null = null;
  familyDocumentUrl = '';

  readonly navigation: { id: AdminSection; label: string; icon: string }[] = [
    { id: 'solicitudes', label: 'Solicitudes', icon: 'home-outline' },
    { id: 'usuarios', label: 'Usuarios', icon: 'people-outline' },
    { id: 'expedientes', label: 'Expedientes', icon: 'folder-open-outline' },
    { id: 'citas', label: 'Citas', icon: 'calendar-outline' },
    { id: 'reportes', label: 'Reportes', icon: 'bar-chart-outline' },
    { id: 'perfil', label: 'Perfil', icon: 'person-circle-outline' },
  ];

  constructor(
    private readonly supabase: SupabaseService,
    private readonly router: Router,
    private readonly changeDetector: ChangeDetectorRef,
  ) {
    addIcons({
      barChartOutline, businessOutline, calendarOutline, checkmarkCircleOutline,
      closeCircleOutline, documentTextOutline, folderOpenOutline, homeOutline,
      logOutOutline, peopleOutline, personCircleOutline, personOutline, refreshOutline,
      shieldCheckmarkOutline, timeOutline,
    });
    void this.loadData();
  }

  get pendingCount(): number {
    return this.requests.filter((request) => request.status === 'pendiente').length;
  }

  get approvedCount(): number {
    return this.requests.filter((request) => request.status === 'aprobada').length;
  }

  get rejectedCount(): number {
    return this.requests.filter((request) => request.status === 'rechazada').length;
  }

  get familyCount(): number {
    return this.users.filter((user) => user.account_type === 'familia').length;
  }

  get professionalCount(): number {
    return this.users.filter((user) => user.account_type === 'profesional').length;
  }

  get institutionCount(): number {
    return this.users.filter((user) => user.account_type === 'institucion').length;
  }

  async loadData(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      const [requests, users] = await Promise.all([
        this.supabase.listAdminVerificationRequests(),
        this.supabase.listAdminUsers(),
      ]);
      this.requests = requests;
      this.users = users;
      if (this.activeSection === 'expedientes') this.familyCases = await this.supabase.listAdminFamilyCases();
      this.changeDetector.markForCheck();
    } catch (error) {
      this.error = error instanceof Error
        ? error.message
        : 'No se pudieron cargar los datos administrativos.';
      this.changeDetector.markForCheck();
    } finally {
      this.loading = false;
      this.changeDetector.markForCheck();
    }
  }

  selectSection(section: AdminSection): void {
    this.activeSection = section;
    this.notice = '';
    if (section === 'expedientes') void this.loadFamilyCases();
  }

  private async loadFamilyCases(): Promise<void> {
    this.loading = true;
    this.error = '';
    this.changeDetector.markForCheck();
    try { this.familyCases = await this.supabase.listAdminFamilyCases(); }
    catch (error) { this.error = error instanceof Error ? error.message : 'No se pudieron cargar los expedientes familiares. Ejecuta la migración de Supabase.'; }
    finally {
      this.loading = false;
      this.changeDetector.markForCheck();
    }
  }

  async reviewFamily(family: FamilyCase, status: 'aprobada' | 'rechazada'): Promise<void> {
    try {
      await this.supabase.setFamilyApproval(family.family_id, status);
      this.notice = status === 'aprobada' ? `Familia aprobada. ${family.full_name} ya aparecerá al psicólogo para agendar una cita.` : 'Expediente familiar rechazado.';
      this.selectedFamily = { ...family, status, approved_at: new Date().toISOString() };
      await this.loadFamilyCases();
    } catch (error) { this.error = error instanceof Error ? error.message : 'No se pudo actualizar el expediente.'; }
  }

  async removeFamilyApproval(family: FamilyCase): Promise<void> {
    try {
      await this.supabase.removeFamilyApproval(family.family_id);
      this.notice = `Se retiró la aprobación de ${family.full_name}.`;
      this.selectedFamily = { ...family, status: 'pendiente', approved_at: null };
      await this.loadFamilyCases();
    } catch (error) { this.error = error instanceof Error ? error.message : 'No se pudo retirar la aprobación.'; }
  }

  async openFamilyDocument(path: string): Promise<void> {
    try {
      this.familyDocumentUrl = await this.supabase.getFamilyDocumentUrl(path);
      window.open(this.familyDocumentUrl, '_blank', 'noopener');
    }
    catch (error) { this.error = error instanceof Error ? error.message : 'No se pudo abrir el documento.'; }
  }

  roleLabel(role: AdminUser['account_type'] | AdminVerificationRequest['account_type']): string {
    if (role === 'profesional') return 'Psicólogo/a especializado/a';
    if (role === 'institucion') return 'Personal de la institución';
    return 'Familia solicitante';
  }

  roleIcon(role: AdminUser['account_type'] | AdminVerificationRequest['account_type']): string {
    if (role === 'profesional') return 'person-outline';
    if (role === 'institucion') return 'business-outline';
    return 'people-outline';
  }

  statusLabel(status: AdminVerificationRequest['status'] | AdminUser['verification_status']): string {
    if (status === 'aprobada') return 'Aprobada';
    if (status === 'rechazada') return 'Rechazada';
    if (status === 'pendiente') return 'Pendiente';
    return 'Sin solicitud';
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleDateString('es-DO', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  askReview(request: AdminVerificationRequest, choice: 'aprobada' | 'rechazada'): void {
    this.selectedRequest = request;
    this.reviewChoice = choice;
  }

  closeReview(): void {
    if (this.working) return;
    this.selectedRequest = null;
    this.reviewChoice = null;
  }

  async confirmReview(): Promise<void> {
    if (!this.selectedRequest || !this.reviewChoice || this.working) return;
    this.working = true;
    this.error = '';
    try {
      await this.supabase.reviewVerificationRequest(this.selectedRequest.id, this.reviewChoice);
      this.notice = this.reviewChoice === 'aprobada'
        ? 'Solicitud aprobada. El acceso al apartado correspondiente ya está habilitado.'
        : 'Solicitud rechazada. El acceso al apartado profesional o institucional sigue bloqueado.';
      this.selectedRequest = null;
      this.reviewChoice = null;
      this.changeDetector.markForCheck();
      await this.loadData();
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'No se pudo guardar la revisión.';
      this.changeDetector.markForCheck();
    } finally {
      this.working = false;
      this.changeDetector.markForCheck();
    }
  }

  async openDocument(request: AdminVerificationRequest): Promise<void> {
    this.documentLoadingId = request.id;
    this.documentError = '';
    this.documentErrorRequestId = null;
    this.documentPreviewFailed = false;
    this.documentUrl = '';
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const url = await Promise.race([
        this.supabase.getVerificationDocumentUrl(request.document_path),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error('Supabase tardó demasiado en preparar el documento. Comprueba la conexión e inténtalo otra vez.')),
            15000,
          );
        }),
      ]);
      this.documentUrl = url;
      this.changeDetector.markForCheck();
    } catch (error) {
      this.documentErrorRequestId = request.id;
      this.documentError = error instanceof Error
        ? error.message
        : 'No se pudo abrir el documento privado.';
      this.changeDetector.markForCheck();
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      this.documentLoadingId = null;
      this.changeDetector.markForCheck();
    }
  }

  closeDocument(): void {
    this.documentUrl = '';
    this.documentPreviewFailed = false;
  }

  onDocumentPreviewError(): void {
    this.documentPreviewFailed = true;
  }

  async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
