
import type { Routes } from '@angular/router';
import { roleGuard } from './core/auth/role.guard';

export const routes: Routes = [
  {
    path: 'landing',
    loadComponent: () => import('./landing/landing.page').then((m) => m.LandingPage),
  },
  {
    path: 'login',
    loadComponent: () => import('./login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'dashboard',
    canActivate: [roleGuard],
    data: { requiredDestination: '/dashboard' },
    loadComponent: () => import('./dashboard/dashboard.page').then((m) => m.DashboardPage),
  },
  {
    path: 'psychologist',
    canActivate: [roleGuard],
    data: { requiredDestination: '/psychologist' },
    loadComponent: () => import('./psychologist/psychologist.page').then((m) => m.PsychologistPage),
  },
  {
    path: 'institucion',
    canActivate: [roleGuard],
    data: { requiredDestination: '/institucion' },
    loadComponent: () => import('./institucion/institucion.page').then((m) => m.InstitutionPage),
  },
  {
    path: 'admin',
    canActivate: [roleGuard],
    data: { requiredDestination: '/admin' },
    loadComponent: () => import('./admin/admin.page').then((m) => m.AdminPage),
  },
  {
    path: 'acceso-pendiente',
    canActivate: [roleGuard],
    data: { requiredDestination: '/acceso-pendiente' },
    loadComponent: () => import('./registro/acceso-pendiente.page').then((m) => m.AccessPendingPage),
  },
  {
    path: 'registro',
    loadComponent: () => import('./registro/registro.page').then((m) => m.RegistroPage),
  },
  {
    path: '',
    redirectTo: 'landing',
    pathMatch: 'full',
  },
];
