import CamUpdatePageContent from '@/app/cam-update-page-content';
import { Logo } from '@/components/logo';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="mb-8">
        <Logo />
      </div>
      <CamUpdatePageContent />
    </div>
  );
}
