import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline, bookOutline, calendarOutline, chevronBackOutline, chevronDownOutline,
  chevronForwardOutline, chevronUpOutline, closeOutline, heartOutline, informationCircleOutline,
  locationOutline, lockClosedOutline, peopleOutline, personOutline, searchOutline,
  shieldCheckmarkOutline, sparklesOutline,
} from 'ionicons/icons';
import { FamilyNavigationComponent } from '../shared/family-navigation/family-navigation.component';
import type { FamilyDashboardSection } from '../shared/family-navigation/family-navigation.component';

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
  photoUrl: string | null;
  status: ProposalStatus;
  isDemo: boolean;
  tone: string;
}

@Component({
  selector: 'app-catalogo',
  standalone: true,
  imports: [IonContent, IonIcon, FamilyNavigationComponent],
  templateUrl: './catalogo.page.html',
  styleUrl: './catalogo.page.scss',
})
export class CatalogPage {
  /** Solo contendrá propuestas recibidas con autorización familiar válida. */
  proposals: CatalogProposal[] = [];
  readonly demoProposals: CatalogProposal[] = [
    this.createDemoProposal('demo-01', 'Ejemplo visual 01', 'niño', 4, 'Azul', 'Muestra ficticia para revisar la presentación del catálogo.'),
    this.createDemoProposal('demo-02', 'Ejemplo visual 02', 'niña', 6, 'Rosa', 'Contenido de prueba sin nombres, fotografías ni datos reales.'),
    this.createDemoProposal('demo-03', 'Ejemplo visual 03', 'niño', 8, 'Verde', 'Tarjeta demostrativa; no representa una propuesta autorizada.'),
    this.createDemoProposal('demo-04', 'Ejemplo visual 04', 'niña', 10, 'Lila', 'Datos ficticios destinados únicamente a comprobar filtros.'),
    this.createDemoProposal('demo-05', 'Ejemplo visual 05', 'niño', 12, 'Azul', 'Información de ejemplo sin perfil de un menor.'),
    this.createDemoProposal('demo-06', 'Ejemplo visual 06', 'niña', 15, 'Rosa', 'Contenido demostrativo. No se envía ni se guarda información.'),
  ];

  mobileMenuOpen = false;
  showDemoProposals = true;
  isLoading = false;
  loadError = '';
  searchText = '';
  genderFilter: GenderFilter = 'todas';
  ageFilter: AgeFilter = 'todas';
  expandedProposalId: string | null = null;
  currentPage = 1;
  readonly pageSize = 3;
  readonly genderOptions: { value: GenderFilter; label: string }[] = [
    { value: 'todas', label: 'Todas' },
    { value: 'niño', label: 'Niño' },
    { value: 'niña', label: 'Niña' },
  ];

  constructor(private readonly router: Router) {
    addIcons({
      alertCircleOutline, bookOutline, calendarOutline, chevronBackOutline, chevronDownOutline,
      chevronForwardOutline, chevronUpOutline, closeOutline, heartOutline, informationCircleOutline,
      locationOutline, lockClosedOutline, peopleOutline, personOutline, searchOutline,
      shieldCheckmarkOutline, sparklesOutline,
    });
  }

  get filteredProposals(): CatalogProposal[] {
    const source = this.demoModeActive ? this.demoProposals : this.proposals;
    const query = this.searchText.trim().toLocaleLowerCase('es');
    return source.filter((proposal) => {
      const matchesGender = this.genderFilter === 'todas' || proposal.gender === this.genderFilter;
      const matchesQuery = !query || [proposal.title, proposal.gender, proposal.age?.toString(), proposal.age === null ? null : `${proposal.age} años`, proposal.location, proposal.summary, proposal.details]
        .some((value) => value?.toLocaleLowerCase('es').includes(query));
      return matchesGender && matchesQuery && this.matchesAge(proposal.age);
    });
  }

  get visibleProposals(): CatalogProposal[] { return this.filteredProposals; }
  get demoModeActive(): boolean { return this.showDemoProposals && this.proposals.length === 0; }
  get paginatedProposals(): CatalogProposal[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredProposals.slice(start, start + this.pageSize);
  }
  get totalPages(): number { return Math.ceil(this.filteredProposals.length / this.pageSize); }
  get pageNumbers(): number[] { return Array.from({ length: this.totalPages }, (_, index) => index + 1); }

  navigateToDashboardSection(section: FamilyDashboardSection): void {
    void this.router.navigateByUrl('/dashboard', { state: { familyDashboardSection: section } });
  }

  toggleMobileMenu(): void { this.mobileMenuOpen = !this.mobileMenuOpen; }
  requestSignOut(): void {
    void this.router.navigateByUrl('/dashboard', { state: { familyDashboardAction: 'confirm-sign-out' } });
  }

  toggleDemoProposals(): void {
    this.showDemoProposals = !this.showDemoProposals;
    this.resetFilters();
  }

  setSearch(event: Event): void {
    this.searchText = (event.target as HTMLInputElement).value;
    this.currentPage = 1;
    this.expandedProposalId = null;
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
    this.expandedProposalId = null;
  }
  setPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.expandedProposalId = null;
  }
  previousPage(): void { this.setPage(this.currentPage - 1); }
  nextPage(): void { this.setPage(this.currentPage + 1); }
  toggleProposalDetails(proposalId: string): void {
    this.expandedProposalId = this.expandedProposalId === proposalId ? null : proposalId;
  }
  statusLabel(status: ProposalStatus): string {
    const labels: Record<ProposalStatus, string> = {
      disponible: 'Disponible', pendiente: 'Pendiente', aceptada: 'Aceptada', rechazada: 'Rechazada',
    };
    return labels[status];
  }

  private matchesAge(age: number | null): boolean {
    if (this.ageFilter === 'todas') return true;
    if (age === null) return false;
    if (this.ageFilter === '16+') return age >= 16;
    const [minimum, maximum] = this.ageFilter.split('-').map(Number);
    return age >= minimum && age <= maximum;
  }

  private createDemoProposal(id: string, title: string, gender: ProposalGender, age: number, tone: string, summary: string): CatalogProposal {
    return {
      id, title, gender, age, location: null, summary,
      details: 'Registro de muestra sin información personal. Este contenido ficticio no corresponde a un menor ni a una propuesta real.',
      photoUrl: null, status: 'disponible', isDemo: true, tone,
    };
  }
}
