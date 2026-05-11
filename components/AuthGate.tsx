'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';

// Secondary auth guard for client-side navigation (e.g. tab switching — cookie is
// present but sessionStorage token is missing in the new tab). Middleware handles
// the primary server-side redirect via rp_auth_flag cookie.
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (hydrated && !isAuthenticated) {
      // Clear the auth cookie so the next full-page load also redirects via middleware
      document.cookie = 'rp_auth_flag=; path=/; max-age=0; SameSite=lax';
      router.replace('/login');
    }
  }, [hydrated, isAuthenticated, router]);

  if (!hydrated || !isAuthenticated) return null;
  return <>{children}</>;
}
