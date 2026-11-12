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
}
