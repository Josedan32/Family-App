import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { ProfileForm } from "../(app)/ajustes/perfil/ProfileForm";

const initial = {
  display_name: "Daniel",
  photo_url: null,
  birth_date: null,
  age: null,
};

function renderForm() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <ProfileForm initial={initial} />
    </QueryClientProvider>,
  );
}

describe("ProfileForm password change", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an inline error and blocks submit for a new password shorter than 12 characters", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderForm();

    fireEvent.change(screen.getByLabelText("Contraseña actual"), {
      target: { value: "correct-horse-battery" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña nueva"), {
      target: { value: "short" },
    });
    fireEvent.change(screen.getByLabelText("Confirmar contraseña nueva"), {
      target: { value: "short" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Actualizar contraseña" }));

    expect(
      screen.getByText("La contraseña debe tener al menos 12 caracteres"),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
