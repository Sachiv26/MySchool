import type { Metadata, Viewport } from 'next';
import './globals.css';
import ServiceWorkerRegistration from '../components/ServiceWorkerRegistration';
import { TermProvider } from '@/components/TermContext';

export const metadata: Metadata = {
  title: {
    default: 'MySchool Connect',
    template: '%s · MySchool Connect',
  },
  description: 'Structured school communication and reminders for parents.',
  manifest: '/manifest.webmanifest',
  applicationName: 'MySchool Connect',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f766e',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body>
        <ServiceWorkerRegistration />
        <TermProvider>{children}</TermProvider>
      </body>
    </html>
  );
}