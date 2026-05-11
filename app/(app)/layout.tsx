import Image from 'next/image';
import AuthGate from '@/components/AuthGate';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="hdr">
        <Image
          src="/logo-header.png"
          alt="Roseland Pictures"
          width={795}
          height={682}
          style={{ height: '88px', width: 'auto' }}
          priority
        />
      </div>
      {children}
    </AuthGate>
  );
}
