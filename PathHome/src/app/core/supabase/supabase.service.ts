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
export interface PsychologistFamilyCase extends Omit<FamilyCase, 'status'> {
  status: FamilyCase['status'] | 'finalizado';
  psychologist_id?: string | null; assigned_to_me?: boolean; available_for_claim?: boolean;
}
export interface FamilyAppointment {
  id: string; family_id: string; psychologist_id: string | null; title: string; appointment_date: string; appointment_time: string; appointment_location: string | null; note: string | null; created_at: string;
  child_interest_case_id?: string | null; appointment_type?: string;
  family_name?: string;
  attended_at?: string | null;
}
export interface FamilyPsychReport {
  id: string; appointment_id: string; family_id: string; psychologist_id: string; family_name: string;
  appointment_date: string; appointment_time: string; observations: string; strengths: string; concerns: string;
  recommendation: string; status: 'pendiente' | 'aceptada' | 'rechazada'; decision_reason: string | null;
  decided_at: string | null; created_at: string;
}
export interface FamilyOutcome {
  status: 'pendiente' | 'aceptada' | 'rechazada'; reason: string | null; decided_at: string | null;
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

export interface InstitutionNotification {
  id: string;
  institution_id: string;
  related_family_id: string | null;
  category: 'documento' | 'informe' | 'sistema';
  title: string;
  message: string;
  created_at: string;
  read_at: string | null;
}

export interface InstitutionChildProfile {
  id: string;
  institution_id: string;
  name: string;
  age: number;
  gender: 'Niño' | 'Niña';
  institution_name: string;
  summary: string | null;
  characteristics: string[];
  interests: string[];
  photo_path: string | null;
  photo_url?: string | null;
  created_at: string;
}

export interface FamilyCatalogChild {
  id: string;
  name: string;
  age: number;
  gender: 'Niño' | 'Niña';
  institution_name: string;
  summary: string | null;
  characteristics: string[];
  interests: string[];
  photo_path: string | null;
  photo_url: string | null;
}

export interface ChildInterestCase {
  id: string; child_id: string | null; child_name: string; child_age: number | null; family_id: string | null; family_name: string;
  institution_id: string | null; psychologist_id: string | null; status: string; institution_decision: string | null;
  institution_observations: string | null; created_at: string; appointment_id: string | null;
  appointment_type: string | null; appointment_date: string | null; appointment_time: string | null;
  appointment_note: string | null; appointment_location: string | null; attended_at: string | null; report_id: string | null;
  report_type: string | null; report_status: string | null; report_observations: string | null;
  report_strengths: string | null; report_concerns: string | null; report_recommendation: string | null; report_reason: string | null;
  family_home_address?: string | null;
}

type InstitutionChildInput = Omit<InstitutionChildProfile, 'id' | 'institution_id' | 'created_at' | 'photo_path' | 'photo_url'>;

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

  async createInstitutionChild(input: InstitutionChildInput, photo?: File): Promise<void> {
    const { data, error: authError } = await this.client.auth.getUser();
    if (authError) throw authError;
    if (!data.user) throw new Error('Inicia sesión nuevamente para registrar el perfil.');
    const id = crypto.randomUUID();
    const photoPath = photo ? await this.uploadInstitutionChildPhoto(data.user.id, id, photo) : null;
    const { error } = await this.client.from('institution_children').insert({ ...input, id, institution_id: data.user.id, photo_path: photoPath });
    if (error) {
      if (photoPath) await this.client.storage.from('institution-child-photos').remove([photoPath]);
      throw error;
    }
  }

  async listInstitutionChildren(): Promise<InstitutionChildProfile[]> {
    const { data, error } = await this.client.from('institution_children').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    const profiles = (data ?? []) as InstitutionChildProfile[];
    return Promise.all(profiles.map(async (profile) => {
      if (!profile.photo_path) return { ...profile, photo_url: null };
      const { data: signed, error: photoError } = await this.client.storage.from('institution-child-photos').createSignedUrl(profile.photo_path, 3600);
      if (photoError) throw photoError;
      return { ...profile, photo_url: signed.signedUrl };
    }));
  }

  async listFamilyCatalogChildren(): Promise<FamilyCatalogChild[]> {
    const { data, error } = await this.client.rpc('family_list_catalog_children');
    if (error?.code === 'PGRST202' || error?.code === '42883') {
      throw new Error('Falta actualizar el catálogo en Supabase. Ejecuta la migración institution_children.sql.');
    }
    if (error) throw error;
    const children = (data ?? []) as FamilyCatalogChild[];
    return Promise.all(children.map(async (child) => {
      if (!child.photo_path) return { ...child, photo_url: null };
      const { data: signed, error: photoError } = await this.client.storage.from('institution-child-photos').createSignedUrl(child.photo_path, 3600);
      if (photoError) throw photoError;
      return { ...child, photo_url: signed.signedUrl };
    }));
  }

  async expressChildInterest(childId: string): Promise<string> {
    const { data, error } = await this.client.rpc('family_express_child_interest', { target_child_id: childId });
    if (error) throw error;
    return data as string;
  }

  async listChildInterestCases(): Promise<ChildInterestCase[]> {
    const { data, error } = await this.client.rpc('child_case_list');
    if (error) throw error;
    return (data ?? []) as ChildInterestCase[];
  }

  async claimChildInterestCase(caseId: string): Promise<void> {
    const { error } = await this.client.rpc('psychologist_claim_child_case', { target_case_id: caseId });
    if (error) throw error;
  }

  async scheduleChildCaseAppointment(input: { caseId: string; type: 'visita_inicial' | 'visita_hogar' | 'entrega'; date: string; time: string; location: string; note: string }): Promise<void> {
    const { error } = await this.client.rpc('child_case_schedule_appointment', {
      target_case_id: input.caseId, appointment_kind: input.type, target_date: input.date, target_time: input.time, appointment_note: input.note || null, target_location: input.location.trim(),
    });
    if (error) throw error;
  }

  async confirmChildCaseAppointment(appointmentId: string): Promise<void> {
    const { error } = await this.client.rpc('child_case_confirm_appointment', { target_appointment_id: appointmentId });
    if (error) throw error;
  }

  async updateInitialVisitAppointment(input: { caseId: string; date: string; time: string; location: string; note: string }): Promise<void> {
    const { error } = await this.client.rpc('institution_update_initial_visit', {
      target_case_id: input.caseId, target_date: input.date, target_time: input.time, target_note: input.note || null, target_location: input.location.trim(),
    });
    if (error) throw error;
  }

  async deleteInitialVisitAppointment(caseId: string): Promise<void> {
    const { error } = await this.client.rpc('institution_delete_initial_visit', { target_case_id: caseId });
    if (error) throw error;
  }

  async submitChildCaseReport(input: { caseId: string; observations: string; strengths: string; concerns: string; recommendation: string }): Promise<void> {
    const { error } = await this.client.rpc('child_case_submit_report', {
      target_case_id: input.caseId, observations: input.observations, strengths: input.strengths,
      concerns: input.concerns, recommendation: input.recommendation,
    });
    if (error) throw error;
  }

  async decideInstitutionVisitReport(reportId: string, approve: boolean, reason: string): Promise<void> {
    const { error } = await this.client.rpc('psychologist_decide_institution_visit_report', { target_report_id: reportId, approve, decision_note: reason || null });
    if (error) throw error;
  }

  async decideHomeEvaluation(caseId: string, favorable: boolean, reason: string): Promise<void> {
    const { error } = await this.client.rpc('institution_decide_home_evaluation', { target_case_id: caseId, favorable, decision_note: reason || null });
    if (error) throw error;
  }

  async closeChildInterestCase(caseId: string): Promise<void> {
    const { error } = await this.client.rpc('psychologist_close_child_case', { target_case_id: caseId });
    if (error) throw error;
  }

  async updateInstitutionChild(id: string, input: InstitutionChildInput, photo?: File): Promise<void> {
    const { data: current, error: readError } = await this.client.from('institution_children').select('institution_id, photo_path').eq('id', id).single();
    if (readError) throw readError;
    const newPhotoPath = photo ? await this.uploadInstitutionChildPhoto(current.institution_id, crypto.randomUUID(), photo) : null;
    const updates = newPhotoPath ? { ...input, photo_path: newPhotoPath } : input;
    const { error } = await this.client.from('institution_children').update(updates).eq('id', id);
    if (error) {
      if (newPhotoPath) await this.client.storage.from('institution-child-photos').remove([newPhotoPath]);
      throw error;
    }
    if (newPhotoPath && current.photo_path) {
      const { error: cleanupError } = await this.client.storage.from('institution-child-photos').remove([current.photo_path]);
      if (cleanupError) throw cleanupError;
    }
  }

  async deleteInstitutionChild(id: string): Promise<void> {
    const { data: current, error: readError } = await this.client.from('institution_children').select('photo_path').eq('id', id).single();
    if (readError) throw readError;
    const { error } = await this.client.from('institution_children').delete().eq('id', id);
    if (error) throw error;
    if (current.photo_path) {
      const { error: photoError } = await this.client.storage.from('institution-child-photos').remove([current.photo_path]);
      if (photoError) throw photoError;
    }
  }

  private async uploadInstitutionChildPhoto(institutionId: string, fileId: string, file: File): Promise<string> {
    const extension = file.type === 'image/png' ? 'png' : 'jpg';
    const path = `${institutionId}/${fileId}.${extension}`;
    const { error } = await this.client.storage.from('institution-child-photos').upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return path;
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

  async getMyFamilyHomeAddress(): Promise<string | null> {
    const { data: auth, error: authError } = await this.client.auth.getSession();
    if (authError) throw authError;
    const userId = auth.session?.user.id;
    if (!userId) throw new Error('Inicia sesión nuevamente para consultar la dirección del hogar.');
    const { data, error } = await this.withHomeAddressTimeout(this.client.from('profiles').select('home_address').eq('id', userId).maybeSingle());
    if (error) throw error;
    return typeof data?.home_address === 'string' ? data.home_address : null;
  }

  async updateMyFamilyHomeAddress(address: string): Promise<void> {
    const { data: auth, error: authError } = await this.client.auth.getSession();
    if (authError) throw authError;
    const userId = auth.session?.user.id;
    if (!userId) throw new Error('Inicia sesión nuevamente para guardar la dirección del hogar.');
    const { error } = await this.withHomeAddressTimeout(this.client.from('profiles').update({ home_address: address.trim() }).eq('id', userId));
    if (error) throw error;
  }

  private async withHomeAddressTimeout<T>(request: PromiseLike<T>): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve(request),
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('La solicitud está tardando demasiado. Revisa tu conexión e intenta guardar de nuevo.')), 15000);
        }),
      ]);
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }

  async getFamilyHomeAddressForPsychologist(caseId: string): Promise<string | null> {
    const { data, error } = await this.client.rpc('psychologist_get_child_case_home_address', { target_case_id: caseId });
    if (error) throw error;
    return typeof data === 'string' ? data : null;
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

  async getMyFamilyOutcome(): Promise<FamilyOutcome | null> {
    const { data, error } = await this.client.rpc('family_latest_report_outcome');
    const missingLegacyRpc = error?.code === 'PGRST202' || error?.code === '42883';
    if (error && !missingLegacyRpc) throw error;
    if (missingLegacyRpc) return null;
    const currentOutcome = data?.[0] as FamilyOutcome | undefined;
    if (!currentOutcome) return null;
    if (currentOutcome.status === 'aceptada' && await this.getMyFamilyApprovalStatus() !== 'aprobada') return null;
    return currentOutcome;
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

  async listInstitutionNotifications(): Promise<InstitutionNotification[]> {
    const { data, error } = await this.client.from('institution_notifications').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as InstitutionNotification[];
  }

  async markInstitutionNotificationRead(notificationId: string): Promise<void> {
    const { error } = await this.client.from('institution_notifications').update({ read_at: new Date().toISOString() }).eq('id', notificationId).is('read_at', null);
    if (error) throw error;
  }

  async markAllInstitutionNotificationsRead(): Promise<void> {
    const { data: sessionData, error: sessionError } = await this.client.auth.getSession();
    if (sessionError) throw sessionError;
    const institutionId = sessionData.session?.user.id;
    if (!institutionId) throw new Error('Inicia sesión nuevamente para actualizar las notificaciones.');
    const { error } = await this.client.from('institution_notifications').update({ read_at: new Date().toISOString() }).eq('institution_id', institutionId).is('read_at', null);
    if (error) throw error;
  }

  async listAdminFamilyCases(): Promise<FamilyCase[]> {
    const { data, error } = await this.client.rpc('admin_list_family_cases');
    if (error) throw error;
    return ((data ?? []) as FamilyCase[]).filter((family) => family.documents?.length > 0);
  }

  async listInstitutionFamilyCases(): Promise<FamilyCase[]> {
    const { data, error } = await this.client.rpc('institution_list_family_cases');
    if (error) throw error;
    return ((data ?? []) as FamilyCase[]).filter((family) => family.documents?.length > 0);
  }

  async listInstitutionPsychReports(): Promise<FamilyPsychReport[]> {
    const { data, error } = await this.client.rpc('institution_list_psych_reports');
    if (error) throw error;
    return (data ?? []) as FamilyPsychReport[];
  }

  async decidePsychReport(reportId: string, status: 'aceptada' | 'rechazada', reason: string): Promise<void> {
    const { error } = await this.client.rpc('institution_decide_psych_report', {
      target_report_id: reportId,
      new_status: status,
      decision_note: reason.trim() || null,
    });
    if (error) throw error;
  }

  async reviewInstitutionFamily(familyId: string, status: 'aprobada' | 'rechazada'): Promise<void> {
    const { error } = await this.client.rpc('institution_review_family_case', {
      target_family_id: familyId,
      new_status: status,
    });
    if (error) throw error;
  }

  async setFamilyApproval(familyId: string, status: 'aprobada' | 'rechazada'): Promise<void> {
    const { error } = await this.client.from('family_cases').upsert({ family_id: familyId, status, reviewed_at: new Date().toISOString() });
    if (error) throw error;
  }

  async removeFamilyApproval(familyId: string): Promise<void> {
    const { error } = await this.client.from('family_cases').delete().eq('family_id', familyId);
    if (error) throw error;
  }

  async listApprovedFamilies(): Promise<PsychologistFamilyCase[]> {
    const { data, error } = await this.client.rpc('psychologist_list_approved_families');
    if (error) throw error;
    return (data ?? []) as PsychologistFamilyCase[];
  }

  async claimApprovedFamilyCase(familyId: string): Promise<void> {
    const { error } = await this.client.rpc('psychologist_claim_family_case', { target_family_id: familyId });
    if (error) throw error;
  }

  async scheduleFamilyAppointment(input: { familyId: string; title: string; date: string; time: string; location: string; note: string }): Promise<void> {
    const { error } = await this.client.from('family_appointments').insert({ family_id: input.familyId, title: input.title, appointment_date: input.date, appointment_time: input.time, appointment_location: input.location.trim(), note: input.note || null });
    if (error) throw error;
  }

  async listPsychologistFamilyAppointments(): Promise<FamilyAppointment[]> {
    const { data, error } = await this.client.rpc('psychologist_list_family_appointments');
    if (error) throw error;
    return (data ?? []) as FamilyAppointment[];
  }

  async markFamilyAppointmentAttended(appointmentId: string): Promise<void> {
    const { error } = await this.client.rpc('psychologist_confirm_family_attendance', { target_appointment_id: appointmentId });
    if (error) throw error;
  }

  async saveFamilyPsychReport(input: { appointmentId: string; observations: string; strengths: string; concerns: string; recommendation: string }): Promise<void> {
    const { error } = await this.client.rpc('psychologist_submit_family_report', {
      target_appointment_id: input.appointmentId,
      report_observations: input.observations.trim(),
      report_strengths: input.strengths.trim(),
      report_concerns: input.concerns.trim(),
      report_recommendation: input.recommendation.trim(),
    });
    if (error) throw error;
  }

  async updatePsychologistFamilyReport(reportId: string, input: { observations: string; strengths: string; concerns: string; recommendation: string }): Promise<void> {
    const { error } = await this.client.rpc('psychologist_update_family_report', {
      target_report_id: reportId,
      report_observations: input.observations.trim(),
      report_strengths: input.strengths.trim(),
      report_concerns: input.concerns.trim(),
      report_recommendation: input.recommendation.trim(),
    });
    if (error) throw error;
  }

  async deletePsychologistFamilyReport(reportId: string): Promise<void> {
    const { error } = await this.client.rpc('psychologist_delete_family_report', { target_report_id: reportId });
    if (error) throw error;
  }

  async listPsychologistReports(): Promise<FamilyPsychReport[]> {
    const { data, error } = await this.client.rpc('psychologist_list_family_reports');
    if (error) throw error;
    return (data ?? []) as FamilyPsychReport[];
  }

  async updateFamilyAppointment(id: string, input: { familyId: string; date: string; time: string; location: string; note: string }): Promise<void> {
    const { error } = await this.client.from('family_appointments')
      .update({ family_id: input.familyId, appointment_date: input.date, appointment_time: input.time, appointment_location: input.location.trim(), note: input.note || null })
      .eq('id', id);
    if (error) throw error;
  }

  async deleteFamilyAppointment(id: string): Promise<void> {
    const { error } = await this.client.from('family_appointments').delete().eq('id', id);
    if (error) throw error;
  }
}
