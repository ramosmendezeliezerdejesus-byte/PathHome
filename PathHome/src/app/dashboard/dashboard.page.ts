import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { SupabaseService } from '../core/supabase/supabase.service';

type DashboardSection = 'inicio' | 'proceso' | 'notificaciones' | 'perfil';
type NotificationFilter = 'Todas' | 'Citas' | 'Documentos' | 'Sistema';

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
  imports: [IonContent],
})
export class DashboardPage {
  activeSection: DashboardSection = 'inicio';
  activeFilter: NotificationFilter = 'Todas';
  assistantOpen = false;
  notificationsEnabled = true;
  profileName = '';
  profileEmail = '';
  profileRole = 'Familia solicitante';
  readonly filters: NotificationFilter[] = ['Todas', 'Citas', 'Documentos', 'Sistema'];

  readonly stages = [
    { name: 'Documentación', status: 'Completado · 15 abr 2025', icon: '✓', current: false, complete: true },
    { name: 'Entrevista inicial', status: 'Completado · 22 abr 2025', icon: '✓', current: false, complete: true },
    { name: 'Evaluación psicológica', status: 'En curso · 10 may 2025', icon: '👤', current: true, complete: false },
    { name: 'Estudio social', status: 'Pendiente', icon: '▤', current: false, complete: false },
    { name: 'Autorización institucional', status: 'Pendiente', icon: '▤', current: false, complete: false },
    { name: 'Seguimiento', status: 'Pendiente', icon: '▤', current: false, complete: false },
  ];

  readonly notifications: DashboardNotification[] = [
    {
      category: 'Citas',
      icon: '🗓️',
      tone: 'appointment',
      title: 'Nueva cita agendada',
      description: 'Evaluación psicológica · 10 de mayo de 2025 · 10:00 a. m.',
      date: 'Hace 2 h',
      unread: true,
    },
    {
      category: 'Documentos',
      icon: '📄',
      tone: 'document',
      title: 'Documento pendiente',
      description: 'Informe médico. Por favor, sube tu documento.',
      date: 'Hace 5 h',
      unread: false,
    },
    {
      category: 'Sistema',
      icon: 'ℹ️',
      tone: 'system',
      title: 'Avance en tu proceso',
      description: 'Has completado la etapa de entrevista inicial.',
      date: 'Hace 1 día',
      unread: false,
    },
    {
      category: 'Sistema',
      icon: 'ℹ️',
      tone: 'system',
      title: 'Información importante',
      description: 'Recuerda mantener tus datos actualizados.',
      date: 'Hace 2 días',
      unread: false,
    },
    {
      category: 'Citas',
      icon: '🗓️',
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
  ) {
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

  showSection(section: DashboardSection): void {
    this.activeSection = section;
    this.assistantOpen = false;
  }

  openQuickLink(destination: 'documentos' | 'citas' | 'notificaciones' | 'mas'): void {
    if (destination === 'documentos' || destination === 'citas') {
      this.showSection('proceso');
      return;
    }
    this.showSection(destination === 'notificaciones' ? 'notificaciones' : 'perfil');
  }

  toggleAssistant(): void {
    this.assistantOpen = !this.assistantOpen;
  }

  async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
