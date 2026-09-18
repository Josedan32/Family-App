import {
  VisibilitySettingsForm,
  type VisibilitySettings,
} from "@/components/privacy/VisibilitySettingsForm";
import { pageFetch } from "@/lib/api/server";

import { SettingsTabs } from "../SettingsTabs";

export default async function PrivacyPage() {
  const settings = await pageFetch<VisibilitySettings>("/me/visibility");
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Ajustes</h1>
      <SettingsTabs />
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Privacidad</h2>
        <p className="text-sm text-text-muted">Decide qué ve tu familia sobre tus finanzas.</p>
      </div>
      <VisibilitySettingsForm initial={settings} />
    </div>
  );
}
