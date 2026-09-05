# Índice de diseño

Los mockups viven como artifacts de Claude Design. **Cada tarea de interfaz de
los planes 4, 5 y 6 debe abrir el suyo antes de escribir el componente.**

Estos enlaces son la referencia visual. La especificación que manda sigue siendo
`docs/design-system.md`, que ya está reconciliado contra la Hoja de estilo y el
Spec — si un mockup contradice una regla dura de ese documento (`100dvh`, safe
areas, altura táctil, `PrivateBlock` sin desenfoque), gana el documento.

---

## Fundacionales — ya reconciliados

| Artifact | Qué aporta |
| -------- | ---------- |
| [Spec](https://claude.ai/code/artifact/6a757d83-cd79-4a0c-acb3-d037730bfc04) | Escala tipográfica, botones, campos, insignias, bloque privado, estados de lista |
| [Hoja de estilo](https://claude.ai/code/artifact/9785cbf3-af48-42b9-8800-9b72fcef468f) | Tokens de color en claro y oscuro |
| [Identidad](https://claude.ai/code/artifact/022b3399-a9eb-49c5-8c21-1ab8b88a90f6) | Ícono, marca, PWA — **pendiente de leer** |

---

## Pantallas — Plan 4 (web)

| Pantalla | Ruta | Tarea | Mockup |
| -------- | ---- | ----- | ------ |
| Autenticación | `/login`, `/registro` | T5 | [artifact](https://claude.ai/code/artifact/52f7a609-ae06-4a35-b5e8-5c0d32fefda7) |
| Tu hogar | `/onboarding/hogar` | T6 | [artifact](https://claude.ai/code/artifact/854dd804-5e7e-4c01-8203-a6cef4bca61e) |
| Inicio | `/` | T7 | [artifact](https://claude.ai/code/artifact/851bd794-ddc4-4cde-9e08-2107ee698e1a) |
| Inicio · contenido | `/` | T7 | [artifact](https://claude.ai/code/artifact/0e7c97ef-0056-4831-bbe4-ddc698330c38) |
| Finanzas | `/finanzas` | T8 | [artifact](https://claude.ai/code/artifact/6094c8fd-a67c-489e-ab21-d80c40e41c8a) |
| Registrar movimiento | `/finanzas` (hoja) | T8 | [artifact](https://claude.ai/code/artifact/822ce0b7-7f8d-47ad-85f0-32d499f10111) |
| Préstamos | `/finanzas/prestamos` | T9 | [artifact](https://claude.ai/code/artifact/c6e953b6-0aa0-4311-a6ed-5e79a06e1d45) |
| Aportes | `/aportes` | T9 | [artifact](https://claude.ai/code/artifact/89eba89c-debf-434b-a369-54efc2409286) |
| Administración del hogar | `/hogar` | T9 | [artifact](https://claude.ai/code/artifact/1239df5c-b0a4-4705-a26a-cf1836f5e19a) |
| Perfil de miembro | `/hogar/miembros/[id]` | T9 | [artifact](https://claude.ai/code/artifact/652b2258-01e4-4579-a1d5-815a43902d01) |
| Perfil de miembro · contenido | `/hogar/miembros/[id]` | T9 | [artifact](https://claude.ai/code/artifact/8e7c30ba-0f0f-4987-bf18-03aad13905ca) |
| Privacidad | `/ajustes/privacidad` | T10 | [artifact](https://claude.ai/code/artifact/75e52dce-91e3-4df6-a2b7-f6d436c1bd03) |
| Privacidad · contexto | `/ajustes/privacidad` | T10 | [artifact](https://claude.ai/code/artifact/b0928f5d-7536-4398-b9a6-76943eb305ac) |
| Perfil propio | `/ajustes/perfil` | T10 | [artifact](https://claude.ai/code/artifact/6d377cb2-e76a-4ce6-90d7-d2fc3de9dc7a) |
| Perfil propio · contenido | `/ajustes/perfil` | T10 | [artifact](https://claude.ai/code/artifact/af1939ed-ad41-4b96-a050-3abb51679de0) |

## Pantallas — Plan 5 (libro del hogar y cuotas)

| Pantalla | Ruta | Tarea | Mockup |
| -------- | ---- | ----- | ------ |
| Gastos del hogar | `/hogar/gastos` | T9 | [artifact](https://claude.ai/code/artifact/a880714c-dc20-4608-a324-85990dee1c52) |
| Registrar gasto del hogar | `/hogar/gastos` (hoja) | T9 | [artifact](https://claude.ai/code/artifact/7f4bd171-363d-4e3b-8411-8f60e9447e3b) |
| Plan de cuotas | `/finanzas` · deudas | T10 | [artifact](https://claude.ai/code/artifact/b0e07b69-2a0c-4414-b51e-d9aec9e1544d) |

## Pantallas — Plan 6 (tareas del hogar)

| Pantalla | Ruta | Tarea | Mockup |
| -------- | ---- | ----- | ------ |
| Tareas | `/tareas` | T7 | [artifact](https://claude.ai/code/artifact/4bbb9a8b-f05c-43b6-87e0-f235d1783ecb) |
| Administrar tareas | `/tareas/admin` | T7 | [artifact](https://claude.ai/code/artifact/546f58e6-a5b4-4a55-ae67-6afa698033ad) |
| Ausencias | `/ajustes/ausencias` | T7 | [artifact](https://claude.ai/code/artifact/c1c99a53-cf88-4c04-8c90-7322076b4361) |

## Transversal

| Pantalla | Alcance | Tarea | Mockup |
| -------- | ------- | ----- | ------ |
| Cambios de navegación | Barra inferior y sidebar, 6 destinos | Plan 4 T5 · Plan 6 T7 | [artifact](https://claude.ai/code/artifact/194ee122-0f89-4e2c-ae69-96466f725632) |

---

## Pendientes

1. **Identidad sin leer.** Hace falta antes de la tarea 11 del Plan 4 (manifest
   del PWA e íconos).
2. **Las 22 pantallas están sin leer**, a propósito: se abren en la tarea que
   las construye, no ahora. Leerlas todas en una sola conversación las
   congelaría en un resumen en vez de dejarlas disponibles con contexto limpio
   cuando de verdad hacen falta.

## Cómo lee esto un agente

En la tarea correspondiente, antes de escribir el componente:

```
Lee el mockup de esta pantalla con la herramienta Artifact (action: "read",
url: <la de la tabla>). El HTML viene empaquetado: guárdalo y desempácalo
extrayendo el <script type="__bundler/template"> — ahí está el diseño real,
con estilos en línea legibles.

Si el mockup contradice docs/design-system.md en una regla dura (100dvh, safe
areas, altura táctil, PrivateBlock sin desenfoque), gana el documento y me lo
señalas. En lo visual —espaciado, jerarquía, copy— gana el mockup.
```
