import {
  VisibilitySettingsForm,
  type VisibilitySettings,
} from "@/components/privacy/VisibilitySettingsForm";
import { apiFetch } from "@/lib/api/server";

export default async function PrivacyPage() {
  const settings = await apiFetch<VisibilitySettings>("/me/visibility");
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Privacidad</h1>
      <p className="text-sm text-text-muted">Decide qué ve tu familia sobre tus finanzas.</p>
      <VisibilitySettingsForm initial={settings} />
    </div>
  );
}
