'use client';

import { HouseholdSection } from '../../../components/settings/HouseholdSection';
import { SettingsPage } from '../../../components/settings/SettingsPage';

export default function HouseholdSettingsPage() {
  return (
    <SettingsPage title="Haushalt">
      <HouseholdSection />
    </SettingsPage>
  );
}
