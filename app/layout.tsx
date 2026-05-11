import type { Metadata } from 'next';
import { Bebas_Neue, DM_Sans } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/components/ui/ToastProvider';

const bebasNeue = Bebas_Neue({
  weight: '400',
  variable: '--fd',
  subsets: ['latin'],
  display: 'swap',
});

const dmSans = DM_Sans({
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--fb',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Roseland Schedule',
  description: 'Production schedule manager for film and TV',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${bebasNeue.variable} ${dmSans.variable}`}>
      <body>
          <ToastProvider>{children}</ToastProvider>
        </body>
    </html>
  );
}
