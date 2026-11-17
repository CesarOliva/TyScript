# Explicación — `src/optimizer.ts`

Este módulo implementa la **Fase 2 del plan** (`documentation/5-Compilador.md`): el **optimizador** del compilador TyScript. Su función principal es tomar la lista de cuádruples generada en la Fase 1 y transformarla en una versión **más corta y equivalente** en cuanto al resultado observable, usando pases locales sobre bloques básicos y registrando todo lo que hace en un log de pases (`passesLog`) para inspección.

### 1. Salida (`OptimizerOutput`)

`optimize(quads)` devuelve:

* **`optimizedQuads`**: la lista transformada (siempre sobre **copias** de los cuádruples de entrada; el original nunca se muta).
* **`blocks`**: el grafo de flujo recalculado sobre el IR final.
* **`passesLog`**: arreglo de `{ pass, iteration, changed }` con los cambios de cada pase en cada iteración.
* **`removedCount`**: cuántos cuádruples se eliminaron en total (original − final).

### 2. Utilería de análisis de constantes

* **`constValue()`**: interpreta un `Operand` const como valor real: `"true"/"false"` → booleano, dígitos (con signo o punto) → número; cualquier otra cosa (por ejemplo strings) → `undefined` y no se pliega.
* **`isIntName()`**: distingue enteros de flotantes; solo `/` y `%` se pliegan con enteros.
* **`isPure()`**: un operando es "puro" si es `var` o `const` (leerlo no produce efectos). Los `temp` se consideran impuros porque su productor puede ser una operación con efectos (como `pop`/`dequeue`): descartar su uso podría hacer que el optimizador elimine el productor y con él el efecto.
* **`rewriteAsCopy()` / `rewriteAsConst()`**: reescriben un cuádruple binario/unario en `:=` (hacia la copia o la constante), borrando el `arg2` sobrante.
* **`quadKey()`**: serializa un cuádruple en texto canónico; se usa para detectar el punto fijo (comparar la lista completa antes y después de una iteración).

### 3. Los siete pases

1. **`fold` (plegado de constantes)** — si ambos operandos de una operación binaria son constantes, se calcula el valor y se reemplaza por `:= const`:
  * `+ - *` solo con números; comparaciones `< <= > >=` solo con números.
  * `/` y `%`: **solo enteros** y divisor ≠ 0 (con `/` aplicando `Math.trunc`, la semántica
    entera del lenguaje).
  * `==`/`!=` con operandos del mismo tipo; `&&`/`||` solo con booleanos.
  * Unarios: `!` con booleano y `neg` con número.
2. **`algebraic` (simplificación algebraica)** — identidades: `x+0 → x`, `x-0 → x`,
   `x*1 → x`, `x/1 → x`, `x*0 → 0`, `0/x → 0`, `x%1 → 0` y neutralidad de booleanos
   (`false && x`, `true || x`, `false || x → x`, `x && true → x`...). Regla clave: cuando el
   rewrite **descarta el uso** de un operando (los casos que producen constante), el
   operando descartado debe ser puro; cuando solo se descarta una constante (`x+0 → x`),
   es siempre seguro.
3. **`propagacion` (constantes y copias, local)** — por bloque, un mapa `nombre → Operand`
   de valores conocidos:
    * Antes de procesar cada cuádruple, las posiciones de *lectura* se reemplazan con el
      valor conocido (solo `arg1`/`arg2` en operaciones que no tocan objetos: el objeto de
      un método o el arreglo de un `idx_*` nunca se reemplaza).
    * Un `:=` con rhs constante o copiable registra el valor; cualquier otra escritura
      (`resultado` de binop, `new_*`, `read`, métodos con valor) invalida el nombre.
    * `invalidate(n)` borra el mapeo de `n` **y** cualquier mapeo cuyo valor apunte a `n`
      (si `y` era copia de `x` y se reasigna `x`, el mapeo de `y` queda rancio y se borra).
    * Al empezar cada bloque el mapa está vacío: el bloque es el punto de corte en las
      uniones (*joins*), lo que mantiene el pase conservador.
4. **`cse` (eliminación de subexpresiones comunes, local)** — por bloque, una tabla
   `clave → resultado`: la clave es `op(a1|a2)`, con **orden canónico** (intercambio) para
   las conmutativas `+ * ==`. Un cuádruple repetido se reescribe como copia del resultado
   canónico. Cada escritura a un nombre limpia las claves que lo mencionan (defensa
   conservadora contra invalidaciones).
5. **`dead-temporales` (código muerto)** — repite hasta estabilizar: cuenta los usos de
   cada `var`/`temp` como operando (`arg1`/`arg2` y también el `result` de `idx_store`,
   porque ahí el `result` es el **valor almacenado**, no una definición) y elimina
   cuádruples cuyo `result` es un **temporal sin usos**, pero solo operaciones puras
   (`:=`, binarias, `!`, `neg`, `idx_load`, `new_array`). Las operaciones con efectos
   (`pop`, `dequeue`, `push`, `read`, `print`) jamás se eliminan, aunque su temporal no
   se use.
6. **`etiquetas-huerfanas`** — elimina cuádruples `label` cuyo nombre no aparece como
   destino en ningún `goto` (destino en `arg1`) ni `if_false` (destino en `arg2`).
7. **`bloques-inalcanzables`** — construye el grafo, hace BFS desde el bloque 0 y conserva
   únicamente los cuádruples de bloques alcanzables.

### 4. Pipeline y punto fijo

`PASSES` define el orden de ejecución: `fold → algebraic → propagacion → cse →
dead-temporales → etiquetas-huerfanas → bloques-inalcanzables`. El orden importa: plegar
primero crea constantes que la propagación reparte, y esas constantes alimentan el plegado
de la siguiente ronda.

El bucle principal repite **toda la secuencia** hasta que la serialización completa
(`quadKey`) no cambia, con tope de **10 iteraciones**. En cada ronda se anota el conteo de
cambios de cada pase en `passesLog`, incluso las rondas sin cambios.

### 5. Invariantes de seguridad

* Nunca se muta la entrada: `optimize` trabaja sobre `{ ...quad }`.
* Tras la optimización, los saltos siguen consistentes (los tests verifican con
  `findBrokenJumps` de `src/ir.ts` que no queden saltos hacia etiquetas inexistentes).
* El tamaño nunca crece y la semántica observable (`print`) se conserva; la verificación
  completa de ejecución equivalente llega con la Fase 4 (mismo `CompilerRuntime.print`
  con y sin optimización).

### 6. Resultados medidos en los tests (`src/tests.ts`)

* `x = 2 + 3*4` → `x = 14` en una sola asignación (4 → 2 cuádruples): criterio de
  aceptación del plan.
* Algebraico: 16 → 11. Propagación en cadena: 6 → 5. CSE con conmutatividad: 14 → 7.
* Código muerto: 5 → 3. Bucle `for`: 13 → 10, con el CFG intacto (3 bloques, aristas
  correctas) y `i * 1` eliminado dentro del cuerpo.
