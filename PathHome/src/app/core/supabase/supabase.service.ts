import { Injectable } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from './supabase.client';

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
}
