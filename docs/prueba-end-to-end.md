# Prueba end-to-end de Family Hub

Guion manual para recorrer los seis módulos y confirmar que funcionan de verdad,
no solo que los tests pasan.

**Lo que de verdad hay que probar a mano es el modelo de privacidad.** Todo lo
demás falla ruidosamente: una cifra mal sumada se ve, un botón roto no responde.
Una fuga de privacidad, en cambio, se ve perfectamente normal — el número
aparece donde no debería y nadie lo nota. Por eso la mitad de esta guía es
mirar lo que *no* debe estar.

---

## 1. Levantar todo

Tres terminales. Los comandos crudos van entre paréntesis porque en esta máquina
no hay `make`.

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

La API queda en `localhost:8001` (el 8000 lo tiene Docker Desktop) y la web en
`localhost:3000`, o el que `next dev` te diga si está ocupado.

**Comprobación mínima antes de seguir:** `http://localhost:8001/api/v1/health`
debe devolver `{"status":"ok"}`. Si no, nada de lo demás tiene sentido.

Para volver a empezar de cero en cualquier momento:

```
docker compose down -v && docker compose up -d db
```

Y repetir la migración y el seed.

---

## 2. Con quién entras

Contraseña de todos: **`correct-horse-battery`**

| Correo | Quién | Rol | Parentesco |
| ------ | ----- | --- | ---------- |
| `daniel@example.com` | Daniel | Administrador | Hijo |
| `papa@example.com` | Papá | Adulto | Padre |
| `mama@example.com` | Mamá | Adulta | Madre |
| `hermano@example.com` | Hermano | Adolescente | Hermano |

El seed les pone visibilidades distintas **a propósito**, para que las tres
combinaciones se vean desde el primer login:

| | Ingresos | Gastos | Ahorros | Deudas |
| - | -------- | ------ | ------- | ------ |
| Daniel | Resumen | Resumen | Resumen | Privado |
| Papá | Resumen | Resumen | **Público** | Privado |
| Mamá | **Público** | **Público** | **Público** | Resumen |
| Hermano | Privado | Privado | Privado | Privado |

### Cómo probar privacidad sin volverte loco

Necesitas ser dos personas al mismo tiempo. **Abre dos navegadores distintos**,
o uno normal y otro en ventana privada. No dos pestañas del mismo: comparten la
cookie de sesión y vas a estar cambiando de usuario sin darte cuenta, creyendo
que ves una fuga cuando solo te equivocaste de cuenta.

Sugerencia: **Daniel en un navegador, Hermano en el otro.** Hermano tiene todo
privado, así que es el mejor caso para detectar filtraciones.

---

## 3. Estado inicial que deja el seed

Antes de tocar nada, esto es lo que debería haber. Si algo no cuadra, el
problema es el seed y no lo que pruebes después.

**Aportes del mes**

| Miembro | Cuota esperada | Aportado |
| ------- | -------------- | -------- |
| Papá | $ 1.000.000 | $ 1.000.000 |
| Mamá | $ 600.000 | $ 600.000 |
| Daniel | $ 400.000 | $ 300.000 |
| Hermano | — | $ 0 |

Meta **$ 2.000.000**, recaudado **$ 1.900.000**, **95 %**.

**Libro del hogar**

- Arriendo, $ 1.200.000, **del pozo**
- Mercado de la semana, $ 250.000, **pagó Mamá**

Pozo: recaudado $ 1.900.000 − gastado $ 1.200.000 = **saldo $ 700.000**.

**Tareas:** un ciclo generado para el mes, con la mitad de las asignaciones ya
marcadas como hechas.

---

## 4. Recorrido por módulo

### Módulo 1 — Hogar

Con **Daniel** (administrador), en `/hogar`:

- [ ] Se ven los cuatro miembros con nombre, parentesco, edad y rol.
- [ ] Crear una invitación. El código tiene **8 caracteres** y no contiene
      `0`, `O`, `1`, `I` ni `L` — están excluidos para poder dictarlo en voz
      alta sin confusiones.
- [ ] Cambiar el parentesco de alguien y ver que persiste al recargar.
- [ ] **Intenta quitarte a ti mismo el rol de administrador.** Debe rechazarlo:
      eres el único, y el hogar no puede quedarse sin ninguno.
- [ ] Revocar una invitación. Desaparece de las activas y no se puede reactivar.

Con **Papá** (no administrador):

- [ ] No puede crear invitaciones ni cambiar roles. Debe leerse como "esto lo
      hace el administrador", no como un error.

Prueba completa de invitación, si quieres: crea un código, ábrelo en una ventana
privada, regístrate con un correo nuevo y únete. Debería entrar con el rol que
diga el código.

### Módulo 2 — Finanzas personales

Con cualquiera, en `/finanzas`:

- [ ] **Ingresos:** registrar uno. Aparece en verde con **`+`**.
- [ ] **Gastos:** registrar uno. Aparece en rojo con **`−`** — el signo menos
      de verdad (`−`), no un guion.
- [ ] El monto se escribe con teclado numérico y se agrupa solo:
      `2000000` → **`$ 2.000.000`**, con espacio después del `$`.
- [ ] **Ahorros:** crear una meta, abonar, retirar. El saldo es la resta, y el
      porcentaje se calcula contra la meta.
- [ ] **Deudas:** crear una con plan de cuotas — por ejemplo 12 cuotas de
      $ 100.000 desde el 15 del mes que viene. La fila debe mostrar el avance
      (`cuota 0 de 12`) y la tarjeta el detalle con la próxima fecha.
- [ ] Registra dos pagos y comprueba que avanza a `cuota 2 de 12` y que la
      próxima fecha se corre dos meses.
- [ ] **Borra un pago.** El calendario debe retroceder. Nada está guardado en
      una columna: todo se recalcula.
- [ ] Crea una deuda **sin** plan de cuotas. La tarjeta no debe inventar un
      calendario ni dejar un hueco vacío donde iría.

**Préstamos**, en `/finanzas/prestamos`:

- [ ] Daniel le presta $ 300.000 a Papá.
- [ ] En la sesión de Daniel se lee **"Presté a Papá"** en verde.
- [ ] En la de Papá, **"Me prestó Daniel"** en naranja. Mismo monto, misma
      fecha: es una sola fila leída desde los dos lados.
- [ ] Papá registra un abono de $ 100.000. **Daniel lo ve al instante.** Si las
      dos vistas pudieran discrepar, aquí se vería.
- [ ] Solo el prestamista puede cancelar el préstamo.

### Módulo 3 — Transparencia

**Este es el módulo que importa.** Necesitas los dos navegadores.

Con **Daniel** mirando a los demás en `/hogar/miembros/[id]`:

- [ ] **Mamá** → Ingresos y Gastos en **Público**: se ve la lista completa de
      movimientos, con categoría, fecha y nota.
- [ ] **Papá** → Ingresos en **Resumen**: se ve **un solo número**. Ni cuántos
      movimientos hay, ni categorías, ni fechas, ni promedios.
- [ ] **Papá** → Deudas en **Privado**: bloque gris con candado que dice
      **"Privado"** y, debajo, *"Papá decidió no compartir este monto"*.
- [ ] Ese bloque **no** es un número borroso, **no** es un esqueleto de carga y
      **no** dice `$—`. Si ves cualquiera de esas tres cosas, es un defecto.
- [ ] **Hermano** → los cuatro módulos privados. Su tarjeta en el Inicio muestra
      solo nombre, parentesco y foto. **Ningún cero, ningún guion.**

Cambio en caliente, con los dos navegadores abiertos:

- [ ] Hermano entra a `/ajustes/privacidad` y pone Ingresos en **Público**.
- [ ] Daniel recarga y **ya lo ve**. Sin esperas, sin caché.
- [ ] Hermano lo devuelve a Privado. Daniel recarga y desaparece.

Y lo que no debe pasar:

- [ ] **Daniel es administrador y aun así no ve las deudas de Papá.** Ser
      administrador sirve para invitar y asignar roles, no para leer el dinero
      de nadie. Si alguna vez ves lo contrario, el modelo se rompió.
- [ ] Hermano, con todo en privado, **sigue viendo sus propias cifras
      completas** en `/finanzas`. La configuración dice qué ven los demás, no
      qué ves tú.
- [ ] En `/ajustes/privacidad` deben aparecer los dos avisos, tal cual: que los
      totales del hogar incluyen a todos, y que los aportes siempre son
      visibles para toda la familia.

### Módulo 4 — Aportes y libro del hogar

En `/aportes`:

- [ ] La tarjeta del periodo muestra meta $ 2.000.000, recaudado $ 1.900.000 y
      **95 %**.
- [ ] La tabla muestra a los cuatro. A Daniel le faltan $ 100.000.
- [ ] Registra un aporte de $ 100.000 con Daniel. El recaudado sube a
      $ 2.000.000 y el porcentaje a 100 %.
- [ ] **Ve a `/finanzas` de Daniel:** ese aporte aparece como gasto en su
      contabilidad personal, categoría *Aporte al hogar*. Se escribieron dos
      filas en una sola operación.
- [ ] Ese gasto **no se puede editar ni borrar** desde finanzas. Se gestiona
      desde aportes.

En `/hogar/gastos`:

- [ ] Saldo del pozo **$ 700.000**, recaudado $ 1.900.000, gastado $ 1.200.000.
      (Después del aporte de arriba será $ 800.000.)
- [ ] Se ven los dos gastos: Arriendo con la etiqueta **"Del pozo"** y Mercado
      con **"Pagó Mamá"**.
- [ ] Registra un gasto **del pozo** por más del saldo. Debe rechazarlo con
      *"El pozo no alcanza"*. El hogar no puede gastar lo que no recaudó.
- [ ] Registra uno **pagado por ti** y marca *"Que cuente como mi aporte del
      mes"*. Ahora viene la parte fina:
      - El **recaudado** del periodo sube.
      - **El saldo del pozo NO sube.** Ese dinero fue de tu bolsillo al gasto y
        nunca entró al pozo. Si el saldo subiera, la app estaría reportando
        efectivo que la familia no tiene.
      - En tu contabilidad personal aparece **un solo** gasto, no dos.
- [ ] En esta pantalla **no hay ningún bloque "Privado"**. El dinero del hogar
      es compartido y todos ven todo, incluido quién pagó.

### Módulo 8 — Tareas del hogar

En `/tareas`:

- [ ] La tarjeta de esfuerzo va arriba, con una barra por persona ordenadas de
      mayor a menor. Las barras se escalan contra el más alto, no contra 100.
- [ ] Cada tarea muestra sus puntos (`1 pt`, `7 pts`). No los escondas mentalmente:
      son la moneda del sistema.
- [ ] Marca una como hecha. Los puntos se suman a quien la hizo y la barra se
      mueve.
- [ ] **Reasigna una tarea a otra persona** y que esa persona la complete. El
      crédito va a **quien la hizo**, no a quien la tenía asignada.

En `/tareas/admin`, con Daniel:

- [ ] Se ven las siete tareas base con su esfuerzo: Sacar la basura 1, Tender
      camas 2, Lavar platos 3, Lavar ropa 4, Cocinar 5, Trapear 5, Limpiar baño 7.
- [ ] Crear una tarea nueva. El selector de esfuerzo **no es un campo
      numérico**: comunica peso relativo.
- [ ] Cambia el esfuerzo de una tarea ya asignada. **Las asignaciones que ya
      existen conservan su puntaje viejo.** Re-tarifar no reescribe la historia.
- [ ] Registra un ajuste manual de esfuerzo. **Exige motivo**: un ajuste sin
      explicación en un registro de equidad es indistinguible del favoritismo.

Con **Papá** (no administrador):

- [ ] Ve las tareas y sus puntos, pero no puede editarlos.

En `/ajustes/ausencias`:

- [ ] Declara una ausencia de una semana.
- [ ] Genera un ciclo nuevo que la cubra: **no te asignan nada** en esas fechas.
- [ ] En la tarjeta de esfuerzo apareces como *"Ausente hasta el …"*.
- [ ] Al volver, el siguiente ciclo te asigna **más de lo normal** hasta
      emparejar. No hay ninguna tabla de deudas detrás: mientras no estabas no
      ganaste puntos, los demás sí, y al volver eres el más bajo.

Prueba larga que vale la pena, si tienes diez minutos: genera cuatro o cinco
ciclos seguidos completando todo. **La diferencia entre el que más puntos tiene
y el que menos no debería superar el peso de una sola tarea.** Ese es el
objetivo entero del módulo.

### Inicio y navegación

- [ ] El Inicio muestra los totales del hogar, la frase *"Los totales del hogar
      incluyen a todos los miembros"*, el progreso de aportes y una tarjeta por
      persona.
- [ ] **Los totales incluyen a Hermano**, aunque tenga todo privado. Eso es
      correcto y por eso la frase está ahí.
- [ ] La barra inferior tiene **seis destinos**: Inicio, Finanzas, Aportes,
      Tareas, Hogar, Ajustes.
- [ ] Desde 768 px de ancho, la barra se convierte en menú lateral.

---

## 4.5 Lo que cambió en esta ronda

Esto es nuevo o se arregló después de una ronda de pruebas manuales. No repite
lo de arriba — solo lo que hay que confirmar ahora.

**Hogar**

- [ ] En `/hogar`, la edad de Daniel (admin) no aparece si nunca puso su fecha
      de nacimiento. Debajo de su fila hay un enlace **"Agrega tu fecha de
      nacimiento"** que lleva a `/ajustes/perfil`. No es un bug de privacidad:
      simplemente nadie la pidió al crear el hogar.
- [ ] Con Daniel, cada miembro tiene un botón **"Editar"** que abre un modal
      para cambiar rol y parentesco. Guarda y confirma que persiste.
- [ ] Ese modal **no muestra ninguna cifra financiera** del miembro editado.
- [ ] Los textos de ayuda largos (sobre el formato del código, sobre qué puede
      ver cada rol) ya no están — ni en `/hogar` ni en el onboarding.

**Transparencia**

- [ ] Las tarjetas de miembro en el Inicio son clicables y llevan a
      `/hogar/miembros/[id]`.
- [ ] Ya no aparece la frase "decide qué comparte. Su aporte al hogar siempre
      es visible..." en el perfil de un miembro.

**Finanzas personales**

- [ ] Al registrar un ingreso o gasto, el selector de categoría permite marcar
      **más de una**. La fila del movimiento muestra el nombre como título y
      cada categoría como su propia pill.
- [ ] La categoría de sistema **"Aporte al hogar" no aparece** en ese selector
      — solo la usa el módulo de Aportes internamente.
- [ ] El campo de monto siempre muestra el signo `$`; en ingreso es verde con
      `+$`, en gasto rojo con `−$`.
- [ ] Cada ingreso/gasto manual tiene **Editar** y **Eliminar** en su fila. Un
      aporte reflejado (fondo gris, badge "Aporte") no los tiene.
- [ ] En **Ahorros**, cada meta se puede expandir para **Abonar**, **Retirar**
      y **Ver actividad** (lista con fecha, tipo y monto con signo).
- [ ] En **Deudas**, al crear puedes marcar "Tiene un plan de cuotas" (número
      de cuotas, valor, primera fecha). Cada deuda se expande para ver sus
      pagos, registrar un abono y **eliminarla** — el borrado se rechaza con
      un mensaje si ya tiene pagos.
- [ ] **Préstamos** ya no es una URL secreta: hay un enlace desde `/finanzas`.
      Cada préstamo se expande para ver fechas, nota, el historial de pagos,
      registrar un abono, y cancelarlo (solo quien prestó).
- [ ] Deja el monto en blanco y sal del campo (sin enviar el formulario): el
      campo se marca en rojo con el mensaje de error **antes** de darle
      guardar. Prueba esto en Aportes, Ingresos/Gastos, Ahorro, Deuda,
      Préstamo y Gasto del hogar.

**Aportes**

- [ ] Debajo de la lista de "Quién aportó" hay una sección **"Mis aportes"**
      con cada aporte propio del periodo, y botones Editar/Eliminar.
- [ ] Edita un aporte: el monto en el libro del hogar (gasto espejo) cambia
      igual.
- [ ] En el teléfono, el botón "Registrar mi aporte" ya no choca con la barra
      inferior ni con el contenido al hacer scroll.

**Tareas del hogar**

- [ ] Los textos "Los puntos de esfuerzo se usan para...", "Este número
      decide...", "El orden importa..." y "La ruleta reparte
      equilibrando..." ya no aparecen en ningún lado.
- [ ] El aviso de "Máximo 20..." se ve en tono ámbar/advertencia, no gris.
- [ ] Los pasos e insumos del catálogo se ven agrupados dentro de un borde,
      no como controles sueltos.
- [ ] Al pulsar "Ver el sorteo", bajo la ruleta aparece un texto que cambia
      rápido entre distintas combinaciones tarea → persona (como una
      tragamonedas) antes de asentarse en el resultado real.
- [ ] En `/tareas` hay un selector **"Ver: Todos / Mis tareas / <nombre>"**
      que filtra las tareas pendientes y hechas por miembro.
- [ ] En `/tareas/admin`, al crear o editar una tarea hay un interruptor
      **"Aplica para todos"**. Márcalo en una tarea (p. ej. "Tender la cama")
      y genera un ciclo: cada miembro elegible recibe **su propia**
      asignación de esa tarea, no se reparte entre uno solo.
- [ ] La primera vez que entras a `/tareas` después de un sorteo nuevo, el
      Inicio muestra una card **"Hay un sorteo nuevo"**. Al visitar Tareas,
      la card desaparece — pero solo para ti; otro miembro que no haya
      entrado todavía sigue viéndola. Un sorteo nuevo la trae de vuelta para
      todos.

---

## 5. Prueba en el teléfono

Lo importante de esta sección es que Safari en iOS rompe cosas que en el
escritorio se ven perfectas. Entra desde el iPhone a `http://<tu-ip>:3000`.

- [ ] Ningún contenido queda debajo de la barra de Safari ni del indicador de
      inicio.
- [ ] Al tocar un campo de monto **la página no hace zoom** y sale el teclado
      numérico.
- [ ] Al llegar al final de una lista larga, la página no rebota.
- [ ] "Añadir a pantalla de inicio": el ícono es la casa y el nombre
      **Family Hub**. Abre en modo aplicación, sin barra del navegador.
- [ ] Cambia el teléfono a modo oscuro. Todo el texto sigue legible, y los
      paneles hundidos **se distinguen del fondo** — no deben desaparecer.

---

## 6. Las trampas

Cosas que se ven bien y están mal. Si encuentras alguna, es un defecto real, no
una preferencia.

| Lo que ves | Por qué está mal |
| ---------- | ---------------- |
| Un número borroso donde debería decir "Privado" | Invita a adivinar la magnitud. El bloque privado es un estado final, no un velo. |
| `$—` o un `0` en un módulo privado | Un cero dice "no tiene nada", que es información que nadie autorizó a dar. |
| Un esqueleto de carga permanente en un módulo privado | Promete datos que no van a llegar. |
| El administrador viendo cifras de otro | El modelo se rompió. Ningún rol pasa por encima de la privacidad. |
| El saldo del pozo sube con un aporte en especie | Reporta efectivo que la familia no tiene. |
| `$2.000.000` sin espacio después del `$` | El diseño lo lleva con espacio. |
| Un guion `-` en vez del signo menos `−` | Detalle tipográfico, pero está especificado. |
| El mismo miembro con la misma tarea varias semanas seguidas | El desempate debe ser aleatorio. Si es predecible, alguien lo hizo determinista. |
| Una tarea que cambió de puntaje y reescribió asignaciones viejas | El puntaje se congela al asignar. |

---

## 7. Checklist rápido

Si solo tienes diez minutos, haz esto:

1. Entra como Daniel y como Hermano en dos navegadores.
2. Mira a Hermano desde Daniel: **cuatro bloques privados, ningún número**.
3. Hermano pone Ingresos en Público; Daniel recarga y lo ve. Devolver a Privado.
4. Daniel intenta ver las deudas de Papá: **denegado**, aunque sea administrador.
5. Registra un aporte y confirma que aparece como gasto personal.
6. Registra un gasto del hogar pagado por ti y marcado como aporte: sube el
   recaudado, **no** sube el pozo.
7. Marca una tarea como hecha y mira moverse la barra de esfuerzo.
8. Abre en el iPhone y confirma que no hay zoom al tocar un monto.

Eso toca los seis módulos y las tres reglas que más cuesta acertar.
