import { useState, useEffect, lazy, Suspense } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import OfficePage from './pages/OfficePage';
import OnboardingWizard from './pages/OnboardingWizard';
import { useCompanyStatus } from './hooks/useCompanyStatus';
import { OFFICE_THEMES } from './types/appearance';
import type { OfficeTheme } from './types/appearance';
import type { ImportJob } from './types';

const SpritePreview = lazy(() => import('./components/office/sprites/preview-app'));

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
          style={{ color: 'var(--terminal-text-secondary)', fontFamily: 'var(--pixel-font)' }}
        >
          Loading...
        </div>
      </div>
    </div>
  );
}

function applyStoredTheme(): void {
  try {
    const raw = localStorage.getItem('tycono-theme') || localStorage.getItem('the-company-theme');
    const theme = (raw && raw in OFFICE_THEMES ? raw : 'default') as OfficeTheme;
    const vars = OFFICE_THEMES[theme]?.vars;
    if (!vars) return;
    const root = document.documentElement;
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
  } catch {}
}

function AppShell() {
  const { initialized, loading, refetch } = useCompanyStatus();
  const [importJob, setImportJob] = useState<ImportJob | null>(null);

  // Apply saved theme on app mount (before office loads)
  useEffect(() => { applyStoredTheme(); }, []);

  const handleWizardComplete = (job?: ImportJob) => {
    if (job) setImportJob(job);
    refetch();
  };

  if (loading) return <BootScreen />;
  if (!initialized) return <OnboardingWizard onComplete={handleWizardComplete} />;
  return <OfficePage importJob={importJob} onImportDone={() => setImportJob(null)} />;
}

export default function App() {
  const isSpritePreview = new URLSearchParams(window.location.search).has('sprite-preview');

  return (
    <ErrorBoundary>
      {isSpritePreview ? (
        <Suspense fallback={<BootScreen />}>
          <SpritePreview />
        </Suspense>
      ) : (
        <AppShell />
      )}
    </ErrorBoundary>
  );
}
