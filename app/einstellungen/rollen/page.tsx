'use client';

import { RolesSection } from '../../../components/settings/RolesSection';
import { SettingsPage } from '../../../components/settings/SettingsPage';

export default function RolesSettingsPage() {
  return (
    <SettingsPage title="Nutzer und Rollen">
      <RolesSection />
    </SettingsPage>
  );
}
