import { SettingsTabs } from "../SettingsTabs";
import { ViewModeSettings } from "./ViewModeSettings";

export default function VisualizationPage() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Ajustes</h1>
      <SettingsTabs />
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Visualización</h2>
        <p className="text-sm text-text-muted">
          Cómo ver tus ingresos, gastos, ahorros, deudas, los gastos del hogar y las tareas. Se guarda en este
          dispositivo.
        </p>
      </div>
      <ViewModeSettings />
    </div>
  );
}
