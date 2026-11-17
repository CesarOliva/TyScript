# Explicación — `src/intermediateGenerator.ts`

Su función principal es recorrer el árbol de sintaxis abstracta (AST) producido por el parser — ya validado por el análisis semántico — y convertirlo en una lista de cuádruples usando los tipos y la clase `QuadGenerator` de `src/ir.ts`.

### 1. Clase `IntermediateGenerator`

* Mantiene una instancia privada de `QuadGenerator` (`gen`), que acumula los cuádruples, los temporales (`t0`, `t1`, ...) y las etiquetas (`L0`, `L1`, ...).
* **`generate(program)`**: punto de entrada. Recorre el cuerpo del programa (`ProgramNode.body`) sentencia por sentencia y devuelve la lista completa de `Quad`.

### 2. Despacho de sentencias (`genStatement`)

`genStatement()` es un `switch` que distribuye cada nodo según su `type`, delegando a un método privado por tipo: declaraciones (`genVariableDeclaration`, `genConstantDeclaration`), control de flujo (`genIf`, `genFor`, `genWhile`, `genDoWhile`), I/O (`genPrint`, `genRead`), asignación (`genAssignment`) y expresiones sueltas (`genExpressionStatement`).
TypeScript garantiza la exhaustividad: si un día se agrega un nodo al AST y falta el `case`, el compilador lo marca (el `switch` no tiene rama `default` a propósito).

### 3. Declaraciones

* **`genVariableDeclaration()`** distingue el `varType` real del lenguaje:
  * `stack<T>` → emite `new_stack` con la variable como `result` (para `stack<int> pila` el `varType` llega como `stack<int>` por el parser).
  * `queue<T>` → emite `new_queue` de la misma forma.
  * Arreglos (`varType` termina en `[]`, por ejemplo `int[]`) → emite `new_array` y, si hay inicializador que sea `ArrayLiteral`, llama a `genArrayLiteralInto()` para almacenar cada elemento **directamente en la variable declarada** (sin crear un temporal extra).
  * Tipos primitivos → solo emite `:=` si hay inicializador; una declaración sin valor (`int edad;`) no genera cuádruples, esperando la primera asignación o un `read`.
* **`genConstantDeclaration()`**: evalúa el valor (siempre presente en el AST) y emite `:=` hacia la constante. El semántico ya impidió asignarle después.

### 4. Control de flujo (etiquetas y saltos)

Traducción clásica a `label` / `goto` / `if_false`:

* **`genIf()`**: genera la condición; sin `else` usa una sola etiqueta final (`if_false cond goto L_end ... label L_end`). Con `else` son dos etiquetas: salta a `L_else` si la condición falla, ejecuta el *then*, salta a `L_end` incondicionalmente, coloca `L_else` para el *else* y cierra con `L_end`.
* **`genBranch()`**: los bloques del AST pueden llegar como arreglo `StatementNode[]` o directamente como un `IfStatementNode` anidado (el patrón `else if` del parser). `genBranch()` discrimina con `Array.isArray()`: los arreglos se procesan sentencia por sentencia y el nodo `if` anidado se delega de nuevo a `genIf()`, lo que produce cadenas `if/else if/else` correctas.
* **`genFor()`**: ejecuta `init`, coloca `L_start`, evalúa la condición (si el AST no trae condición se usa la constante `true`), `if_false` salta a `L_end`, genera el cuerpo, luego la `update` (que puede llegar como `Assignment` o como `ExpressionNode`; en el segundo caso solo se evalúa y se descarta) y `goto L_start`.
* **`genWhile()`**: patrón estándar: `label L_start`, condición, `if_false` a `L_end`, cuerpo, `goto L_start`, `label L_end`.
* **`genDoWhile()`**: `label L_start`, cuerpo, condición, y como el lenguaje solo tiene `if_false`, se niega la condición con un quad `!` y se salta de regreso a `L_start` con `if_false !cond goto L_start` — así el cuerpo siempre se ejecuta al menos una vez sin necesitar una operación `if` adicional.

### 5. I/O y asignaciones

* **`genPrint()`**: evalúa la expresión y emite `print` con el resultado como `arg1`.
* **`genRead()`**: emite `read` con la variable destino en `result` (el parser garantiza que `read` siempre apunta a un identificador).
* **`genAssignment()`**: evalúa el lado derecho primero. Si el nodo trae `index` (asignación indexada `a[i] = v`), emite `idx_store` con `arg1`=arreglo, `arg2`=índice y `result`=valor; si es simple, emite `:=`.

### 6. Expresiones (`genExpression`)

Cada método devuelve el `Operand` que contiene el valor de la sub-expresión — la convención es "generar el cuádruple y devolver dónde quedó el resultado":

* **`genLiteral()`**: devuelve una constante cuyo `name` es el `raw` del literal (los strings conservan sus comillas, los números y booleanos su lexema).
* **Identificador**: sin cuádruple; devuelve directamente `var nombre`.
* **`genBinary()`**: postfix/recursivo — evalúa izquierda, evalúa derecha, crea temporal y emite el operador con ambos operandos. Esto produce el orden correcto de evaluación para cualquier anidamiento (`a + b * c` genera primero `b * c`).
* **`genUnary()`**: evalúa el argumento y emite `!` o `neg` según el operador del AST (`-` se mapea a `neg` para no colisionar con el `-` binario).
* **`genMethodCall()`**: el objeto es una variable. Con la lista `VALUE_METHODS` de `ir.ts` decide:
  * Métodos con valor (`pop`, `front`, `peek`, `dequeue`, `size`, `isEmpty`) → emite el cuádruple con el objeto en `arg1` y una temporal nueva en `result`, que devuelve.
  * Métodos `void` (`push`, `enqueue`, `clear`) → emite el cuádruple con el objeto en `arg1` y el argumento evaluado en `arg2` (sin `result`); el temporal reservado queda sin usar y lo limpiará el optimizador en la Fase 2.

* **`genArrayLiteral()`**: crea un temporal nuevo con `new_array` y guarda cada elemento con `idx_store` usando índices constantes (`0`, `1`, ...), devolviendo el temporal. Es la variante "temporal" de los arreglos; la variante "variable declarada" es **`genArrayLiteralInto()`**, que hace lo mismo pero escribiendo sobre el `Operand` que recibe (usada por las declaraciones).
* **`genIndexAccess()`**: evalúa el arreglo (que puede ser un identificador o un acceso anidado recursivo) y el índice, y emite `idx_load` hacia una temporal nueva.

### 7. Utilería: `generateIntermediateCode()`

Función de alto nivel que integra el pipeline de la Fase 1: recibe el `ProgramNode` y la bandera `analysisOk` del análisis semántico. Si el análisis falló devuelve `{ ok: false, quads: [] }` (nunca se genera IR de un programa inválido); si pasó, construye el generador y regresa `{ ok: true, quads }`. Es la interfaz que la CLI de la Fase 4 llamará después de `compileSource()`.