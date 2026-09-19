'use client';

import { AppearanceSection } from '../../../components/settings/AppearanceSection';
import { SettingsPage } from '../../../components/settings/SettingsPage';

export default function AppearanceSettingsPage() {
  return (
    <SettingsPage title="Darstellung">
      <AppearanceSection />
    </SettingsPage>
  );
}
