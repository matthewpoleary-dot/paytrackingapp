import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pay',
  description: 'Log your shifts. Know what the week is worth.',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Pay' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Content runs under the notch and the home indicator; safe-area insets
  // hold it clear rather than a letterboxed strip doing it.
  viewportFit: 'cover',
  // The status bar picks up the page field in each scheme, so the top of the
  // screen doesn't read as a separate surface.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f2f7' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en-IE" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
