import { ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline, arrowBackOutline, arrowForwardOutline, bookOutline, calendarOutline,
  chevronBackOutline, chevronDownOutline, chevronForwardOutline, closeOutline, documentTextOutline,
  heartOutline,
  locationOutline, lockClosedOutline, peopleOutline, personOutline, searchOutline,
  shieldCheckmarkOutline, sparklesOutline,
} from 'ionicons/icons';
import { FamilyNavigationComponent } from '../shared/family-navigation/family-navigation.component';
import type { FamilyDashboardSection } from '../shared/family-navigation/family-navigation.component';
import { FamilyCatalogChild, InstitutionChildProfile, SupabaseService } from '../core/supabase/supabase.service';

type ProposalStatus = 'disponible' | 'pendiente' | 'aceptada' | 'rechazada';
type ProposalGender = 'niño' | 'niña';
type GenderFilter = 'todas' | ProposalGender;
type AgeFilter = 'todas' | '0-5' | '6-10' | '11-15' | '16+';

interface CatalogProposal {
  id: string;
  title: string;
  age: number | null;
  gender: ProposalGender | null;
  location: string | null;
  summary: string | null;
  details: string | null;
  institution: string | null;
  interests: string[];
  characteristics: string[];
  photoUrl: string | null;
  status: ProposalStatus;
  tone: string;
}

@Component({
  selector: 'app-catalogo',
  standalone: true,
  imports: [IonContent, IonIcon, FamilyNavigationComponent],
  templateUrl: './catalogo.page.html',
  styleUrl: './catalogo.page.scss',
})
export class CatalogPage implements OnDestroy {
  proposals: CatalogProposal[] = [];

  mobileMenuOpen = false;
  isInstitutionView = false;
  interestBusyId: string | null = null;
  interestNotice = '';
  private interestedChildIds = new Set<string>();
  isLoading = false;
  loadError = '';
  searchText = '';
  genderFilter: GenderFilter = 'todas';
  ageFilter: AgeFilter = 'todas';
  selectedProposalId: string | null = null;
  currentPage = 1;
  readonly pageSize = 3;
  readonly genderOptions: { value: GenderFilter; label: string }[] = [
    { value: 'todas', label: 'Todas' },
    { value: 'niño', label: 'Niño' },
    { value: 'niña', label: 'Niña' },
  ];
  private institutionChildrenChannel: { unsubscribe: () => Promise<unknown> } | null = null;
  private familyCatalogRefreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly router: Router, private readonly supabase: SupabaseService, private readonly changeDetector: ChangeDetectorRef, private readonly alertController: AlertController) {
    addIcons({
      alertCircleOutline, arrowBackOutline, arrowForwardOutline, bookOutline, calendarOutline,
      chevronBackOutline, chevronDownOutline, chevronForwardOutline, closeOutline, documentTextOutline,
      heartOutline,
      locationOutline, lockClosedOutline, peopleOutline, personOutline, searchOutline,
      shieldCheckmarkOutline, sparklesOutline,
    });
    void this.loadCatalog();
  }

  get filteredProposals(): CatalogProposal[] {
    const query = this.searchText.trim().toLocaleLowerCase('es');
    return this.proposals.filter((proposal) => {
      const matchesGender = this.genderFilter === 'todas' || proposal.gender === this.genderFilter;
      const matchesQuery = !query || [proposal.title, proposal.gender, proposal.age?.toString(), proposal.age === null ? null : `${proposal.age} años`, proposal.location, proposal.summary, proposal.details, proposal.institution, ...proposal.characteristics, ...proposal.interests]
        .some((value) => value?.toLocaleLowerCase('es').includes(query));
      return matchesGender && matchesQuery && this.matchesAge(proposal.age);
    });
  }

  get visibleProposals(): CatalogProposal[] { return this.filteredProposals; }
  get selectedProposal(): CatalogProposal | null {
    if (!this.selectedProposalId) return null;
    return this.proposals.find((proposal) => proposal.id === this.selectedProposalId) ?? null;
  }
  get paginatedProposals(): CatalogProposal[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredProposals.slice(start, start + this.pageSize);
  }
  get totalPages(): number { return Math.ceil(this.filteredProposals.length / this.pageSize); }
  get pageNumbers(): number[] { return Array.from({ length: this.totalPages }, (_, index) => index + 1); }

  navigateToDashboardSection(section: FamilyDashboardSection): void {
    void this.router.navigateByUrl('/dashboard', { state: { familyDashboardSection: section } });
  }

  ngOnDestroy(): void {
    if (this.institutionChildrenChannel) void this.institutionChildrenChannel.unsubscribe();
    if (this.familyCatalogRefreshTimer) clearInterval(this.familyCatalogRefreshTimer);
  }

  toggleMobileMenu(): void { this.mobileMenuOpen = !this.mobileMenuOpen; }
  requestSignOut(): void {
    void this.router.navigateByUrl('/dashboard', { state: { familyDashboardAction: 'confirm-sign-out' } });
  }

  setSearch(event: Event): void {
    this.searchText = (event.target as HTMLInputElement).value;
    this.currentPage = 1;
  }
  clearSearch(): void { this.searchText = ''; this.currentPage = 1; }
  setGenderFilter(value: GenderFilter): void { this.genderFilter = value; this.currentPage = 1; }
  setAgeFilter(event: Event): void {
    this.ageFilter = (event.target as HTMLSelectElement).value as AgeFilter;
    this.currentPage = 1;
  }
  resetFilters(): void {
    this.searchText = '';
    this.genderFilter = 'todas';
    this.ageFilter = 'todas';
    this.currentPage = 1;
    this.selectedProposalId = null;
  }
  setPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
  }
  previousPage(): void { this.setPage(this.currentPage - 1); }
  nextPage(): void { this.setPage(this.currentPage + 1); }
  openProposalDetails(proposalId: string): void { this.selectedProposalId = proposalId; }
  closeProposalDetails(): void { this.selectedProposalId = null; }
  hasExpressedInterest(childId: string): boolean { return this.interestedChildIds.has(childId); }
  async confirmExpressInterest(childId: string): Promise<void> {
    if (this.isInstitutionView || this.interestBusyId) return;
    const proposal = this.proposals.find((item) => item.id === childId);
    if (!proposal) return;
    const alert = await this.alertController.create({
      header: 'Confirmar elección',
      message: `¿Estás seguro de que quieres elegir a ${proposal.title}? Después de aceptar, ya no podrás volver al catálogo. La institución coordinará una cita para que puedas conocerlo.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Aceptar', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'confirm') return;
    await this.expressInterest(childId);
  }

  private async expressInterest(childId: string): Promise<void> {
    if (this.isInstitutionView || this.interestBusyId) return;
    this.interestBusyId = childId;
    this.interestNotice = '';
    try {
      await this.supabase.expressChildInterest(childId);
      this.interestedChildIds.add(childId);
      await this.router.navigateByUrl('/dashboard', { state: { familyDashboardSection: 'inicio' } });
    } catch (error) {
      this.interestNotice = error instanceof Error ? error.message : 'No se pudo enviar tu interés.';
      if (this.interestNotice.includes('ya fue seleccionado') || this.interestNotice.includes('ya no está disponible')) {
        void this.refreshFamilyCatalog();
      }
    } finally {
      this.interestBusyId = null;
      this.changeDetector.markForCheck();
    }
  }
  statusLabel(status: ProposalStatus): string {
    const labels: Record<ProposalStatus, string> = {
      disponible: 'Disponible', pendiente: 'Pendiente', aceptada: 'Aceptada', rechazada: 'Rechazada',
    };
    return labels[status];
  }

  private async loadCatalog(): Promise<void> {
    this.isLoading = true;
    this.loadError = '';
    try {
      const { data, error } = await this.supabase.client.auth.getUser();
      if (error) throw error;
      if (!data.user) throw new Error('Inicia sesión para consultar el catálogo.');
      this.isInstitutionView = (await this.supabase.getDestinationForUser(data.user.id)) === '/institucion';
      if (this.isInstitutionView) {
        const children = await this.supabase.listInstitutionChildren();
        this.proposals = children.map((child) => this.toProposal(child));
        this.institutionChildrenChannel = this.supabase.client.channel(`institution-catalog-${data.user.id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'institution_children', filter: `institution_id=eq.${data.user.id}` }, () => {
            void this.refreshInstitutionProfiles();
          })
          .subscribe();
      } else {
        const cases = await this.supabase.listChildInterestCases();
        this.interestedChildIds = new Set(cases.flatMap((item) => item.child_id ? [item.child_id] : []));
        if (cases.length) {
          await this.router.navigateByUrl('/dashboard', { state: { familyDashboardSection: 'inicio' } });
          return;
        }
        const children = await this.supabase.listFamilyCatalogChildren();
        this.proposals = children.map((child) => this.toProposal(child));
        this.startFamilyCatalogRefresh();
      }
    } catch (error) {
      this.loadError = error instanceof Error ? error.message : 'No se pudieron cargar los perfiles del catálogo.';
    } finally {
      this.isLoading = false;
      this.changeDetector.markForCheck();
    }
  }

  private toProposal(child: InstitutionChildProfile | FamilyCatalogChild): CatalogProposal {
    return {
      id: child.id,
      title: child.name,
      age: child.age,
      gender: child.gender === 'Niña' ? 'niña' : 'niño',
      location: null,
      summary: child.summary,
      details: child.summary,
      institution: child.institution_name,
      interests: child.interests ?? [],
      characteristics: child.characteristics ?? [],
      photoUrl: child.photo_url ?? null,
      status: 'disponible',
      tone: child.gender === 'Niña' ? 'Rosa' : 'Azul',
    };
  }

  private async refreshInstitutionProfiles(): Promise<void> {
    try {
      const children = await this.supabase.listInstitutionChildren();
      this.proposals = children.map((child) => this.toProposal(child));
      this.currentPage = Math.min(this.currentPage, Math.max(1, this.totalPages));
      this.loadError = '';
    } catch (error) {
      this.loadError = error instanceof Error ? error.message : 'No se pudieron actualizar los perfiles del catálogo.';
    } finally {
      this.changeDetector.markForCheck();
    }
  }

  private startFamilyCatalogRefresh(): void {
    if (this.familyCatalogRefreshTimer) clearInterval(this.familyCatalogRefreshTimer);
    this.familyCatalogRefreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.refreshFamilyCatalog();
    }, 15000);
  }

  private async refreshFamilyCatalog(): Promise<void> {
    try {
      const children = await this.supabase.listFamilyCatalogChildren();
      this.proposals = children.map((child) => this.toProposal(child));
      this.currentPage = Math.min(this.currentPage, Math.max(1, this.totalPages));
      if (this.selectedProposalId && !this.proposals.some((proposal) => proposal.id === this.selectedProposalId)) {
        this.selectedProposalId = null;
      }
      this.changeDetector.markForCheck();
    } catch { /* El catálogo actual se conserva si una actualización temporal falla. */ }
  }

  private matchesAge(age: number | null): boolean {
    if (this.ageFilter === 'todas') return true;
    if (age === null) return false;
    if (this.ageFilter === '16+') return age >= 16;
    const [minimum, maximum] = this.ageFilter.split('-').map(Number);
    return age >= minimum && age <= maximum;
  }

}
