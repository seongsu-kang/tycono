import { useState } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import OfficePage from './pages/OfficePage';
import OnboardingWizard from './pages/OnboardingWizard';
import { useCompanyStatus } from './hooks/useCompanyStatus';
import type { ImportJob } from './types';

function BootScreen() {
  return (
    <div
      className="h-full flex items-center justify-center"
      style={{ background: 'var(--floor-dark)' }}
    >
      <div className="text-center">
        <div
          className="w-10 h-10 mx-auto border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--terminal-border)', borderTopColor: 'var(--accent)' }}
        />
        <div
          className="mt-4 text-sm"
          style={{ color: 'var(--desk-dark)', fontFamily: 'var(--pixel-font)' }}
        >
          Loading...
        </div>
      </div>
    </div>
  );
}

function AppShell() {
  const { initialized, loading, refetch } = useCompanyStatus();
  const [importJob, setImportJob] = useState<ImportJob | null>(null);

  const handleWizardComplete = (job?: ImportJob) => {
    if (job) setImportJob(job);
    refetch();
  };

  if (loading) return <BootScreen />;
  if (!initialized) return <OnboardingWizard onComplete={handleWizardComplete} />;
  return <OfficePage importJob={importJob} onImportDone={() => setImportJob(null)} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}
