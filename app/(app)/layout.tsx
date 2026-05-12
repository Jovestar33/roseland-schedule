import AuthGate from '@/components/AuthGate';
import AppHeader from '@/components/AppHeader';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AppHeader />
      {children}
    </AuthGate>
  );
}
