import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AvatarUpload } from "../ui/AvatarUpload";

vi.mock("@/lib/avatarImage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/avatarImage")>(
    "@/lib/avatarImage",
  );
  return { ...actual, resizeImageToDataUrl: vi.fn() };
});

import { resizeImageToDataUrl } from "@/lib/avatarImage";

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function renderUpload(onUpdated = vi.fn()) {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <AvatarUpload displayName="Daniel" photoUrl={null} onUpdated={onUpdated} />
    </QueryClientProvider>,
  );
  return onUpdated;
}

function selectFile(file: File) {
  const input = screen.getByLabelText("Editar foto") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe("AvatarUpload", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(resizeImageToDataUrl).mockReset();
  });

  it("shows the initial letter when there is no photo", () => {
    renderUpload();
    expect(screen.getByText("D")).toBeInTheDocument();
  });

  it("rejects a non-image file without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderUpload();

    selectFile(new File(["x"], "doc.pdf", { type: "application/pdf" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Selecciona un archivo de imagen"),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a resized image that is still too large", async () => {
    vi.mocked(resizeImageToDataUrl).mockResolvedValue("a".repeat(200_001));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderUpload();

    selectFile(new File(["x"], "photo.png", { type: "image/png" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "La imagen sigue siendo muy grande, prueba con otra",
      ),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("PATCHes /me/profile with the resized data URL and reports it", async () => {
    const dataUrl = "data:image/jpeg;base64,abc123";
    vi.mocked(resizeImageToDataUrl).mockResolvedValue(dataUrl);
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : null;
      expect(body).toEqual({ photo_url: dataUrl });
      return jsonResponse({ photo_url: dataUrl });
    });
    vi.stubGlobal("fetch", fetchMock);
    const onUpdated = renderUpload();

    selectFile(new File(["x"], "photo.png", { type: "image/png" }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(dataUrl));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/me/profile"),
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});
