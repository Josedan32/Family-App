# Prompts de diseño — Family Hub

Trece prompts para Claude Design. Envíalos **en orden**: el P0 establece el
sistema y los demás lo heredan.

**Si abres una sesión nueva**, pega primero el *Bloque base* de abajo y luego el
prompt de la pantalla. Si sigues en la misma sesión del P0, manda el prompt solo.

Datos de ejemplo: la Familia Hernández del spec — Daniel (administrador, Hijo),
Papá y Mamá (adultos), Hermano (adolescente). Moneda COP, formato `$2.000.000`.

---

## Bloque base

Pégalo al inicio solo cuando empieces una sesión nueva.

```
Contexto: Family Hub, una app web responsive para una familia colombiana que
comparte finanzas del hogar. Se usa casi siempre desde iPhone en Safari, así que
el diseño es mobile-first. Toda la interfaz está en español (es-CO).

Sistema visual:
- Fondo #FAFAF9, superficies #FFFFFF, hundido #F5F5F4, bordes #E7E5E4.
- Texto #1C1917, texto secundario #78716C.
- Marca teal #0F766E. Ingresos #15803D, gastos #B91C1C, ahorros #1D4ED8,
  deudas #C2410C, privado #78716C (gris deliberado).
- Modo oscuro: fondo #1C1917, superficie #292524, y los colores semánticos dos
  pasos más claros (#4ADE80, #F87171, #60A5FA, #FB923C).
- Tipografía del sistema (-apple-system). Escala: display 2rem/700,
  título 1.25rem/600, cuerpo 1rem/400, etiqueta 0.875rem/500, caption 0.75rem.
- Las cifras de dinero SIEMPRE con numerales tabulares y como el elemento más
  grande de su fila.

Reglas que no se negocian:
- Alturas con 100dvh, nunca 100vh.
- Barra inferior y botones flotantes con padding de safe-area (notch/home bar).
- Área táctil mínima 44x44 px.
- Inputs con font-size mínimo 16px.
- Nada de estados que dependan solo de hover.
- El color nunca comunica solo: siempre hay además ícono, signo o etiqueta.
- Contraste WCAG AA en claro y oscuro.

Navegación: en móvil una barra inferior de 5 destinos — Inicio, Finanzas,
Aportes, Hogar, Ajustes. Desde 768px esa barra se convierte en sidebar
izquierdo y el contenido se limita a 72rem centrado.
```

---

## P0 — Sistema de diseño

```
Diseña la hoja de estilo base de Family Hub: una pantalla que muestre el sistema
completo, no una pantalla de la app.

Incluye:
1. La paleta de tokens en claro y oscuro, lado a lado, con el nombre semántico
   de cada uno (--bg, --surface, --border, --text, --text-muted, --brand,
   --income, --expense, --savings, --debt, --private) y su hex.
2. La escala tipográfica con un ejemplo de cada nivel, en español.
3. Botones en sus cuatro variantes: primario (teal sólido), secundario (borde),
   fantasma, peligro. Con estados normal, presionado y deshabilitado. Sin estado
   hover — es una app táctil.
4. Campos de formulario: texto, selector, fecha, y un campo de dinero mostrando
   "$2.000.000" con agrupación por puntos.
5. Tres insignias de visibilidad: "Privado" con candado en gris, "Resumen" con
   ojo tachado en gris, "Público" con ojo en teal.
6. El bloque "Privado": un panel gris apagado con candado y la palabra Privado.
   Es lo que ve alguien cuando otro miembro ocultó un dato. NO es un número
   borroso, NO es un esqueleto de carga, NO es "$—". Debe leerse como un estado
   final y tranquilo, no como un error ni como algo cargando.
7. Una tarjeta y una fila de lista de ejemplo.
8. Los cuatro estados de una lista: cargando (esqueletos con las dimensiones
   finales), vacía (ícono + una frase + la acción que la llena), error, y con
   datos.

Muéstralo todo en claro y oscuro.
```

---

## P1 — Iniciar sesión y registro

```
Diseña dos pantallas de autenticación para Family Hub, en móvil (375x812) y
escritorio.

Iniciar sesión:
- Título "Family Hub".
- Campos: Correo, Contraseña. Etiquetas visibles reales, no placeholders
  haciendo de etiqueta.
- Botón primario "Entrar".
- Enlace "Crear cuenta".
- Un estado de error mostrando "Correo o contraseña incorrectos" — el mismo
  mensaje sirve para correo inexistente y contraseña mala, a propósito, para no
  revelar si la cuenta existe.

Crear cuenta:
- Campos: Nombre, Correo, Contraseña.
- Una ayuda bajo la contraseña: "Mínimo 12 caracteres".
- Botón "Registrarme" y enlace "Ya tengo cuenta".

Ambas centradas verticalmente, ancho máximo 24rem, con aire generoso. El teclado
de iOS no debe tapar el botón: muestra también cómo se ve con el teclado abierto.
```

---

## P2 — Onboarding: crear o unirse a un hogar

```
Diseña la pantalla que ve alguien recién registrado, que todavía no pertenece a
ningún hogar. Móvil primero.

Título "Tu hogar". Debajo, dos pestañas: "Crear hogar" y "Unirme con código".

Pestaña Crear hogar:
- Campo "Nombre del hogar" con placeholder "Familia Hernández".
- Un texto pequeño: "Serás el administrador de este hogar."
- Botón "Crear".

Pestaña Unirme con código:
- Un campo para un código de 8 caracteres, centrado, grande, con numerales
  tabulares y letras muy espaciadas — se lee en voz alta de un lado del cuarto
  al otro, así que tiene que ser legible sin esfuerzo. Ejemplo: HJ4K9PQR.
- Botón "Unirme".
- Un estado de error mostrando "El código expiró".

El código nunca usa 0, O, 1, I ni L, para que nadie los confunda al dictarlos.
Refléjalo en el ejemplo que dibujes.
```

---

## P3 — Inicio (dashboard)

```
Diseña la pantalla principal de Family Hub. Es la pantalla más importante de la
app y donde el modelo de privacidad se vuelve visible.

Datos reales a usar:
- Totales del hogar del mes: Ingresos $5.500.000, Gastos $3.900.000,
  Ahorros $1.600.000.
- Aporte del hogar: meta $2.000.000, recaudado $1.900.000, 95%.

Estructura, de arriba abajo:
1. Título "Inicio".
2. Una tarjeta con los tres totales del hogar en tres columnas.
3. Justo debajo, en letra pequeña y gris: "Los totales del hogar incluyen a
   todos los miembros." Esta frase es obligatoria y no es decorativa: los
   totales suman también a quien ocultó sus cifras, y decirlo es lo que hace
   aceptable esa decisión.
4. La tarjeta de aporte del hogar con una barra de progreso al 95%, la meta y
   lo recaudado.
5. Sección "Miembros": una tarjeta por persona.

Cada tarjeta de miembro tiene avatar, nombre, parentesco, y una rejilla 2x2 con
Ingresos, Gastos, Ahorros y Deudas. Dibuja los cuatro casos:

- Papá — Padre: Ingresos $3.000.000 (resumen), Gastos $2.100.000 (resumen),
  Ahorros $900.000 (público), Deudas → bloque "Privado".
- Mamá — Madre: los cuatro con cifras visibles.
- Hermano — Hermano: los cuatro en bloque "Privado". Su tarjeta muestra
  únicamente avatar, nombre y parentesco. Sin ceros, sin guiones, sin números
  borrosos.
- Daniel — Hijo (el usuario actual): sus propias cifras siempre completas, aunque
  las tenga en privado para los demás.

Los bloques "Privado" no deben verse como un error ni como algo roto. Deben
verse como una decisión respetada.
```

---

## P4 — Finanzas (mi contabilidad)

```
Diseña la pantalla "Finanzas": la contabilidad personal del usuario. Cuatro
pestañas — Ingresos, Gastos, Ahorros, Deudas.

Pestaña Gastos (dibújala completa):
- Lista de movimientos. Cada fila: categoría en negrita, nota debajo en gris,
  fecha en caption, y a la derecha el monto grande con signo menos real (−) en
  rojo. Ejemplos: Comida / "Arroz 2kg" / 02 sep / −$15.000. Transporte / 01 sep
  / −$8.000. Aporte al hogar / 05 sep / −$1.000.000.
- La fila "Aporte al hogar" lleva una etiqueta pequeña "Aporte" y NO tiene
  acciones de editar ni borrar: se gestiona desde la pantalla de Aportes. Debe
  notarse que es distinta sin parecer deshabilitada por error.
- Un botón flotante circular para agregar, arriba de la barra inferior,
  respetando la safe area.

Pestaña Ingresos: mismas filas pero con signo más (+) en verde. Salario / 05 sep
/ +$3.000.000.

Pestaña Ahorros: tarjetas de meta. Cada una con nombre, saldo grande, barra de
progreso azul y porcentaje. Usa: Fondo de emergencia $2.400.000 de $3.000.000
(80%), Moto $5.200.000 de $8.000.000 (65%), Viaje familiar $800.000 de
$2.000.000 (40%).

Pestaña Deudas: tarjetas con acreedor, fecha de corte y saldo pendiente grande
en naranja. Usa: Addi - Celular, vence el día 15, $1.000.000. Banco - Libre
inversión, vence el día 5, $4.500.000.

Dibuja también el estado vacío de la pestaña Gastos: un ícono, la frase "Aún no
has registrado gastos", y el botón que lo resuelve.
```

---

## P5 — Hoja de nuevo movimiento

```
Diseña la hoja para registrar un ingreso o un gasto. En móvil sube desde abajo y
ocupa la pantalla; desde 768px es un modal centrado de máximo 32rem.

Contenido:
- Encabezado "Nuevo gasto" con una X para cerrar a la derecha.
- Campo de monto: el elemento más grande de la hoja, alineado a la izquierda,
  con "$" y agrupación por puntos mientras se escribe. Muestra "$15.000" a medio
  escribir. Debe abrir teclado numérico, no el alfabético.
- Selector "Categoría" con las opciones Transporte, Comida, Educación,
  Entretenimiento, Salud, Otros.
- Campo "Fecha" usando el selector nativo de iOS.
- Campo "Nota (opcional)".
- Botón primario "Guardar", ancho completo, pegado abajo con padding de
  safe-area.

Esta es la acción más repetida de toda la app y casi siempre se hace de pie en
una cocina. Debe poder completarse en menos de diez segundos y con una sola
mano: lo importante arriba, el pulgar alcanza todo.

Dibuja también la variante "Nuevo ingreso", donde el monto se muestra en verde.
```

---

## P6 — Préstamos entre miembros

```
Diseña la pantalla de préstamos dentro de una familia. Lo esencial: un préstamo
es un solo hecho que dos personas ven desde lados opuestos, y la pantalla tiene
que dejar eso claro sin explicarlo.

Tres tipos de tarjeta:
1. Presté: encabezado "Presté a Papá", fecha, estado "Pendiente", monto
   $300.000 en verde a la derecha.
2. Me prestaron: encabezado "Me prestó Mamá", fecha, estado "Pagado", monto
   $100.000 en naranja.
3. De terceros: encabezado neutral "Daniel → Papá", sin colores de bando, en
   tono más apagado. Es un préstamo entre otras dos personas que el usuario
   alcanza a ver.

Incluye filtros arriba: Todos / Presté / Me prestaron.

Y una hoja para crear un préstamo: selector de la otra persona (Papá, Mamá,
Hermano), campo de monto grande, fecha, fecha límite opcional, y botón
"Registrar préstamo".

Estados posibles: Pendiente, Abonado, Pagado, Cancelado. Que se distingan por
etiqueta y no solo por color.
```

---

## P7 — Aportes al hogar

```
Diseña la pantalla del aporte mensual al hogar. Es dinero compartido, así que
aquí no hay nada oculto: todos ven cuánto puso cada quien.

Arriba, la tarjeta del periodo:
- "Septiembre 2026".
- Meta $2.000.000, Recaudado $1.900.000 como la cifra más grande de la pantalla.
- Barra de progreso al 95% con el porcentaje al lado.

Debajo, la tabla de miembros. Cada fila con avatar, nombre, lo aportado y lo
esperado, más un indicador de si ya completó:
- Papá — $1.000.000 de $1.000.000 — completo.
- Mamá — $600.000 de $600.000 — completo.
- Daniel — $300.000 de $400.000 — le faltan $100.000.
- Hermano — $0 de $0 — sin cuota asignada.

Un botón "Registrar mi aporte" que abre una hoja con monto, fecha y nota.

Dibuja también el estado sin periodo abierto: "No hay un periodo abierto" y, si
el usuario es administrador, un botón "Abrir periodo"; si no lo es, solo el
mensaje.
```

---

## P8 — Hogar: miembros e invitaciones

```
Diseña la pantalla de administración del hogar, vista por un administrador.

Encabezado: "Familia Hernández", y debajo "4 miembros".

Lista de miembros. Cada fila: avatar, nombre, parentesco, edad, y una insignia
de rol. Los roles son Administrador (teal), Adulto, Adolescente, Invitado, y
deben distinguirse por texto, no solo por color.
- Daniel — Hijo — 23 años — Administrador
- Papá — Padre — 51 años — Adulto
- Mamá — Madre — 49 años — Adulta
- Hermano — Hermano — 16 años — Adolescente

Sección de invitaciones:
- Un botón "Crear invitación" que abre una hoja donde se elige el rol que otorga
  y la vigencia.
- El código generado se muestra grande, monoespaciado y muy espaciado, con un
  botón de copiar al lado. Ejemplo: HJ4K9PQR.
- Lista de códigos activos con su rol, vencimiento y un botón para revocar.
- Un código revocado se muestra tachado y en gris; revocar es irreversible, y la
  confirmación debe decirlo.

Nota importante para el diseño: ser administrador aquí es un rol de logística
—invitar, asignar roles, fijar la meta del hogar— y NO da acceso a las finanzas
de nadie. Que la pantalla no sugiera lo contrario en ningún momento.
```

---

## P9 — Finanzas de otro miembro

```
Diseña la pantalla que ve alguien al abrir el perfil financiero de otro miembro
del hogar. Es la pantalla donde el modelo de privacidad se pone a prueba, así
que necesito los tres niveles dibujados uno al lado del otro.

Encabezado común: avatar, nombre, parentesco, y un selector de mes.

Luego cuatro secciones — Ingresos, Gastos, Ahorros, Deudas — cada una con su
insignia de visibilidad. Dibuja las tres variantes:

1. Público: la sección muestra la lista completa de movimientos, con categoría,
   fecha, nota y monto. Insignia "Público".

2. Resumen: la sección muestra UN solo número grande y nada más. Ni cuántos
   movimientos hay, ni categorías, ni fechas, ni promedios, ni comparación con
   el mes pasado. Solo el total del periodo. Insignia "Resumen".

3. Privado: la sección es el bloque "Privado" con candado. Sin número, sin cero,
   sin guion, sin desenfoque. Insignia "Privado".

Ejemplo concreto para Papá: Ingresos en Resumen ($3.000.000), Gastos en Resumen
($2.100.000), Ahorros en Público (lista de metas), Deudas en Privado.

La sección en Resumen debe verse igual de completa y terminada que la Pública
—no como una versión mutilada— y la Privada debe verse tranquila, no rota.
```

---

## P10 — Ajustes: privacidad

```
Diseña la pantalla donde cada persona decide qué ve su familia sobre su dinero.
Es la pantalla que hace que la gente confíe lo suficiente como para meter cifras
reales, así que tiene que entenderse sin leer instrucciones.

Título "Privacidad". Bajada: "Decide qué ve tu familia sobre tus finanzas."

Cuatro bloques — Ingresos, Gastos, Ahorros, Deudas. Cada uno con:
- El nombre del módulo y su insignia de visibilidad actual a la derecha.
- Tres opciones seleccionables, cada una con su explicación en una línea:
  · Privado — "Nadie más ve nada."
  · Resumen — "Los demás ven solo el total."
  · Público — "Los demás ven cada movimiento."

Estado inicial a dibujar: Ingresos en Resumen, Gastos en Resumen, Ahorros en
Resumen, Deudas en Privado. Las deudas arrancan cerradas a propósito.

Abajo, en un panel gris apagado, dos avisos que son obligatorios:
"Los totales del hogar incluyen a todos. Tu configuración controla si los demás
ven tus números individuales, no si cuentas en el total del hogar."
"Los aportes al hogar siempre son visibles para toda la familia."

Estos dos textos no son letra chica legal: son la diferencia entre que alguien
descubra algo con sorpresa y que lo sepa desde el principio. Dales el peso
visual que merecen, sin volverlos una advertencia alarmante.

Incluye una vista previa opcional: "Así te ve tu familia", mostrando cómo queda
tu tarjeta en el Inicio de los demás con la configuración elegida.
```

---

## P11 — Ajustes: perfil

```
Diseña la pantalla de perfil propio.

Arriba, el avatar grande con opción de cambiar foto.

Campos editables: Nombre, Fecha de nacimiento.
Campo de solo lectura: Edad, calculada a partir de la fecha — se muestra pero no
se escribe.
Campo de solo lectura: Correo.

Debajo, una fila informativa con el hogar al que perteneces y tu rol:
"Familia Hernández · Administrador".

Al final, separado del resto y en variante secundaria discreta, un botón
"Cerrar sesión". No debe competir con los campos ni parecer la acción principal.

Si el usuario es el único administrador del hogar, muestra un aviso explicando
que no puede dejar de serlo hasta que otra persona lo sea.
```

---

## P12 — Identidad e íconos

```
Diseña la identidad mínima de Family Hub.

1. Un ícono de app cuadrado sobre teal #0F766E: una casa simple y geométrica en
   blanco. Debe leerse a 60px en una pantalla de inicio de iPhone. Dame también
   la variante enmascarable con margen de seguridad para Android.
2. Cómo se ve el ícono en la pantalla de inicio de un iPhone, junto a otras apps.
3. La pantalla de bienvenida al abrir como app instalada: fondo #FAFAF9, el
   ícono centrado y el nombre debajo.
4. El aviso de instalación: una barra discreta sobre la barra inferior que dice
   "Añade Family Hub a tu pantalla de inicio" con un botón "Entendido". Aparece
   una sola vez y se puede descartar.

Nada de degradados, nada de sombras largas, nada de estilo skeuomorfo. Es una
app de dinero familiar: debe verse tranquila y confiable, no llamativa.
```

---

## Módulos nuevos (libro del hogar, cuotas, tareas)

Siete prompts más, para lo que se agregó al spec el 3 de septiembre. Mismo
bloque base si abres sesión nueva.

Un cambio transversal antes de empezar: **la barra inferior pasa de cinco
destinos a seis**, con "Tareas" entre Aportes y Hogar. Seis todavía cabe cómodo
en un iPhone; siete ya no.

---

### P13 — Libro del hogar

```
Diseña la pantalla del libro contable del hogar, en /hogar/gastos. Es donde se
ve en qué se gastó el dinero que la familia recaudó.

Arriba, la tarjeta del pozo común:
- Etiqueta "Pozo del hogar".
- Saldo $700.000 como la cifra más grande de la pantalla.
- Debajo, en letra pequeña y en una sola línea: "Recaudado $1.900.000" y
  "Gastado $1.200.000".

Luego la lista de gastos del hogar. Cada fila lleva categoría, nota, fecha, y a
la derecha el monto grande más una etiqueta de quién lo pagó. Dibuja estos tres
casos, que son visualmente distintos:

1. Otros / "Arriendo septiembre" / 03 sep / $1.200.000 / etiqueta "Del pozo".
2. Comida / "Mercado de la semana" / 07 sep / $250.000 / etiqueta "Pagó Mamá".
3. Servicios / "Luz" / 08 sep / $180.000 / etiqueta "Pagó Papá" MÁS una segunda
   etiqueta en color de marca: "Cuenta como aporte".

Botón flotante para agregar, sobre la barra inferior, con safe area.

Importante: aquí NO existe el bloque "Privado" en ninguna parte. El dinero del
hogar es compartido y todos ven todo, incluido quién pagó cada cosa. Que la
pantalla se sienta abierta, sin candados ni zonas veladas — es lo contrario de
la pantalla de un miembro.

Dibuja también el estado vacío: "Aún no hay gastos del hogar" con el botón que
lo resuelve.
```

---

### P14 — Hoja de nuevo gasto del hogar

```
Diseña la hoja para registrar un gasto del hogar. Sube desde abajo en móvil,
modal centrado desde 768px.

Encabezado "Nuevo gasto del hogar" con X para cerrar.

Campos, en este orden:
1. Monto, grande, con "$" y agrupación por puntos. Muestra "$250.000".
2. Categoría (selector).
3. Fecha (selector nativo).
4. Nota (opcional).
5. Un selector de dos opciones para el fondeo, tipo segmentado, no un
   desplegable: "Del pozo" | "Lo pagué yo". Es la decisión más importante de la
   hoja y debe verse de un vistazo cuál está activa.
6. SOLO cuando está elegido "Lo pagué yo", aparece una casilla:
   "Que cuente como mi aporte del mes". Debajo, en caption gris:
   "El dinero salió de tu bolsillo, así que suma a la meta del hogar pero no al
   pozo."

Dibuja tres estados de la hoja:
- Con "Del pozo" elegido: la casilla de aporte no existe, y bajo el campo de
  monto se lee "Disponible en el pozo: $700.000".
- Con "Lo pagué yo" elegido y la casilla marcada.
- Un estado de error: "El pozo no alcanza. Saldo disponible: $700.000."

El botón "Guardar" ancho completo, abajo, con padding de safe area.
```

---

### P15 — Cuotas de créditos

```
Diseña dos cosas relacionadas con los créditos a cuotas, como Addi o una tarjeta.

Primero, la tarjeta de deuda con plan de cuotas. Sobre la tarjeta que ya existe
—acreedor, fecha de corte, saldo pendiente en naranja— agrega debajo un bloque
de cuotas con:
- "Cuota 2 de 12" a la izquierda.
- Una barra de progreso delgada, naranja, al 17%.
- "Próxima: $100.000 · 15 dic" en caption.

Dibuja cuatro variantes de esa tarjeta:
1. Al día, como arriba. Addi - Celular, saldo $1.000.000.
2. En mora: la misma, pero con una etiqueta "En mora" en rojo arriba a la
   derecha y la fecha de la próxima cuota también en rojo.
3. Plan completado: sin próxima cuota, con "Plan completado" en verde.
4. Sin plan de cuotas: Tío Jorge, $500.000, sin bloque de cuotas en absoluto.
   Un préstamo familiar no tiene calendario y la tarjeta no debe inventarle uno
   ni dejar un hueco donde iría.

Segundo, la sección opcional del formulario de deuda: un bloque plegable
"Plan de cuotas" con tres campos —número de cuotas, valor de la cuota, fecha de
la primera— y una nota: "Los tres o ninguno". Muestra el estado de error cuando
solo se llenaron dos.
```

---

### P16 — Tareas del hogar

```
Diseña la pantalla principal de tareas del hogar, en /tareas. Es el módulo que
existe para que la familia deje de discutir quién hace más, así que el reparto
del esfuerzo tiene que verse antes que la lista.

Arriba, la tarjeta "Esfuerzo del periodo": una barra horizontal por persona,
ordenadas de mayor a menor, cada una con nombre, puntos, y debajo en caption
"X hechas · Y pendientes". Usa:
- Daniel 34 pts — 11 hechas · 2 pendientes
- Papá 31 pts — 7 hechas · 1 pendiente
- Mamá 28 pts — 9 hechas · 0 pendientes
- Hermano 12 pts — 4 hechas · 3 pendientes

Las barras se escalan contra el más alto, no contra 100: lo que importa es la
distancia entre personas, no un puntaje absoluto. Que se vea de inmediato que
Hermano va muy por debajo.

Debajo, "Esta semana" con las tareas pendientes. Cada fila: nombre de la tarea,
a quién le tocó, fecha, los puntos de esfuerzo ("1 pt", "7 pts"), y un botón
"Hecha" a la derecha. Usa:
- Sacar la basura / Daniel / hoy / 1 pt
- Limpiar baño / Papá / 05 sep / 7 pts
- Cocinar / Mamá / hoy / 5 pts
- Trapear / Hermano / 06 sep / 5 pts

Al final, una sección plegada "Hechas" con las completadas en gris.

Los puntos de esfuerzo aparecen en todas partes a propósito: son la moneda del
sistema y la razón por la que el reparto es justo. No los escondas.

Dibuja también el estado sin ciclo: "No hay un ciclo activo" y, solo para
administrador, un botón "Generar ciclo".
```

---

### P17 — Administrar tareas

```
Diseña la pantalla de administración de tareas, visible solo para el
administrador.

Lista de tareas del hogar, ordenadas por esfuerzo ascendente. Cada fila:
nombre, frecuencia, y los puntos de esfuerzo destacados a la derecha. Usa las
siete que trae el sistema:
- Sacar la basura — Diaria — 1
- Tender camas — Diaria — 2
- Lavar platos — Diaria — 3
- Lavar ropa — Semanal — 4
- Cocinar — Diaria — 5
- Trapear — Semanal — 5
- Limpiar baño — Semanal — 7

Y una hoja para crear o editar una tarea con: nombre, descripción opcional,
frecuencia (Diaria / Semanal / Quincenal / Mensual), y un selector de esfuerzo
de 1 a 10.

Ese selector de esfuerzo merece cuidado: no un campo numérico, sino algo que
comunique peso relativo. Diez puntos en fila, o un deslizador con etiquetas en
los extremos ("Rápida" ... "Pesada"). Debajo, una ayuda: "Trapear pesa más que
sacar la basura. Este número decide a quién le toca."

Muestra el estado deshabilitado que ve un miembro que no es administrador:
puede ver la lista y los puntos, pero no editarlos. Que se lea como "esto lo
define el administrador", no como "algo se rompió".
```

---

### P18 — Ausencias

```
Diseña la gestión de ausencias, dentro de Ajustes.

Título "Mis ausencias". Bajada: "Mientras estés ausente no se te asignan tareas.
Al volver, el sistema te asigna más hasta emparejar."

Lista de ausencias registradas, cada una con rango de fechas y motivo opcional,
más un botón para eliminar. Usa:
- 01 sep – 14 sep · "Viaje a Medellín"
- 20 oct – 22 oct · sin motivo

Y una hoja para crear una: fecha de inicio, fecha de fin, motivo opcional. Bajo
el campo de motivo, en caption: "Opcional. Tu familia ve que no estás; el porqué
es cosa tuya."

En la pantalla de tareas, dibuja cómo se ve un miembro ausente dentro de la
tarjeta de esfuerzo: su barra en gris apagado con una etiqueta "Ausente hasta el
14 sep" en vez de los conteos. No debe parecer que está incumpliendo.
```

---

### P19 — Actualizaciones a pantallas existentes

```
Tres ajustes a pantallas que ya diseñaste, para que el sistema quede coherente.

1. Barra inferior: pasa de cinco destinos a seis. El orden es Inicio, Finanzas,
   Aportes, Tareas, Hogar, Ajustes. Redibújala con los seis y confirma que las
   etiquetas siguen legibles a 375px de ancho sin cortarse. En escritorio, el
   mismo cambio en el sidebar.

2. Pantalla de Inicio: agrega bajo la tarjeta de aportes una fila compacta con
   el pozo del hogar — "Pozo: $700.000" — enlazada al libro del hogar. Es una
   sola línea, no una tarjeta nueva: el Inicio ya está cargado y esto es un
   dato de paso, no un destino.

3. Pantalla de Hogar: agrega dos accesos, uno a "Gastos del hogar" y otro a
   "Administrar tareas" (este último solo para administrador), como filas de
   navegación bajo la lista de miembros.

Mantén todo lo demás igual. Muéstrame solo lo que cambia, en claro y oscuro.
```

---

## Orden sugerido

P0 primero, siempre. Después P3 (Inicio) y P10 (Privacidad): son las dos
pantallas que definen el carácter del producto, y lo que salga ahí condiciona
todo lo demás. Luego P4, P5, P7 (el uso diario), después P1, P2, P8, P9, P11, y
P12 al final.

Para los módulos nuevos: P16 (Tareas) antes que P17 y P18, porque la tarjeta de
esfuerzo define cómo se lee todo el módulo. P13 antes que P14. P19 al final de
todo, cuando ya existan las pantallas que actualiza.

Si algo de lo que te devuelva Claude Design contradice `docs/design-system.md`,
gana el documento — está escrito contra los problemas reales de Safari en iOS,
no contra un gusto.
