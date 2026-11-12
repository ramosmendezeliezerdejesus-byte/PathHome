import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { SupabaseService } from '../supabase/supabase.service';

export const roleGuard: CanActivateFn = async (route) => {
  const router = inject(Router);
  const supabase = inject(SupabaseService);

  if (!supabase.isConfigured) {
    await router.navigateByUrl('/login', { replaceUrl: true });
    return false;
  }

  try {
    const { data, error } = await supabase.client.auth.getUser();
    if (error || !data.user) {
      await router.navigateByUrl('/login', { replaceUrl: true });
      return false;
    }

    const destination = await supabase.getDestinationForUser(data.user.id);
    const requiredDestination = String(route.data['requiredDestination'] ?? '');
    if (destination === requiredDestination) return true;

    await router.navigateByUrl(destination, { replaceUrl: true });
    return false;
  } catch {
    await router.navigateByUrl('/login', { replaceUrl: true });
    return false;
  }
};
