import { apiFetch } from "@/lib/api/server";

import { ProfileForm } from "./ProfileForm";

interface Me {
  id: string;
  email: string;
  display_name: string;
  photo_url: string | null;
  birth_date: string | null;
  age: number | null;
}

export default async function ProfilePage() {
  const me = await apiFetch<Me>("/auth/me");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Perfil</h1>
        <p className="text-sm text-text-muted">{me.email}</p>
      </div>
      <ProfileForm initial={me} />
    </div>
  );
}
