import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  chatbubbleEllipsesOutline,
  documentTextOutline,
  gridOutline,
  homeOutline,
  logOutOutline,
  notificationsOutline,
  personOutline,
} from 'ionicons/icons';

export type FamilyDashboardSection =
  | 'inicio' | 'proceso' | 'documentos' | 'citas' | 'notificaciones' | 'perfil' | 'mas'
  | 'asistente' | 'mensajes' | 'hogar' | 'solicitud' | 'menor' | 'seguimiento' | 'datos'
  | 'seguridad' | 'preferencias' | 'ayuda' | 'informacion' | 'terminos';

export type FamilyPrimarySection = 'inicio' | 'proceso' | 'notificaciones' | 'perfil';

@Component({
  selector: 'app-family-navigation',
  standalone: true,
  imports: [IonIcon],
  templateUrl: './family-navigation.component.html',
  styleUrl: './family-navigation.component.scss',
})
export class FamilyNavigationComponent {
  @Input() activeSection: FamilyDashboardSection = 'inicio';
  @Input() primarySection: FamilyPrimarySection = 'inicio';
  @Input() unreadCount = 0;
  @Input() mobileMenuOpen = false;
  @Input() showBottomNav = true;

  @Output() sectionSelected = new EventEmitter<FamilyDashboardSection>();
  @Output() menuToggleRequested = new EventEmitter<void>();
  @Output() logoutRequested = new EventEmitter<void>();

  constructor() {
    addIcons({
      chatbubbleEllipsesOutline,
      documentTextOutline,
      gridOutline,
      homeOutline,
      logOutOutline,
      notificationsOutline,
      personOutline,
    });
  }

  selectSection(section: FamilyDashboardSection): void {
    this.sectionSelected.emit(section);
  }
}
