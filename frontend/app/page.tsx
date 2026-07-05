/**
 * frontend/app/page.tsx
 * ----------------------
 * Landing page for the Agentic RAG Security Auditor.
 *
 * Features:
 *   - Animated hero section with gradient text and glow orbs
 *   - Feature cards with glassmorphism styling
 *   - Live stats ticker
 *   - GitHub OAuth login button that redirects to the backend auth route
 *   - Responsive layout
 *
 * This is a Server Component — auth state is read via the AuthContext
 * (from useAuth hook) in the inner client components.
 */

import LandingPageClient from '@/components/LandingPageClient';

export default function HomePage() {
  return <LandingPageClient />;
}
