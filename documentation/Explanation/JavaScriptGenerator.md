# Explicación — `src/javascriptGenerator.ts`

Este módulo implementa la **Fase 3 del plan** (`documentation/5-Compilador.md`): el **generador de código** del compilador TyScript. Toma los **cuádruples optimizados** producidos por la Fase 2 y emite un **programa objeto en JavaScript**, junto con el preámbulo de runtime que da soporte a `stack`, `queue`, arreglos, `print` y `read`.

El objetivo no es "traducir cuádruple por cuádruple" sino reconstruir el flujo de control que los saltos y etiquetas representan, para que el resultado sea JavaScript legible con `while`, `if/else`, `break`, etc. Si esa reconstrucción no es posible, el módulo degrada con seguridad a una **máquina de estados** equivalente.

### 1. API pública

* **`RUNTIME_SOURCE`**: texto JS del preámbulo `CompilerRuntime`, autocontenido y sin dependencias de Node. Es el bloque que se incrusta al inicio del programa objeto.
* **`createCompilerRuntime(): CompilerRuntimeApi`**: evalúa `RUNTIME_SOURCE` con `new Function` y devuelve una **instancia nueva y aislada** del runtime. Se usa en los tests y en el futuro runner de la Fase 4, donde el cuerpo generado se ejecuta con `new Function("CompilerRuntime", body)`.
* **`generateJavaScript(quads, options?)`**: recibe `Quad[]` (preferentemente optimizados) y devuelve `JavaScriptOutput`.
* **`generateProgramObject(input)`**: produce `ProgramObject` con el código JS y el reporte de IR (intermedio + optimizado) para los archivos de `out/`.
* **`programObjectPaths(programName)`**: nombres por defecto `out/<program>.js` y `out/<program>.ir.txt`.

Tipos principales:

```ts
interface JavaScriptOutput {
    code: string;          // programa objeto completo: runtime + cuerpo
    body: string;          // solo el cuerpo (lo ejecuta el runner con el runtime externo)
    structured: boolean;   // true = flujo estructurado; false = máquina de estados
    runtimeSource: string; // copia de RUNTIME_SOURCE
}

interface ProgramObject {
    programName: string;
    code: string;        // contenido de out/<program>.js
    body: string;        // cuerpo ejecutable, reutilizado por el runner de la Fase 4
    structured: boolean; // estrategia de flujo usada
    ir: string;          // contenido de out/<program>.ir.txt
}
```

La separación entre `code` y `body` es deliberada:

* `code` sirve para **escribir un archivo autónomo** que se ejecuta con `node out/program.js`.
* `body` sirve para **ejecutarlo en un runner aislado** que ya posee una instancia de `CompilerRuntime`, sin duplicar el runtime ni contaminar `globalThis`.

### 2. Runtime `CompilerRuntime`

El preámbulo define un objeto con estado privado por instancia:

* **`output`**: arreglo donde se acumula todo lo impreso. Es la vía de verificación de los tests (los `print` se comparan contra la salida esperada).
* **`print(value)`**: agrega a `output` y, salvo que el runtime esté silenciado, hace `console.log(value)`. Así el runner muestra la salida y los tests pueden capturarla.
* **`setSilent(bool)` / `reset()`**: control de consola y limpieza de salida/entrada.
* **`read()`**: consume el siguiente valor de la entrada configurada con `setInput([...])`, convirtiendo `"true"`/`"false"` y cadenas numéricas a sus tipos reales. Si no hay entrada disponible, lanza un error explicativo. La lectura real desde `stdin` queda a cargo del runner de la Fase 4, que puede precargar líneas con `setInput`.
* **`newStack()` / `newQueue()` / `newArray()`**: constructores de valores del lenguaje.

Las estructuras respetan la semántica validada por el análisis semántico:

* `TyStack`: `push`, `pop`, `peek`, `isEmpty`, `size`, `clear` sobre un arreglo interno.
* `TyQueue`: `enqueue`, `dequeue`, `front`, `isEmpty`, `size`, `clear` con un índice `head` para que `dequeue` sea O(1) amortizado; compacta el arreglo cuando conviene.
* Un arreglo TyScript es simplemente un `Array` de JavaScript.

### 3. Sanitización y declaración de variables

Los cuádruples usan nombres del lenguaje (`x`, `i`, `t0`, ...) que podrían colisionar con palabras reservadas de JS o con nombres del runtime. Para evitarlo:

* **`variableName(operand)`** mapea variables a `__v_<nombre>` y temporales a `__t_<nombre>`.
* **`sanitizeIdentifier()`** reemplaza cualquier carácter no alfanumérico por `_` y antepone `_` si empieza con dígito.
* Los prefijos garantizan que un usuario llamado `CompilerRuntime`, `t0` o `Math` nunca choque con el runtime ni con los temporales.

`collectDeclarations(quads)` recorre todos los operandos de tipo `var`/`temp` y genera **una declaración `let` única al inicio del cuerpo**. Declarar antes de usar evita problemas de *temporal dead zone* y permite que el mismo nombre se reutilice en ramas distintas.

### 4. Mapeo de cuádruples (`simpleQuadToJs`)

La traducción directa de operaciones es:

| Cuádruple | JavaScript emitido |
|---|---|
| `+ - * %` y comparaciones | operadores nativos (`===`/`!==` para `==`/`!=`) |
| `/` | `Math.trunc(a / b)` — división entera del lenguaje |
| `&&`, `\|\|`, `!`, `neg` | operadores nativos |
| `:=` | asignación simple |
| `print x` | `CompilerRuntime.print(x);` |
| `read x` | `x = CompilerRuntime.read();` |
| `new_stack/new_queue/new_array` | constructores del runtime |
| `idx_load` / `idx_store` | `t = a[i]` / `a[i] = v` |
| `push/enqueue/clear` | llamada al método del objeto |
| `pop/peek/front/dequeue/size/isEmpty` | llamada con valor de retorno |

Si aparece una operación desconocida, `simpleQuadToJs` lanza un error: es preferible fallar ruidosamente antes que generar código incorrecto.

### 5. Flujo estructurado (`StructuredEmitter`)

Antes de emitir, la clase construye dos índices:

* **`labelIndex`**: nombre de etiqueta → posición del cuádruple `label`.
* **`backEdges`**: etiqueta de cabecera → posiciones de los saltos que van **hacia atrás** a esa etiqueta. Un salto hacia atrás es exactamente lo que define un bucle.

Luego recorre los cuádruples con `emitRange(start, end)` y en cada posición decide:

1. **Etiqueta con saltos hacia atrás** → es una cabecera de bucle; delega en `emitLoop()`.
2. **`if_false`** → construye un `if` estructurado con `emitIf()`.
3. **`goto` inesperado** → marca el flujo como no estructurable.
4. Cualquier otra operación → una línea de `simpleQuadToJs()`.

#### Bucles tipo `while` / `for`

El patrón canónico es:

```
L0:
  <cálculo de condición>
  if_false c goto L1
  <cuerpo>
  goto L0
L1:
```

El emisor localiza el salto de vuelta (`backEdges`), el guardián `if_false` que apunta a la etiqueta de salida y produce:

```js
while (true) {
  <cálculo de condición>
  if (!(c)) break;
  <cuerpo>
}
```

El `goto L0` final no se emite: al llegar al cierre del `while` el bucle se repite de forma natural. El `for` encaja en el mismo molde porque su `update` ya forma parte del cuerpo antes del salto de vuelta.

#### Bucles `do-while`

El generador de IR produce `t = !cond` y un `if_false t goto L0` al final. Aquí no hay guardián al inicio; el salto de vuelta es condicional. Se traduce a:

```js
while (true) {
  <cuerpo>
  if (t) break;
}
```

Como `t` es la negación de la condición, cuando la condición original es falsa se sale; en caso contrario se alcanza el final del cuerpo y se repite. Esto preserva la garantía de que el cuerpo se ejecuta al menos una vez.

#### `if` / `if-else`

Para `if_false c goto Lx`:

* **Sin `else`**: el cuerpo va desde la instrucción siguiente hasta la etiqueta `Lx`. Se emite `if (c) { ... }`.
* **Con `else`**: el cuádruple inmediatamente anterior a `Lx` es un `goto Lend`. Entonces `Lx` es la etiqueta del *else* y `Lend` la del cierre. Se emite `if (c) { <then> } else { <else> }`, consumiendo el `goto Lend` y ambas etiquetas.

Las ramas se procesan recursivamente con `emitRange`, por lo que `if` anidados, `else if` y bucles dentro de una rama funcionan sin casos especiales.

#### Degradación segura

Si el emisor encuentra un flujo que no encaja en los patrones (por ejemplo un `goto` sin estructura reconocible), activa `unsupported`. `buildStructuredBody()` devuelve `null` y `generateJavaScript` recurre a la máquina de estados. Nunca se emite JavaScript a medias.

### 6. Fallback: máquina de estados

`buildStateMachineBody(quads)` genera un intérprete plano del IR:

```js
let __pc = 0;
const __quadCount = N;
while (__pc < __quadCount) {
  switch (__pc) {
    case 0:
      // operación
      __pc = 1;
      break;
    ...
  }
}
```

* `label` avanza el contador.
* `goto` salta a la posición de la etiqueta.
* `if_false` elige entre `i + 1` y la etiqueta destino.
* Las operaciones normales se emiten con `simpleQuadToJs` y avanzan.

Es menos legible, pero **semánticamente exacto para cualquier CFG** y sirve de red de seguridad. El campo `structured` de la salida permite saber qué estrategia se usó.

### 7. Programa objeto

`generateProgramObject()` integra el resultado de la fase con el reporte de inspección:

* **`.js`**: `"use strict";` + comentario del programa + `RUNTIME_SOURCE` + declaraciones + cuerpo.
* **`.ir.txt`**: los cuádruples intermedios (si se pasan) y los optimizados, usando `formatQuads()` de `irFormatter.ts`.

Los nombres por defecto los da `programObjectPaths(programName)`. La escritura física de los archivos y el runner CLI pertenecen a la Fase 4 (`src/compile.ts`), que puede reutilizar directamente `generateProgramObject()` y `createCompilerRuntime()`.

### 8. Validación

Antes de generar nada, `generateJavaScript` llama a `findBrokenJumps()` de `src/ir.ts`:

* Si hay un `goto` o `if_false` hacia una etiqueta inexistente, lanza un error con el índice y el destino del salto.
* Esto impide producir objetos JS con saltos rotos y complementa las comprobaciones del optimizador.

### 9. Pruebas (`src/tests.ts`)

La sección **FASE 3** agrega `runJavaScriptTest()`, que:

1. Ejecuta el análisis y aborta si hay errores semánticos.
2. Genera IR y lo optimiza.
3. Genera el JS optimizado y lo ejecuta con una instancia silenciosa de `CompilerRuntime`.
4. Compara `output` con la expectativa.
5. Ejecuta también el IR **sin optimizar** y comprueba que la salida observable sea idéntica (equivalencia antes/después de optimizar).
6. Informa si se usó flujo estructurado o máquina de estados.

Casos cubiertos y resultados esperados:

| Programa | Salida verificada |
|---|---|
| Factorial (`for`) | `[120]` |
| Fibonacci (`while`) | `[21]` |
| Cuenta regresiva (`do-while`) | `[3, 2, 1, "Fin"]` |
| `if/else` anidados | `["Par mayor a 5"]` |
| `stack` / `queue` | `[2, 2, "a", "a", 1, false]` |
| Arreglos e índices | `[100, 30, 20]` |
| Lógica y unarios | `["OK and", -4]` |
| `read` con entrada simulada | `["Mayor de edad"]` |
| Plegado de constantes | `[14]` |

En todos los casos el flujo se reconstruye de forma **estructurada** y la salida coincide con la expectativa y con la del IR no optimizado. Los comandos de verificación son `npx tsc --noEmit` y `npm test`.
