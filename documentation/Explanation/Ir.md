# Explicación — `src/ir.ts`

Este módulo define la **representación interna del código intermedio** del compilador TyScript.
Su función principal es modelar la salida de la fase de generación intermedia: una secuencia plan de **cuádruples** (*quads*), donde cada instrucción tiene una operación y hasta tres operandos (`arg1`, `arg2`, `result`).

### 1. Operandos (`Operand`)

Todo dato que participa en un cuádruple es un `Operand`, identificado por dos campos:

* **`kind`**: categoría del operando, con cuatro valores posibles:
    * `"var"` — variable o constante declarada en el programa fuente (por ejemplo `n`, `factorial`).
    * `"temp"` — temporal generada por el compilador (`t0`, `t1`, ...), usada para guardar
      resultados intermedios de expresiones.
    * `"const"` — valor literal tal como aparece en el fuente (`5`, `true`, `"Iteracion:"`).
    * `"label"` — etiqueta de control de flujo (`L0`, `L1`, ...), destino de saltos.

* **`name`**: el texto del operando. Para las variables es su nombre, para los temporales y etiquetas el nombre generado, y para las constantes el `raw` del literal del AST.

### 2. Operaciones de cuádruples (`QuadOp`)

`QuadOp` es un tipo de unión que restringe las operaciones válidas a las existentes realmente en el lenguaje (según el lexer y el parser):

* **Aritméticas y relacionales**: `+ - * / %` y `< <= > >= == !=`. Se emiten como `result = arg1 op arg2`.
* **Lógicas**: `&&`, `||`, `!` y `neg` (negación aritmética del operador unario `-`). El lenguaje **no** tiene palabras clave `and/or/not`; usa los símbolos `&&`, `||` y `!`.
* **Asignación**: `:=`, con `result` como destino y `arg1` como valor.
* **Arreglos**: `new_array` (creación), `idx_load` (lectura indexada: `arg1=arreglo`, `arg2=índice`, `result=valor`) e `idx_store` (escritura indexada: `arg1=arreglo`, `arg2=índice`, `result=valor`).
* **Estructuras de datos**: `new_stack` / `new_queue` para crearlas, más los métodos validados por el análisis semántico, organizados en dos listas:
    * **`VALUE_METHODS`** — sí regresan un valor: `pop`, `peek`, `front`, `dequeue`, `size`, `isEmpty`.
    * **`VOID_METHODS`** — no regresan valor: `push`, `enqueue`, `clear`.

* **Control de flujo**: `label` (coloca una etiqueta), `goto` (salto incondicional) e `if_false` (salto condicional: `arg1`=condición, `arg2`=destino).
* **I/O**: `print` (imprime `arg1`) y `read` (lee hacia `result`).

### 3. El cuádruple (`Quad`)

Cada instrucción es un objeto `Quad` con `op` (siempre presente) y `arg1` / `arg2` / `result` / `line` opcionales. Ningún operando usa posiciones vacías: los campos no utilizados simplemente no están en el objeto, lo que mantiene el IR compacto. El campo `line` quedó preparado para correlacionar con la línea del código fuente en el futuro.

### 4. Emisión con `QuadGenerator`

La clase `QuadGenerator` es el "bloc de notas" donde se acumula el IR mientras el generador recorre el AST:

* **`quads`**: arreglo readonly que almacena la lista completa de instrucciones, en orden.
* **`newTemp()`** y **`newLabel()`**: fabrican operandos nuevos con numeración automática (`t0`, `t1`, `t2`, ... y `L0`, `L1`, `L2`, ...), garantizando nombres únicos sin repetir registros del programa fuente.
* **`emit(op, arg1, arg2, result, line)`**: método de bajo nivel que crea el cuádruple, ignora los parámetros undefined (no los adjunta al objeto) y lo agrega a la lista.
* **Atajos semánticos**: `label(target)` coloca la etiqueta en `result` (es lo que define que esa posición es destino de saltos), `goto(target)` pone el destino en `arg1`, y `emitIfFalse(cond, target)` arma el salto condicional clásico `if_false cond goto label`.

### 5. Validación de saltos: `collectLabels()` y `findBrokenJumps()`

Criterio de aceptación de la Fase 1: **toda etiqueta referenciada por un salto debe existir** en el IR.

* **`collectLabels(quads)`** recorre la lista y reúne en un `Set<string>` los nombres de todos los cuádruples `label` (que se guardan en `result`).
* **`findBrokenJumps(quads)`** vuelve a recorrer la lista y verifica cada `goto` / `if_false` cuyo `arg1` sea de tipo `"label"`: si el nombre no está en el conjunto de etiquetas, se registra un `BrokenJump` con el índice del cuádruple, la operación y el destino faltante.

La lista resultante está pensada para usarse como prueba automática: si está vacía, el IR generado es consistente con respecto al control de flujo.