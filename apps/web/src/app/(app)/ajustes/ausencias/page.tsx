import { pageFetch } from "@/lib/api/server";

import { AbsenceForm, type Absence } from "./AbsenceForm";

export default async function AbsencesPage() {
  const absences = await pageFetch<Absence[]>("/me/absences");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Ausencias</h1>
        <p className="text-sm text-text-muted">
          Mientras estás ausente no se te asignan tareas; al volver, el sistema te asigna
          más hasta emparejarte con el resto.
        </p>
      </div>
      <AbsenceForm initial={absences} />
    </div>
  );
}
