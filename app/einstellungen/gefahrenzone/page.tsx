'use client';

import { DangerZoneSection } from '../../../components/settings/DangerZoneSection';
import { SettingsPage } from '../../../components/settings/SettingsPage';

export default function DangerZonePage() {
  return (
    <SettingsPage title="Gefahrenzone">
      <DangerZoneSection />
    </SettingsPage>
  );
}
