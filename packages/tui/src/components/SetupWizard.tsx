/**
 * SetupWizard — step-by-step company setup when no company exists
 *
 * Steps:
 *  1. Enter company name
 *  2. Select team template
 *  3. Enter code directory
 *  4. Scaffold via API
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import {
  fetchSetupTeams,
  postSetupScaffold,
  postSetupCodeRoot,
  type TeamTemplate,
} from '../api';

type Step = 'name' | 'team' | 'codeDir' | 'creating' | 'done' | 'error';

interface SetupWizardProps {
  onComplete(): void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
  const [step, setStep] = useState<Step>('name');
  const [companyName, setCompanyName] = useState('');
  const [teams, setTeams] = useState<TeamTemplate[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<TeamTemplate | null>(null);
  const [codeDir, setCodeDir] = useState('./code');
  const [resultPath, setResultPath] = useState('');
  const [resultRoles, setResultRoles] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  // Load team templates with retry — same-process server+client
  // can have event loop contention causing ECONNRESET or timeout
  useEffect(() => {
    let cancelled = false;
    const load = async (attempt = 0): Promise<void> => {
      if (cancelled) return;
      // Delay to let Ink's render cycle settle
      await new Promise(r => setTimeout(r, attempt === 0 ? 1000 : 2000));
      if (cancelled) return;
      try {
        const teams = await fetchSetupTeams();
        if (!cancelled) setTeams(teams);
      } catch (err) {
        if (cancelled) return;
        if (attempt < 3) {
          return load(attempt + 1);
        }
        setErrorMsg(`Failed to load team templates: ${err instanceof Error ? err.message : 'unknown'}`);
        setStep('error');
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Esc to cancel (only during input steps)
  useInput((_input, key) => {
    if (key.escape && (step === 'name' || step === 'team' || step === 'codeDir')) {
      process.exit(0);
    }
  });

  // Auto-transition after done
  useEffect(() => {
    if (step === 'done') {
      const timer = setTimeout(onComplete, 2000);
      return () => clearTimeout(timer);
    }
  }, [step, onComplete]);

  /* ─── Step handlers ─── */

  const handleNameSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setCompanyName(trimmed);
    setStep('team');
  };

  const handleTeamSelect = (item: { value: string }) => {
    const team = teams.find((t) => t.id === item.value) ?? null;
    setSelectedTeam(team);
    setStep('codeDir');
  };

  const handleCodeDirSubmit = async (value: string) => {
    const path = await import('node:path');
    const fs = await import('node:fs');
    const dir = path.resolve(value.trim() || './code');
    setCodeDir(dir);
    setStep('creating');

    try {
      // Ensure code directory exists
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const result = await postSetupScaffold(companyName, selectedTeam?.id ?? 'minimal');
      setResultPath(result.path ?? '');
      setResultRoles(result.rolesCreated ?? 0);

      await postSetupCodeRoot(dir);
      setStep('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
      setStep('error');
    }
  };

  /* ─── Render ─── */

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
      width={56}
    >
      <Text bold color="cyan">{'───'} TYCONO Setup {'───'}</Text>

      <Box marginTop={1}>
        <Text color="gray">No company found. Let's set one up.</Text>
      </Box>

      {/* Step 1: Company Name */}
      {step === 'name' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Step 1/3: Company Name</Text>
          <Box marginTop={1}>
            <Text color="green">&gt; </Text>
            <TextInput
              value={companyName}
              onChange={setCompanyName}
              onSubmit={handleNameSubmit}
              placeholder="Enter your company name..."
            />
          </Box>
          <Box marginTop={1}>
            <Text color="gray" dimColor>[Enter: Next]  [Esc: Cancel]</Text>
          </Box>
        </Box>
      )}

      {/* Step 2: Team Template */}
      {step === 'team' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Step 2/3: Team Template</Text>
          <Box marginTop={1} flexDirection="column">
            {teams.length > 0 ? (
              <SelectInput
                items={teams.map((t) => ({
                  label: `${t.id}  ${t.roles.map(r => typeof r === 'string' ? r : r.name || r.id).join(', ')}`,
                  value: t.id,
                }))}
                onSelect={handleTeamSelect}
              />
            ) : (
              <Text color="gray">Loading templates...</Text>
            )}
          </Box>
          <Box marginTop={1}>
            <Text color="gray" dimColor>[Enter: Select]  [Esc: Cancel]</Text>
          </Box>
        </Box>
      )}

      {/* Step 3: Code Directory */}
      {step === 'codeDir' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Step 3/3: Code Directory</Text>
          <Box marginTop={1}>
            <Text color="green">&gt; </Text>
            <TextInput
              value={codeDir}
              onChange={setCodeDir}
              onSubmit={handleCodeDirSubmit}
              placeholder="./code"
            />
          </Box>
          <Box marginTop={1}>
            <Text color="gray" dimColor>[Enter: Create]  [Esc: Cancel]</Text>
          </Box>
        </Box>
      )}

      {/* Creating... */}
      {step === 'creating' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow">Creating company...</Text>
        </Box>
      )}

      {/* Done */}
      {step === 'done' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="green">{'\u2705'} Company created!</Text>
          {resultPath && (
            <Text color="white">{'\uD83D\uDCC1'} {resultPath}</Text>
          )}
          <Text color="white">
            {'\uD83D\uDC65'} {resultRoles} roles ({selectedTeam?.id ?? 'minimal'})
          </Text>
          <Box marginTop={1}>
            <Text color="gray">Starting dashboard...</Text>
          </Box>
        </Box>
      )}

      {/* Error */}
      {step === 'error' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="red">Error: {errorMsg}</Text>
          <Text color="gray" dimColor>Press Ctrl+C to exit</Text>
        </Box>
      )}
    </Box>
  );
};
