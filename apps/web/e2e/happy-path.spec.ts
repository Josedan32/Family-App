import { expect, test } from "@playwright/test";

const PASSWORD = "correct-horse-battery";
const stamp = Date.now();

test("register, create a household, invite, record, and verify visibility", async ({
  page,
  context,
}) => {
  // 1. Daniel registers and creates the household.
  // networkidle, not the default load event: on slower engines (WebKit) a
  // fill() issued before hydration attaches its onChange handler lands on
  // the DOM only, and React's next render (value={state}) wipes it out.
  await page.goto("/registro", { waitUntil: "networkidle" });
  await page.getByLabel("Correo").fill(`daniel${stamp}@example.com`);
  await page.getByLabel("Nombre").fill("Daniel");
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Registrarme" }).click();

  await page.getByLabel("Nombre del hogar").fill("Familia E2E");
  await page.getByRole("button", { name: "Crear" }).click();
  await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();
  // The redirect above also fires a router.refresh(); clicking a nav link
  // while that is still in flight gets silently dropped.
  await page.waitForLoadState("networkidle");

  // From here on, navigate through the app's own nav links rather than
  // page.goto(): a hard navigation issued during a pending client-side
  // refresh gets cancelled ("interrupted by another navigation to /").

  // 2. Daniel issues an invite.
  await page.getByRole("link", { name: "Hogar" }).click();
  await page.getByRole("button", { name: "Crear invitación" }).click();
  const code = (await page.getByTestId("invite-code").textContent())?.trim() ?? "";
  expect(code).toHaveLength(8);

  // 3. Daniel records income. The category picker is a chip radiogroup, not
  // a <select> — the plan predates that design decision (Task 8).
  await page.getByRole("link", { name: "Finanzas" }).click();
  await page.getByRole("tab", { name: "Ingresos" }).click();
  await page.getByRole("button", { name: "Registrar un ingreso" }).click();
  await page.getByLabel("Monto").fill("2000000");
  await page.getByRole("radio", { name: "Salario" }).click();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("+$ 2.000.000")).toBeVisible();

  // 4. Daniel sets everything private.
  await page.getByRole("link", { name: "Ajustes" }).click();
  for (const label of ["Ingresos", "Gastos", "Ahorros", "Deudas"]) {
    await page.getByLabel(label).selectOption("private");
  }
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Configuración guardada")).toBeVisible();

  // 5. Papá joins in a separate browser context and sees nothing of Daniel's.
  const papaPage = await context.browser()!.newContext().then((c) => c.newPage());
  await papaPage.goto("/registro", { waitUntil: "networkidle" });
  await papaPage.getByLabel("Correo").fill(`papa${stamp}@example.com`);
  await papaPage.getByLabel("Nombre").fill("Papá");
  await papaPage.getByLabel("Contraseña").fill(PASSWORD);
  await papaPage.getByRole("button", { name: "Registrarme" }).click();
  await papaPage.getByRole("tab", { name: "Unirme con código" }).click();
  // Real label is "Código del hogar" — the plan predates the onboarding
  // screen's actual copy (Task 6).
  await papaPage.getByLabel("Código del hogar").fill(code);
  await papaPage.getByRole("button", { name: "Unirme" }).click();

  await expect(papaPage.getByRole("heading", { name: "Inicio" })).toBeVisible();
  // The household total still includes Daniel — disclosed, not suppressed.
  await expect(papaPage.getByText("$ 2.000.000")).toBeVisible();
  // But his individual figures are not shown.
  await expect(papaPage.getByText("Privado").first()).toBeVisible();
});
