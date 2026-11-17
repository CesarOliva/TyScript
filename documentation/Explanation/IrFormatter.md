# Explicación — `src/irFormatter.ts`

Este módulo convierte los cuádruples (`Quad`) de `src/ir.ts` en **texto legible para humanos**. Su función principal es presentar el código intermedio en dos formatos que consume la suite de pruebas (`src/tests.ts`) y que usará la CLI de la Fase 4: una versión clásica destructor (`t0 = a + b`, `if_false t1 goto L2`) para leer con los ojos, y una tabla de cinco columnas (`#`, `op`, `arg1`, `arg2`, `result`) para inspección con `console.table`.

### 1. `OperandToText()`

Función pequeña pero central: traduce un `Operand` a su `name` y devuelve `"_"` si el operando es `undefined`. Ese carácter es la convención visual para "posición vacía" del cuádruple, así que cualquier formato de salida siempre muestra las tres columnas de
operandos de forma homogénea.

### 2. Operaciones binarias (`BINARY_OPS`)

Un `Set` con las operaciones que se escriben **entre** sus dos operandos: `+ - * / %`, `< <= > >= == !=` y `&& ||`. Si la operación del cuádruple está en ese conjunto, el formato es directamente `result = arg1 op arg2`, sin necesidad de un `case` individual por cada operador.

### 3. Cuádruples de control de flujo (`jumpToText()`)

Separados porque no siguen el patrón `result = operandos`:

* **`label`**: la etiqueta se guarda en `result`, así que se imprime como `L0:` (con el tipo de operandos de `arg1`/`arg2` vacíos en `_`).
* **`goto`**: el destino está en `arg1` → `goto L0`.
* **`if_false`**: la condición está en `arg1` y el destino en `arg2` → `if_false t0 goto L1`.
`quadToText()` delega a `jumpToText()` estos tres casos antes que cualquier otra regla.

### 4. `quadToText()` — un cuádruple a texto

Función principal de transformación. Orden de decisión:

1. **Control de flujo** (`label` / `goto` / `if_false`) → `jumpToText()`.
2. **Operadores binarios** presentes en `BINARY_OPS` → `res = a1 op a2`.
3. **Resto de operaciones** → un `switch` con el formato específico de cada op:
  * Asignaciones y unarios: `:=` → `res = a1`; `!` → `res = ! a1`;
    `neg` → `res = -a1` (sin espacios, para leerse como número negativo).
  * I/O: `print a1` y `read res` (el destino de `read` vive en `result`).
  * Creaciones: `res = new stack`, `res = new queue`, `res = new array`.
  * Arreglos: `idx_load` → `res = a1[a2]`; `idx_store` → `a1[a2] = res` (el valor se guarda en `result`, según el convenio definido en `ir.ts`).
  * Métodos de estructuras: los que regresan valor se escriben como `res = pila.pop()`, y los `void` como `cola.enqueue(arg)` o `pila.clear()`.
4. **Fallback**: cualquier op no reconocida se imprime con el formato binario genérico, para que el formateador nunca falle en silencio al ver un cuádruple nuevo.

### 5. `formatQuads()` — lista completa en formato clásico

Recibe la lista de cuádruples y produce un solo string con una línea por instrucción:

* Calcula el ancho del índice máximo (`length` del último índice) y hace `padStart` para que todos los números de línea queden alineados a la derecha.
* Prefija cada línea con `índice:` seguido del texto de `quadToText()`.

Es la salida que se imprime en la consola durante los tests de IR y la que usará `--ir` en la CLI.

### 6. `quadTable()` — representación tabular

Devuelve la misma información como `QuadRow[]`, un arreglo de objetos con campos fijos (`'#'`, `op`, `arg1`, `arg2`, `result`), donde cada operando ya esté convertido con `OperandToText()`. Esa forma es la que espera `console.table()` en los tests, y ademásqueda lista para cualquier vista futura (por ejemplo una pestaña visual) sin que el resto del código tenga que saber manipular cuádruples crudos.