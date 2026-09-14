# Prompts de ejecución — Family Hub

Para pegar en Claude Code. **En este orden**: cada plan asume que los anteriores
ya corrieron.

| # | Prompt | Depende de | Entrega |
| - | ------ | ---------- | ------- |
| P0 | Parchar el entorno | — | Puerto, venv, comandos |
| P1 | Plan 1 — Foundation & Household | P0 | API: registro, hogar, invitaciones, miembros |
| P2 | Plan 2 — Personal Finance & Transparency | P1 | Contabilidad personal + modelo de privacidad |
| P3 | Plan 3 — Contribution & Dashboard | P2 | Aportes con espejo atómico + dashboard |
| P4 | Plan 5 — Household Ledger, tareas 1–8 | P3 | Libro del hogar + cuotas (API) |
| P5 | Plan 4 — Web App | P3 | La PWA completa |
| P6 | Plan 5 — tareas 9–10 | P5 | Pantallas del libro del hogar y cuotas |
| P7 | Plan 6 — Household Chores | P1 y P5 | Tareas del hogar con equidad |

El Plan 5 se parte en dos porque sus dos últimas tareas son interfaz y necesitan
que la web exista. El Plan 6 puede correr en cualquier momento después del P1 si
saltas sus tareas de interfaz.

---

## Antes de cualquier tarea de interfaz

Las 25 pantallas están diseñadas y viven como artifacts, indexadas en
`docs/design-index.md` con la tarea exacta que las construye.

**`docs/design-system.md` ya está reconciliado contra el diseño real.** En dos
puntos el código escrito en los planes contradice esa reconciliación, y ambos
pasarían los tests del propio plan porque los tests se escribieron contra el
código equivocado:

1. **`formatMoney` en el Plan 4 tarea 3 borra el espacio** con
   `.replace(/\s/g, "")`. El diseño usa `$ 2.000.000`, con espacio. Hay que
   quitar ese `replace` y corregir las aserciones de los tests que esperan
   `$2.000.000`.
2. **Las filas de deuda muestran las cuotas en la lista** (`2 sep · 14 de 36`),
   no solo dentro de la tarjeta. El Plan 5 tarea 10 pone `InstallmentSummary`
   únicamente en `DebtCard`.

Cuando el plan y `design-system.md` no coincidan, **gana `design-system.md`**:
está reconciliado contra el diseño publicado; los planes se escribieron antes.

---

## P0 — Parchar el entorno

Esto arregla tres cosas que escribí sin mirar tu máquina. Sin esto, el agente se
estrella en la primera tarea.

```
Antes de ejecutar ningún plan, corrige tres cosas en
docs/superpowers/plans/2026-09-02-foundation-and-household.md:

1. El puerto 8000 está ocupado por Docker Desktop en esta máquina. Cambia la
   API al 8001: en el Makefile (uvicorn --port 8001), en .env.example
   (NEXT_PUBLIC_API_BASE_URL=http://localhost:8001/api/v1) y en cualquier otro
   lugar del plan que mencione 8000.

2. `make` no está instalado y no lo vamos a instalar. Junto a cada objetivo del
   Makefile, deja documentado el comando directo equivalente, y en los pasos del
   plan que dicen "make X" agrega el comando crudo entre paréntesis.

3. El `python` del PATH es 3.10, demasiado viejo. El plan necesita 3.12 o
   superior y esta máquina tiene 3.13.7. Añade a la tarea 1 un paso que cree el
   entorno virtual explícitamente con `py -3.13 -m venv .venv` y lo active,
   antes del `pip install -e ".[dev]"`.

No ejecutes ninguna tarea todavía. Solo edita el plan y muéstrame el diff.
```

---

## P1 — Plan 1: Foundation & Household

```
Ejecuta docs/superpowers/plans/2026-09-02-foundation-and-household.md tarea por
tarea usando la skill superpowers:executing-plans.

Empieza en la tarea 1 y detente al terminar cada tarea para que la revise antes
de seguir.

Reglas que no puedes saltarte:
- Escribe el test primero, verifica que falla, luego implementa. Si un paso dice
  "Run: pytest ... Expected: FAIL", ejecútalo de verdad y muéstrame la salida.
- Pega la salida real de los comandos. No la resumas de memoria.
- Las migraciones de Alembic autogeneradas salen mal con los enums: intenta
  crear tipos que ya existen y a veces renderiza CITEXT como VARCHAR. Revisa y
  corrige cada migración a mano, como dicen las tareas 4 y 8.
- Cada migración debe aplicar y revertir limpio contra una base vacía.
- No commitees ningún archivo .md.

Antes de empezar, lee CLAUDE.md del repo.
```

---

## P2 — Plan 2: Personal Finance & Transparency

```
Ejecuta docs/superpowers/plans/2026-09-02-personal-finance-and-transparency.md
tarea por tarea con la skill superpowers:executing-plans. Detente al terminar
cada tarea.

Este plan implementa el modelo de privacidad, que es la parte más sensible del
producto. Lee docs/visibility-rules.md completo antes de la tarea 7.

Cuatro cosas que no puedes "simplificar":
- El resolver no puede tener ninguna rama sobre el rol del que mira, salvo la
  negación al invitado. Si escribes `if role == "admin"` cerca de una lectura
  financiera, es un bug.
- Detalle y resumen son dos clases Pydantic separadas. Nunca una sola clase con
  campos excluidos al serializar.
- Un resumen lleva exactamente un número. Sin conteos, sin desglose por
  categoría, sin fechas más allá del periodo, sin paginación.
- Una negación siempre devuelve 403 not_visible, idéntica para "no existe",
  "es privado" y "otro hogar".

La tarea 9 usa /me/visibility, que construye la tarea 11. Implementa la 11 antes
de correr los tests de la 9, como dice el plan.

Si el test de matriz de la tarea 12 falla, arregla el código. Nunca la
aserción.
```

---

## P3 — Plan 3: Contribution & Dashboard

```
Ejecuta docs/superpowers/plans/2026-09-02-contribution-and-dashboard.md tarea
por tarea con la skill superpowers:executing-plans. Detente al terminar cada
tarea.

El corazón de este plan es la tarea 3: registrar un aporte escribe DOS filas
—el aporte y el gasto personal del que aportó— en una sola transacción de base
de datos. O existen ambas o ninguna. La tarea 4 lo prueba forzando un fallo a
mitad de camino.

Dos reglas que parecen mejoras y no lo son:
- Los totales del hogar incluyen a TODOS los miembros, también a los que
  pusieron sus finanzas en privado. Excluirlos haría el dashboard incorrecto y
  crearía una fuga nueva: un total que cambia cuando alguien mueve su
  configuración revela que la movió.
- El gasto que genera un aporte es un movimiento normal y se rige por la
  configuración de gastos del miembro, aunque el aporte siempre sea visible.
  Mismo hecho, dos superficies, dos reglas.

El dashboard serializa con exclude_none=True para que un módulo privado emita
{"level": "private"} y ningún campo de cifra. Si eso se rompe, aparecería
"total_minor": null, que ya es una revelación.
```

---

## P4 — Plan 5: Household Ledger & Installments (tareas 1 a 8)

```
Ejecuta docs/superpowers/plans/2026-09-03-household-ledger-and-installments.md
tarea por tarea con la skill superpowers:executing-plans.

Ejecuta SOLO las tareas 1 a 8. Las tareas 9 y 10 son interfaz y necesitan que la
aplicación web exista; las haremos después. Detente al terminar cada tarea.

La regla más fácil de romper de todo el proyecto está aquí: un aporte en especie
—cuando alguien paga un gasto del hogar de su bolsillo y lo marca como su
cuota— cuenta para la META del periodo pero NUNCA para el SALDO DEL POZO. Esa
plata fue de bolsillo a gasto y nunca llegó al pozo. Si la sumas al saldo, la
app reporta efectivo que la familia no tiene y van a intentar gastarlo.

Tres cosas que probablemente fallen y cómo reconocerlas:
- La ruta /pot debe declararse ANTES de /{expense_id}, o FastAPI intenta
  interpretar "pot" como UUID y devuelve un error de validación que parece un
  bug en otra parte.
- ALTER TYPE ... ADD VALUE en la migración 0010 puede fallar dentro de una
  transacción. Si pasa, sepáralo en su propia revisión previa.
- Si el test "in_kind never enters the pot" falla, el bug está en el filtro de
  pot_figures sobre Contribution.in_kind. Arregla la consulta, no el test.
```

---

## P5 — Plan 4: Web App

```
Ejecuta docs/superpowers/plans/2026-09-02-web-app.md tarea por tarea con la
skill superpowers:executing-plans. Detente al terminar cada tarea.

Antes de empezar: esta máquina tiene Node 14 y Next.js 15 necesita 20 o
superior. Verifica la versión y dime si hay que instalarlo antes de seguir.

Lee docs/design-system.md completo antes de la tarea 1. Existe porque Safari en
iOS tiene aristas que el desarrollo desde escritorio no revela, y ya está
reconciliado contra el diseño publicado.

Las pantallas están diseñadas. En cada tarea de interfaz, ANTES de escribir el
componente, abre su mockup: busca la tarea en la tabla de docs/design-index.md,
lee el artifact con la herramienta Artifact (action: "read") y desempaca el
<script type="__bundler/template"> del HTML guardado — ahí está el diseño con
estilos en línea legibles.

Dos correcciones al plan que debes aplicar, porque el plan se escribió antes que
el diseño y sus propios tests están mal:

- Tarea 3: formatMoney lleva `.replace(/\s/g, "")`, que borra el espacio. El
  diseño usa "$ 2.000.000" CON espacio. Quita ese replace y corrige las
  aserciones de los tests que esperan "$2.000.000".
- Tarea 4: PrivateBlock lleva una segunda línea que nombra al dueño, por
  ejemplo "Julián decidió no compartir este monto". "Privado" a secas se lee
  como que la app esconde algo; nombrar a la persona lo reencuadra como su
  decisión respetada.

Cuatro reglas que el plan verifica con tests y que no debes relajar:
- 100dvh, nunca 100vh. En Safari 100vh es la altura SIN la barra de
  herramientas, y el fondo de cada pantalla queda debajo de ella.
- Un módulo privado se dibuja con PrivateBlock: un panel gris con candado. Nunca
  un número borroso, nunca un esqueleto de carga, nunca "$—". El borroso invita
  a adivinar la magnitud y el esqueleto promete datos que no van a llegar.
- El service worker no cachea nunca /api. Una respuesta financiera cacheada
  sobrevive a la configuración de privacidad que la permitió.
- Los tokens van en cookies httpOnly, jamás en localStorage.

Cuatro pantallas están descritas en prosa y no en código (registro, finanzas, el
grupo de préstamos/aportes/hogar/miembros, y perfil). Cada una nombra su
endpoint, sus componentes, su copy en español y su estado vacío. Constrúyelas
componiendo los primitivos que ya existen en el plan.
```

---

## P6 — Plan 5: tareas 9 y 10 (interfaz)

```
Retoma docs/superpowers/plans/2026-09-03-household-ledger-and-installments.md en
la tarea 9 y termina el plan. Las tareas 1 a 8 ya están hechas.

Son dos tareas de interfaz sobre la web que ya existe: la pantalla del libro del
hogar con el saldo del pozo, y el resumen de cuotas dentro de la tarjeta de
deuda.

Abre los tres mockups antes de escribir nada — están en docs/design-index.md,
sección "Plan 5": Gastos del hogar, Registrar gasto del hogar, y Plan de cuotas.
Léelos con la herramienta Artifact y desempaca el template del HTML guardado.

Una corrección al plan: las cuotas también van en la FILA de la lista de deudas,
con el formato "2 sep · 14 de 36", no solo dentro de la tarjeta expandida. El
plan solo pone InstallmentSummary en DebtCard.

La pantalla del libro del hogar no lleva PrivateBlock en ninguna parte: los
gastos del hogar son dinero compartido y siempre son visibles para toda la
familia, incluido quién pagó.

Maneja los dos errores por su slug, no por el mensaje:
- insufficient_pot -> "El pozo no alcanza. Saldo disponible: $X."
- no_open_period -> "No hay un periodo de aportes abierto este mes."
```

---

## P7 — Plan 6: Household Chores

```
Ejecuta docs/superpowers/plans/2026-09-03-household-chores.md tarea por tarea
con la skill superpowers:executing-plans. Detente al terminar cada tarea.

Este módulo existe para que la familia deje de discutir quién hace más, así que
lo que se prueba es el algoritmo, no el CRUD.

Tres cosas que un agente tiende a "arreglar" y que romperían el módulo:
- Esto NO es una rotación. Round-robin fue rechazado porque ignora que trapear
  cuesta más que sacar la basura. Las tareas se asignan a quien tiene el balance
  de esfuerzo más bajo en la ventana móvil.
- El desempate es aleatorio de verdad. Ordenar por nombre o por fecha de ingreso
  le entrega la misma tarea a la misma persona para siempre.
- NO crees una tabla de deuda de esfuerzo para las ausencias. La compensación ya
  sale de la regla existente: quien está ausente no gana puntos, los demás sí, y
  al volver es el más bajo, así que el algoritmo le asigna más. Hay un test que
  verifica que esa tabla no exista.

Si el test "the spread stays within one chore" falla, casi seguro falta la
actualización provisional del balance dentro de generate_cycle: sin ella, todas
las tareas del ciclo caen sobre quien empezó más bajo.

Para la tarea 7, que es interfaz, abre antes los mockups de docs/design-index.md
sección "Plan 6": Tareas, Administrar tareas y Ausencias. Y el de "Cambios de
navegación", que define cómo queda la barra inferior con seis destinos.

Dos efectos esperados en otros planes:
- El test del Plan 4 que exige exactamente 5 pestañas va a fallar cuando agregues
  "Tareas". Es correcto; actualízalo a 6.
- La numeración de migraciones asume que el Plan 5 ya corrió.
```

---

## P8 — Completar el módulo 8 en la web: administrar tareas

Auditoría del 13 de septiembre: la API del módulo 8 está completa, pero ocho de
sus doce endpoints no tienen interfaz. Esto es culpa del plan, no de quien lo
ejecutó: la sección *File Structure* del Plan 6 promete cuatro componentes
—`ChoreCard`, `AssignmentRow`, `EffortBalanceBar`, `AbsenceForm`— y su tarea 7
solo pide dos. Se siguió la tarea al pie de la letra.

```
La API del módulo 8 está completa pero la web solo consume cuatro de sus doce
endpoints. Falta la pantalla de administración de tareas.

Agrega esto como tarea 8 al plan
docs/superpowers/plans/2026-09-03-household-chores.md, siguiendo el formato de
las demás tareas —archivos, interfaces, pasos con test primero— y luego
ejecútala. Detente al terminar para que la revise.

Pantalla: /tareas/admin, solo para administrador.

Mockup: abre el de "Administrar tareas" en docs/design-index.md, sección Plan 6.
Léelo con la herramienta Artifact y desempaca el template, como explica el
prompt auxiliar "Leer un mockup".

Endpoints que hoy no tiene consumidor y que esta pantalla debe usar:
  GET    /chores
  POST   /chores
  PATCH  /chores/{id}
  DELETE /chores/{id}
  POST   /effort-adjustments

Requisitos del spec que esto cubre: FR-M8-01, FR-M8-02, FR-M8-03, FR-M8-14.

Tres cosas que el diseño decidió y que importan:
- El selector de esfuerzo no es un campo numérico. Es un control que comunica
  peso relativo —diez puntos, o un deslizador de "Rápida" a "Pesada"— porque
  ese número decide a quién le toca todo.
- Un miembro que no es administrador ve la lista y los puntos, pero no puede
  editarlos. Debe leerse como "esto lo define el administrador", no como algo
  roto.
- El ajuste manual de esfuerzo exige motivo. Un ajuste sin explicación en un
  registro de equidad es indistinguible del favoritismo. El campo es
  obligatorio en la API; que también lo sea en el formulario.
```

---

## P9 — Completar el módulo 8 en la web: ausencias y reasignación

```
Siguen sin interfaz las ausencias y la reasignación de tareas. Agrega ambas
como tarea 9 al plan docs/superpowers/plans/2026-09-03-household-chores.md, con
el mismo formato, y ejecútala. Detente al terminar.

Parte A — Ausencias, en /ajustes/ausencias.

Mockup: "Ausencias" en docs/design-index.md, sección Plan 6.

Endpoints sin consumidor:
  GET    /me/absences
  POST   /me/absences
  DELETE /me/absences/{id}

Cubre FR-M8-12. La bajada de la pantalla debe explicar el mecanismo en una
línea: mientras estás ausente no se te asignan tareas, y al volver el sistema
te asigna más hasta emparejar. Eso no es letra chica: es la razón por la que
nadie sale premiado por viajar ni castigado por cubrir.

El motivo de la ausencia es opcional a propósito. Bajo el campo, en caption:
"Opcional. Tu familia ve que no estás; el porqué es cosa tuya."

En la tarjeta de esfuerzo de /tareas, un miembro ausente se dibuja con su barra
en gris apagado y la etiqueta "Ausente hasta el <fecha>" en lugar de los
conteos. No debe parecer que está incumpliendo.

Parte B — Reasignar, dentro de /tareas.

Endpoint sin consumidor:
  POST /chore-assignments/{id}/reassign

Cubre FR-M8-11. Cualquier miembro puede pasarle su tarea a otro. El crédito de
esfuerzo sigue a quien la hace, no a quien la tenía asignada — eso ya está
resuelto en la API, la interfaz solo debe dejarlo claro al usuario.
```

---

## Prompts auxiliares

### Revisar entre tareas

Cuando el agente diga que terminó una tarea, antes de dejarlo seguir:

```
Antes de pasar a la siguiente tarea, muéstrame:
1. La salida real de la suite completa de tests, sin resumir.
2. La salida de ruff check, mypy --strict y, si tocaste la web, tsc --noEmit.
3. El diff de los archivos que creaste o modificaste.
4. Qué requisitos del spec cubre esta tarea, por su ID.

Si algo falla, no sigas. Arréglalo y vuelve a mostrarme.
```

### Leer un mockup

Si el agente no sabe cómo abrir un diseño:

```
Los mockups son artifacts empaquetados. Para leer uno:

1. Artifact con action: "read" y la url de docs/design-index.md. Eso guarda el
   HTML completo en un archivo local y te dice la ruta.
2. Ese HTML es un contenedor: el diseño real está dentro de
   <script type="__bundler/template">, como JSON de una cadena.
3. Extráelo, decodifica el JSON y tendrás el HTML del diseño con estilos en
   línea perfectamente legibles. Si el template viene vacío, el contenido está
   en el <script type="__bundler/manifest">, donde cada entrada es base64 y,
   si trae "compressed": true, además gzip.

No leas los .js del paquete: son React y el runtime del editor, no el diseño.
```

### Retomar una sesión perdida

```
Estamos ejecutando docs/superpowers/plans/<archivo>.md. Revisa el historial de
git y el estado del repositorio para determinar en qué tarea quedamos, dime cuál
es y qué falta, y espera mi confirmación antes de continuar.
```

### Si el agente empieza a desviarse

```
Detente. Estás saliéndote del plan.

Vuelve a leer la tarea que estás ejecutando y haz exactamente lo que dice, ni
más ni menos. Si crees que el plan está mal, dímelo y discutámoslo, pero no lo
cambies por tu cuenta a mitad de la ejecución.
```

### Al terminar un plan

```
Terminaste el plan. Antes de cerrar:
1. Corre la suite completa y pégame la salida.
2. Verifica que todas las migraciones aplican y revierten limpio contra una base
   vacía.
3. Corre `make seed` (o su comando directo) y confirma que la Familia Hernández
   queda creada.
4. Repasa la auto-revisión al final del plan y dime si algún requisito quedó sin
   cubrir.
5. Dime qué encontraste que debería cambiar en el plan siguiente.
```

---

## Una nota sobre el orden

No ejecutes el Plan 6 antes del Plan 5 sin ajustar la numeración de las
migraciones: el `0011` del Plan 6 apunta a `0010_household_expenses`, que crea
el Plan 5. Si prefieres hacer tareas del hogar antes que el libro contable,
reapunta `0011` a `0008_contributions` — está anotado en la tarea 2 de ese plan.
