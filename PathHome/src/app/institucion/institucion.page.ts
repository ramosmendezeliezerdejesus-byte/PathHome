import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  calendarOutline,
  documentTextOutline,
  folderOutline,
  homeOutline,
  logOutOutline,
  personOutline,
  pieChartOutline,
} from 'ionicons/icons';
import { SupabaseService } from '../core/supabase/supabase.service';

type InstitutionSection = 'inicio' | 'expedientes' | 'evaluaciones' | 'citas' | 'reportes' | 'perfil' | 'detalle' | 'nuevoexp' | 'nino' | 'estudio' | 'entrevista' | 'familia' | 'historial';

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
    { id: 'expedientes', label: 'Expedientes', icon: 'folder-outline' },
    { id: 'citas', label: 'Citas', icon: 'calendar-outline' },
    { id: 'reportes', label: 'Reportes', icon: 'pie-chart-outline' },
    { id: 'perfil', label: 'Perfil', icon: 'person-outline' },
  ];

  get activeNavigationSection(): InstitutionSection {
    return this.activeSection === 'expedientes' || this.activeSection === 'citas'
      || this.activeSection === 'reportes' || this.activeSection === 'perfil'
      ? this.activeSection
      : 'inicio';
  }

  constructor(private readonly supabase: SupabaseService, private readonly router: Router) {
    addIcons({ calendarOutline, documentTextOutline, folderOutline, homeOutline, logOutOutline, personOutline, pieChartOutline });
  }

  showSection(section: InstitutionSection): void {
    this.activeSection = section;
  }

  async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
