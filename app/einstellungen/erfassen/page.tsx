'use client';

import { AmountModeSection } from '../../../components/settings/AmountModeSection';
import { CaptureSection } from '../../../components/settings/CaptureSection';
import { DeleteSection } from '../../../components/settings/DeleteSection';
import { FabSection } from '../../../components/settings/FabSection';
import { SettingsPage } from '../../../components/settings/SettingsPage';

export default function CaptureSettingsPage() {
  return (
    <SettingsPage
      title="Erfassen"
      hint="Was beim Anlegen einer Buchung vorgegeben ist, was gefragt wird — und wie gelöscht wird."
    >
      <CaptureSection />
      <FabSection />
      <AmountModeSection />
      <DeleteSection />
    </SettingsPage>
  );
}
