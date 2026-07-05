/**
 * frontend/app/auth/callback/page.tsx
 * --------------------------------------
 * Post-OAuth redirect landing page.
 *
 * After the backend sets the JWT cookie and redirects to /dashboard,
 * this page is NOT in the redirect path. However, if there's an error
 * during OAuth (backend redirects to /?error=...), this page handles
 * the loading state gracefully.
 *
 * This component handles the case where users land here directly after
 * OAuth — it shows a loading spinner and then redirects to /dashboard.
 * The AuthContext will re-check auth state automatically on mount.
 */

'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Suspense } from 'react';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading } = useAuth();

  const error = searchParams.get('error');

  useEffect(() => {
    if (isLoading) return;

    if (error) {
      // Redirect to home with the error message
      router.replace(`/?error=${error}`);
      return;
    }

    if (user) {
      router.replace('/dashboard');
    } else {
      // No user and no error — something unexpected happened
      router.replace('/?error=unknown');
    }
  }, [user, isLoading, error, router]);

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
      <div className="glass-card p-10 text-center max-w-sm w-full mx-4">
        {error ? (
          <>
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-white font-semibold mb-2">Authentication Failed</h2>
            <p className="text-[var(--color-text-secondary)] text-sm mb-6">
              {error === 'oauth_denied'
                ? 'You cancelled the GitHub authorization.'
                : 'An error occurred during authentication. Please try again.'}
            </p>
            <a
              href="/"
              className="text-cyan-400 text-sm hover:text-cyan-300 transition-colors"
            >
              ← Back to Home
            </a>
          </>
        ) : (
          <>
            <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h2 className="text-white font-semibold mb-2">Completing Sign-in…</h2>
            <p className="text-[var(--color-text-secondary)] text-sm">
              Verifying your GitHub credentials and setting up your workspace.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
