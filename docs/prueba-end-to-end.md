# Prueba end-to-end — ronda de mejoras (avatar, ajustes, aportes, finanzas)

Guion manual para probar a mano los 12 cambios de esta ronda (paquetes A–L
del pedido original). Cada sección dice qué hacer, qué deberías ver, y qué
señalaría que algo quedó mal.

---

## 0. Levantar todo

```
docker compose up -d db
```

```
cd apps/api && alembic upgrade head && python scripts/seed.py
```

```
cd apps/api && uvicorn family_api.main:app --reload --port 8001
```

```
cd apps/web && npm run dev
```

API en `localhost:8001`, web en `localhost:3000` (o el puerto que `next dev`
te diga si está ocupado).

**Comprobación mínima:** `http://localhost:8001/api/v1/health` → `{"status":"ok"}`.

**Usuarios de la Familia Hernández** (contraseña para todos: `correct-horse-battery`):

| Email | Nombre | Rol |
| --- | --- | --- |
| `daniel@example.com` | Daniel | Administrador |
| `papa@example.com` | Papá | Adulto |
| `mama@example.com` | Mamá | Adulto |
| `hermano@example.com` | Hermano | Adolescente |

Entra como **Daniel** salvo que una sección diga lo contrario.

---

## 1. Textos quitados

1. En el **Dashboard** (inicio), debajo de "Totales del hogar", ya no debe
   aparecer la frase "Los totales del hogar incluyen a todos los miembros."
2. En una tarjeta de miembro con "Gastos personales por categoría" (sección
   3 de esta guía te lleva ahí), tampoco debe aparecer la frase "Un gasto
   con más de una categoría cuenta completo en cada una...".

---

## 2. Avatar en toda la app

1. Entra como Daniel. En el **sidebar** (pantalla ancha) debe verse un
   círculo con su foto o, si no tiene, sus iniciales sobre un color de
   fondo — nunca vacío.
2. Ve a **Hogar → Miembros**. Cada miembro debe mostrar el mismo tipo de
   círculo (foto o iniciales), y **cada miembro debe tener un color
   distinto** de forma consistente (recarga la página y confirma que el
   color de cada quien no cambia).
3. En el **Dashboard**, cada tarjeta de miembro debe mostrar el mismo
   avatar (antes solo mostraba la inicial sin color).
4. Ve a **Tareas**. En cada tarea del listado debe verse el avatar de la
   persona asignada junto a su nombre (antes solo se veían los puntos de
   esfuerzo, sin ningún círculo de persona).
5. Sube una foto de perfil (ver sección 4) y confirma que reemplaza el
   círculo de iniciales en **todos** los lugares anteriores, no solo en la
   página de perfil.

---

## 3. Navegación: perfil, logout y Hogar → Miembros

1. En el sidebar, haz clic en tu **nombre** (junto al avatar) — debe
   llevarte a `/ajustes/perfil`. Antes no pasaba nada al hacer clic ahí.
2. Junto a tu nombre en el sidebar debe verse un botón de **logout con
   ícono** (una puerta con flecha), separado del nombre. Haz clic — debe
   cerrar la sesión y mandarte a login.
3. Ve a **Ajustes**. Debe abrir directamente el **Perfil** (ya no una
   pantalla vacía de "Ajustes" sin contenido), con una pestaña arriba para
   cambiar a **Privacidad** dentro de la misma página.
4. Desde **Hogar**, haz clic sobre cualquier miembro de la lista (no en el
   botón "Editar") — debe llevarte a su página de detalle
   (`/hogar/miembros/[id]`) con sus totales según lo que puedas ver de él.
   Antes esa página existía pero no había ningún enlace hacia ella.

---

## 4. Contraseña dinámica

1. Ve a **Ajustes → Perfil**, sección "Cambiar contraseña". Empieza a
   escribir una contraseña nueva de menos de 12 caracteres — debe aparecer
   de inmediato (sin dar clic en nada más) una barra roja con el mensaje
   de cuántos caracteres faltan.
2. Sigue escribiendo hasta pasar los 12 caracteres pero solo con
   minúsculas — la barra debe ponerse **amarilla** ("Media") y sugerir
   agregar mayúscula/número/símbolo.
3. Agrega una mayúscula y un número — debe ponerse **verde** ("Segura").
4. En "Confirmar contraseña nueva", escribe algo distinto a la contraseña
   nueva — debe marcar "Las contraseñas no coinciden" mientras escribes,
   no solo al dar clic en "Actualizar contraseña".
5. Corrige la confirmación para que coincida — el error debe desaparecer
   solo, sin recargar nada.
6. Repite el mismo comportamiento dinámico en **Crear cuenta**
   (`/registro`) con el campo de contraseña.

---

## 5. Compartir invitación con enlace

1. Ve a **Hogar**, sección de invitaciones. Genera un código nuevo y haz
   clic en **Compartir**.
2. El mensaje compartido (o el que cae en portapapeles/WhatsApp) debe
   incluir, además del código, un **enlace** de la forma
   `.../onboarding/hogar?code=EL-CODIGO`.
3. Abre ese enlace (puedes copiarlo y pegarlo en una pestaña nueva, ya
   logueado con otra cuenta, o simplemente revisa que el código en la URL
   sea el correcto). La pantalla de unirse a un hogar debe:
   - Abrir directamente en la pestaña **"Unirme con código"** (no en
     "Crear hogar").
   - Traer el código **ya escrito** en el campo, sin que lo tengas que
     digitar.

---

## 6. Períodos: crear y reabrir

1. Ve a **Aportes → Ver periodos anteriores**. Como Daniel (admin), debe
   verse un botón **"Crear periodo"** arriba de la lista.
2. Créalo con un mes futuro y una meta — debe aparecer en la lista.
3. Entra a un periodo **cerrado** (o cierra uno abierto con "Cerrar
   periodo" para probar). En su detalle debe aparecer un botón **"Reabrir
   periodo"**.
4. Como no-admin (Papá o Mamá), entra al mismo periodo cerrado — el botón
   "Reabrir periodo" debe verse **deshabilitado** con el motivo al lado
   ("Solo un administrador puede reabrir el periodo").
5. Como admin, con un periodo ya abierto en el hogar, intenta reabrir un
   periodo **distinto** que esté cerrado — debe rechazarlo explicando que
   hay que cerrar el otro primero.

---

## 7. Categorías: selector compacto

1. Ve a **Finanzas → Nuevo gasto** (o ingreso). El selector de categorías
   ya no debe ser una grilla rígida de 3 columnas que ocupa media pantalla
   — debe verse como chips que fluyen y se ajustan al ancho.
2. Si hay más de 8 categorías, debe aparecer un chip **"+N más"** al
   final; haz clic — debe mostrar el resto sin recargar la página.
3. Edita una transacción cuya categoría esté "escondida" detrás del "+N
   más" (si aplica) — esa categoría debe verse marcada aunque el resto
   siga colapsado.

---

## 8. Resumen mensual en tiempo real y colapsable

1. En **Finanzas**, con la tarjeta "Resumen mensual" **expandida**,
   registra un ingreso o un gasto nuevo sin recargar la página ni cambiar
   de pestaña — las cifras del resumen deben actualizarse solas.
2. Repite abonando a un ahorro y pagando una deuda — ambos movimientos
   deben reflejarse en el resumen sin refrescar.
3. Haz clic en el encabezado "Resumen mensual" — debe **colapsarse**,
   mostrando solo el monto "Restante" a la derecha; vuelve a hacer clic
   para expandirlo.
4. Con el resumen expandido, verifica que Ingresos, Gastos, Ahorrado y
   Pagos de deuda tengan cada uno el color de su módulo (verde, rojo,
   azul, naranja — los mismos que ya usan el dashboard y las tarjetas).

---

## 9. Gastos por categoría, por persona: desplegable

1. En el **Dashboard**, abre la tarjeta de un miembro con varias
   categorías de gasto personal.
2. La sección "Gastos personales por categoría" debe verse **colapsada**
   por defecto (solo el título con una flechita ▸).
3. Haz clic — debe desplegarse mostrando las categorías; vuelve a hacer
   clic para ocultarlas de nuevo.

---

## 10. Ahorro: fecha meta y estado visual

1. En **Finanzas → Ahorros → nueva meta**, el formulario ahora debe pedir
   una **"Fecha meta (opcional)"** — antes no existía ese campo.
2. Crea una meta con fecha meta futura y sin completarla — la tarjeta debe
   mostrar "N días restantes" y prioridad tal como la elegiste.
3. Completa el monto de una meta (con un abono) hasta alcanzarla — la
   tarjeta debe mostrar **"Meta alcanzada"**, la prioridad debe mostrarse
   como **"Baja"** en verde (aunque la hayas creado como "Alta"), y el
   fondo de la tarjeta debe teñirse levemente de verde.
4. Crea una meta con fecha meta en el pasado sin completarla — debe
   mostrar "Plazo vencido", la prioridad debe verse en rojo, y el fondo de
   la tarjeta debe teñirse levemente de rojo.
5. Una meta normal en progreso (sin vencer, sin completar) debe verse con
   el fondo neutro de siempre.

---

## 11. Deudas: tasa de interés y capital pagado

1. En **Finanzas → Deudas → nueva deuda**, el formulario debe incluir un
   campo **"Tasa de interés anual % (opcional)"**.
2. Crea una deuda con una tasa (por ejemplo 24.5) — la tarjeta de la deuda
   debe mostrar esa tasa junto a la fecha de corte (ej. "Vence el día 15 ·
   24.5% E.A.").
3. Registra uno o más abonos a una deuda. En la **tarjeta** (sin
   necesidad de expandirla) debe verse "Abonado: $X" junto a "Saldo
   pendiente" — antes solo se veía al expandir el detalle.
4. Expande el detalle de la deuda — debe seguir mostrando "Total abonado"
   y, si la creaste con tasa, también "Tasa de interés anual".

---

## 12. Modal → página en formularios grandes

1. En **Finanzas**, pestaña "Gastos" o "Ingresos", pulsa el botón **+**
   (o "Registrar un gasto/ingreso" si la lista está vacía) — debe
   **navegar a una página nueva** (`/finanzas/nuevo?kind=...`), no abrir
   un modal/sheet.
2. Completa el formulario y guarda — debe devolverte a **Finanzas** en la
   pestaña correspondiente, con el movimiento ya en la lista.
3. En la pestaña "Deudas", pulsa el botón **+** — debe llevarte a
   `/finanzas/deudas/nueva` como página completa (con el plan de cuotas
   desplegable abajo si lo activas), no a un modal.
4. En cambio, "Ahorros" (meta nueva) debe seguir abriendo como una hoja
   modal (sheet) — ese formulario es corto y no necesitaba el cambio.

---

## 13. Repaso de privacidad (siempre al final)

El modelo de privacidad no cambió en esta ronda, pero cualquier UI nueva
que muestre datos de otro miembro (avatar en tareas, tarjetas de deuda con
más datos, etc.) es una superficie nueva donde una fuga podría colarse.

1. Inicia sesión como **Hermano** (todo privado). Revisa el dashboard, las
   tareas y cualquier avatar o cifra de Papá o Mamá — nada debe mostrar un
   número real donde la configuración diga "privado"; el avatar (foto o
   iniciales) sí puede verse siempre, no es información financiera.
2. Como Daniel (admin), confirma que **tampoco tú** ves cifras privadas de
   Hermano en ningún lugar nuevo de esta ronda (tarjetas de deuda con tasa
   de interés, resumen mensual, etc.) — ser admin no abre ninguna puerta
   trasera.

---

## Si algo no cuadra

- Si el "resumen semanal" mencionado en el pedido original no aparece en
  ninguna pantalla, es porque no existe esa función en la app — lo que se
  coloreó por completo es el **resumen mensual** (sección 8). Avisa si te
  referías a otra pantalla.
- Si ves algo de otro miembro que su configuración de privacidad dice que
  no deberías ver, **eso sí es un bug real** y el más importante de todos
  para reportar.
