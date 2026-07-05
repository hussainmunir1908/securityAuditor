/**
 * frontend/app/layout.tsx
 * ------------------------
 * Root application layout — wraps all pages with the AuthProvider
 * and sets global metadata and fonts.
 */

import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { AuthProvider } from '@/contexts/AuthContext';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'Agentic RAG Security Auditor',
  description:
    'AI-powered Static Application Security Testing platform. Detect vulnerabilities in your codebase using Retrieval-Augmented Generation.',
  keywords: ['SAST', 'security', 'vulnerability scanner', 'RAG', 'AI', 'code analysis'],
  openGraph: {
    title: 'Agentic RAG Security Auditor',
    description: 'AI-powered code security analysis with RAG',
    type: 'website',
  },
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps): React.ReactElement {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-gray-950 text-gray-100 antialiased">
        {/* AuthProvider must wrap the entire app so any Client Component
            can access auth state via the useAuth hook */}
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
