import { Injectable } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from './supabase.client';

export type PathHomeRole = 'familia' | 'profesional' | 'institucion' | 'admin';

export interface AdminVerificationRequest {
  id: string;
  user_id: string;
  account_type: 'profesional' | 'institucion';
  verification_code: string | null;
  document_path: string;
  status: 'pendiente' | 'aprobada' | 'rechazada';
  created_at: string;
  reviewed_at: string | null;
  email: string;
  full_name: string;
  national_id: string;
  phone: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  account_type: 'familia' | 'profesional' | 'institucion';
  created_at: string;
  is_admin: boolean;
  verification_status: 'pendiente' | 'aprobada' | 'rechazada' | null;
}

export interface FamilyDocument {
  id: string; family_id: string; name: string; document_type: string; storage_path: string; created_at: string;
}
export interface FamilyCase {
  family_id: string; full_name: string; email: string; status: 'pendiente' | 'aprobada' | 'rechazada'; approved_at: string | null; documents: FamilyDocument[];
}
export interface FamilyAppointment {
  id: string; family_id: string; psychologist_id: string; title: string; appointment_date: string; appointment_time: string; note: string | null; created_at: string;
  family_name?: string;
}
export interface FamilyNotification {
  id: string;
  family_id: string;
  related_family_id?: string | null;
  category: 'cita' | 'documento' | 'sistema';
  title: string;
  message: string;
  created_at: string;
  read_at: string | null;
}

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  get isConfigured(): boolean {
    return isSupabaseConfigured();
  }

  /** Use this from features that need Supabase; it explains setup errors clearly. */
  get client(): SupabaseClient {
    const client = getSupabaseClient();

    if (!client) {
      throw new Error(
        'Supabase no está configurado. Añade la URL y la clave publishable en src/environments/environment.ts.',
      );
    }

    return client;
  }

  async submitVerification(input: {
    userId: string;
    accountType: 'institucion' | 'profesional';
    verificationCode: string;
    file: File;
  }): Promise<void> {
    const safeFileName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const documentPath = `${input.userId}/${crypto.randomUUID()}-${safeFileName || 'documento'}`;
    const storage = this.client.storage.from('verification-documents');

    const { error: uploadError } = await storage.upload(documentPath, input.file, {
      contentType: input.file.type,
      upsert: false,
    });

    if (uploadError) throw uploadError;

    const { error: requestError } = await this.client.from('verification_requests').insert({
      user_id: input.userId,
      account_type: input.accountType,
      verification_code: input.verificationCode.trim() || null,
      document_path: documentPath,
      status: 'pendiente',
    });

    if (requestError) throw requestError;
  }

  async getDestinationForUser(userId: string): Promise<string> {
    const { data: profile, error } = await this.client
      .from('profiles')
      .select('account_type, is_admin')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!profile) return '/acceso-pendiente';
    if (profile.is_admin) return '/admin';
    if (profile.account_type === 'familia') return '/dashboard';

    const accountType = profile.account_type;
    if (accountType !== 'profesional' && accountType !== 'institucion') {
      return '/acceso-pendiente';
    }

    const { data: latestRequest, error: requestError } = await this.client
      .from('verification_requests')
      .select('status')
      .eq('user_id', userId)
      .eq('account_type', accountType)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (requestError) throw requestError;
    if (!latestRequest) return '/registro';
    if (latestRequest.status !== 'aprobada') return '/acceso-pendiente';

    return accountType === 'profesional' ? '/psychologist' : '/institucion';
  }

  async listAdminVerificationRequests(): Promise<AdminVerificationRequest[]> {
    const { data, error } = await this.client.rpc('admin_list_verification_requests');
    if (error) throw error;
    return (data ?? []) as AdminVerificationRequest[];
  }

  async listAdminUsers(): Promise<AdminUser[]> {
    const { data, error } = await this.client.rpc('admin_list_users');
    if (error) throw error;
    return (data ?? []) as AdminUser[];
  }

  async changeAdminUserRole(userId: string, accountType: AdminUser['account_type']): Promise<void> {
    const { error } = await this.client.rpc('admin_change_user_role', {
      target_user_id: userId,
      new_account_type: accountType,
    });
    if (error) throw error;
  }

  async reviewVerificationRequest(
    requestId: string,
    status: 'aprobada' | 'rechazada',
  ): Promise<void> {
    const { data: userData, error: userError } = await this.client.auth.getUser();
    if (userError) throw userError;
    if (!userData.user) throw new Error('Inicia sesión nuevamente para revisar la solicitud.');

    const { data, error } = await this.client
      .from('verification_requests')
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq('id', requestId)
      .eq('status', 'pendiente')
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('La solicitud ya fue revisada o no está disponible. Actualiza la lista.');
  }

  async getVerificationDocumentUrl(path: string): Promise<string> {
    const { data, error } = await this.client.storage
      .from('verification-documents')
      .createSignedUrl(path, 60);
    if (error) throw error;
    return data.signedUrl;
  }

  async getFamilyDocumentUrl(path: string): Promise<string> {
    const { data, error } = await this.client.storage.from('family-documents').createSignedUrl(path, 60);
    if (error) throw error;
    return data.signedUrl;
  }

  async updateMyFamilyProfile(input: { fullName: string; email: string }): Promise<{ email: string; emailChangePending: boolean }> {
    const { data: currentData, error: currentError } = await this.client.auth.getUser();
    if (currentError) throw currentError;
    const currentUser = currentData.user;
    if (!currentUser) throw new Error('Inicia sesión nuevamente para editar tu perfil.');

    const emailChanged = currentUser.email?.toLowerCase() !== input.email.trim().toLowerCase();
    const { data, error } = await this.client.auth.updateUser({
      ...(emailChanged ? { email: input.email.trim() } : {}),
      data: { ...currentUser.user_metadata, full_name: input.fullName.trim() },
    });
    if (error) throw error;

    const { error: profileError } = await this.client.from('profiles')
      .update({ full_name: input.fullName.trim() })
      .eq('id', currentUser.id);
    if (profileError) throw profileError;

    const savedEmail = emailChanged
      ? data.user?.email ?? currentUser.email ?? input.email.trim()
      : currentUser.email ?? input.email.trim();
    return {
      email: savedEmail,
      emailChangePending: emailChanged && savedEmail.toLowerCase() !== input.email.trim().toLowerCase(),
    };
  }

  async uploadMyFamilyProfilePhoto(file: File): Promise<{ path: string; signedUrl: string }> {
    const { data, error: userError } = await this.client.auth.getUser();
    if (userError) throw userError;
    const user = data.user;
    if (!user) throw new Error('Inicia sesión nuevamente para cambiar tu foto.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      throw new Error('La foto debe estar en formato JPG, PNG o WebP.');
    }
    if (file.size > 5 * 1024 * 1024) throw new Error('La foto no puede superar los 5 MB.');

    const path = `${user.id}/avatar`;
    const { error: uploadError } = await this.client.storage.from('profile-photos').upload(path, file, {
      contentType: file.type,
      upsert: true,
    });
    if (uploadError) throw uploadError;

    const { error: profileError } = await this.client.from('profiles')
      .update({ avatar_path: path })
      .eq('id', user.id);
    if (profileError) throw profileError;

    const { data: signed, error: signedError } = await this.client.storage.from('profile-photos').createSignedUrl(path, 60 * 60);
    if (signedError) throw signedError;
    return { path, signedUrl: signed.signedUrl };
  }

  async getMyFamilyProfilePhotoUrl(path: string): Promise<string> {
    const { data, error } = await this.client.storage.from('profile-photos').createSignedUrl(path, 60 * 60);
    if (error) throw error;
    return data.signedUrl;
  }

  async uploadFamilyDocument(file: File, documentType: string): Promise<void> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw new Error('Inicia sesión para subir documentos.');
    const path = `${auth.user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error: uploadError } = await this.client.storage.from('family-documents').upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    const { error } = await this.client.from('family_documents').insert({ family_id: auth.user.id, name: file.name, document_type: documentType, storage_path: path });
    if (error) {
      await this.client.storage.from('family-documents').remove([path]);
      throw error;
    }
  }

  async replaceFamilyDocument(documentId: string, file: File, documentType: string): Promise<void> {
    const { data: existing, error: readError } = await this.client.from('family_documents').select('storage_path').eq('id', documentId).single();
    if (readError) throw readError;
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw new Error('Inicia sesión para actualizar documentos.');
    const path = `${auth.user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const storage = this.client.storage.from('family-documents');
    const { error: uploadError } = await storage.upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    const { error } = await this.client.from('family_documents').update({ name: file.name, document_type: documentType, storage_path: path }).eq('id', documentId);
    if (error) {
      await storage.remove([path]);
      throw error;
    }
    const { error: cleanupError } = await storage.remove([existing.storage_path]);
    if (cleanupError) throw cleanupError;
  }

  async deleteFamilyDocument(documentId: string): Promise<void> {
    const { data: existing, error: readError } = await this.client.from('family_documents').select('storage_path').eq('id', documentId).single();
    if (readError) throw readError;
    const { error } = await this.client.from('family_documents').delete().eq('id', documentId);
    if (error) throw error;
    const { error: storageError } = await this.client.storage.from('family-documents').remove([existing.storage_path]);
    if (storageError) throw storageError;
  }

  async listMyFamilyDocuments(): Promise<FamilyDocument[]> {
    const { data, error } = await this.client.from('family_documents').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as FamilyDocument[];
  }

  async getMyFamilyApprovalStatus(): Promise<FamilyCase['status'] | null> {
    const { data, error } = await this.client.from('family_cases').select('status').maybeSingle();
    if (error) throw error;
    return (data?.status as FamilyCase['status'] | undefined) ?? null;
  }

  async listMyFamilyAppointments(): Promise<FamilyAppointment[]> {
    const { data, error } = await this.client.from('family_appointments').select('*').order('appointment_date');
    if (error) throw error;
    return (data ?? []) as FamilyAppointment[];
  }

  async listMyFamilyNotifications(): Promise<FamilyNotification[]> {
    const { data, error } = await this.client.from('family_notifications').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as FamilyNotification[];
  }

  async markFamilyNotificationRead(notificationId: string): Promise<void> {
    const { error } = await this.client.from('family_notifications').update({ read_at: new Date().toISOString() }).eq('id', notificationId).is('read_at', null);
    if (error) throw error;
  }

  async markAllMyFamilyNotificationsRead(): Promise<void> {
    const { data: sessionData, error: sessionError } = await this.client.auth.getSession();
    if (sessionError) throw sessionError;
    const familyId = sessionData.session?.user.id;
    if (!familyId) throw new Error('Inicia sesión nuevamente para actualizar las notificaciones.');
    const { error } = await this.client.from('family_notifications').update({ read_at: new Date().toISOString() }).eq('family_id', familyId).is('read_at', null);
    if (error) throw error;
  }

  async listAdminFamilyCases(): Promise<FamilyCase[]> {
    const { data, error } = await this.client.rpc('admin_list_family_cases');
    if (error) throw error;
    return ((data ?? []) as FamilyCase[]).filter((family) => family.documents?.length > 0);
  }

  async setFamilyApproval(familyId: string, status: 'aprobada' | 'rechazada'): Promise<void> {
    const { error } = await this.client.from('family_cases').upsert({ family_id: familyId, status, reviewed_at: new Date().toISOString() });
    if (error) throw error;
  }

  async removeFamilyApproval(familyId: string): Promise<void> {
    const { error } = await this.client.from('family_cases').delete().eq('family_id', familyId);
    if (error) throw error;
  }

  async listApprovedFamilies(): Promise<FamilyCase[]> {
    const { data, error } = await this.client.rpc('psychologist_list_approved_families');
    if (error) throw error;
    return ((data ?? []) as FamilyCase[]).filter((family) => family.documents?.length > 0);
  }

  async scheduleFamilyAppointment(input: { familyId: string; title: string; date: string; time: string; note: string }): Promise<void> {
    const { error } = await this.client.from('family_appointments').insert({ family_id: input.familyId, title: input.title, appointment_date: input.date, appointment_time: input.time, note: input.note || null });
    if (error) throw error;
  }

  async listPsychologistFamilyAppointments(): Promise<FamilyAppointment[]> {
    const { data, error } = await this.client.rpc('psychologist_list_family_appointments');
    if (error) throw error;
    return (data ?? []) as FamilyAppointment[];
  }

  async updateFamilyAppointment(id: string, input: { familyId: string; date: string; time: string; note: string }): Promise<void> {
    const { error } = await this.client.from('family_appointments')
      .update({ family_id: input.familyId, appointment_date: input.date, appointment_time: input.time, note: input.note || null })
      .eq('id', id);
    if (error) throw error;
  }

  async deleteFamilyAppointment(id: string): Promise<void> {
    const { error } = await this.client.from('family_appointments').delete().eq('id', id);
    if (error) throw error;
  }
}
