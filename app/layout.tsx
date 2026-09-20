import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

// A neutral grotesk in the spirit of the reference's Uncut Sans. Variable, so
// the 350/450/550 weights the type ramp asks for are real weights rather than
// the browser faking them. next/font self-hosts it at build time — no
// third-party request on the critical path, and no new package.
const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Tally', template: '%s · Tally' },
  description: 'Log your shifts. Know what the week is worth.',
  applicationName: 'Tally',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Tally' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Content runs under the notch and home indicator; safe-area insets hold it
  // clear rather than a letterboxed strip doing it.
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ebe9dc' },
    { media: '(prefers-color-scheme: dark)', color: '#071f1a' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en-IE" className={`${geist.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
