El objetivo de esta fase es recorrer el Árbol de Sintaxis Abstracta (AST) para verificar que el programa cumpla con las reglas del lenguaje que la gramática no puede validar por sí sola.

---

**Arquitectura del Analizador Semántico**

El módulo semántico se divide en tres componentes clave:

1. **Tabla de Símbolos (`SymbolTable`)**:
* Maneja ámbitos anidados (*scopes* global y locales por cada bloque `{}`).


* Registra variables, constantes y estructuras tipadas con sus metadatos (`name`, `type`, `kind`, `scope`, `mutable`).




2. **Manejador de Errores (`SemanticError`)**:
* Recolecta errores semánticos sin detener abruptamente el análisis si se requiere recuperación.


* Almacena `type`, `message`, `line` y `column`.




3. **Analizador Semántico (`SemanticAnalyzer`)**:
* Recorre recursivamente los nodos del AST (patrón Visitor o Walk).


* Aplica las reglas semánticas especificadas.





---

**Reglas Semánticas a Implementar**

* **Declaración y Existencia**:
* Toda variable/constante debe ser declarada antes de usarse.


* No se permite redeclarar una variable en el mismo ámbito.




* **Mutabilidad de Constantes**:
* No se puede asignar un nuevo valor a un símbolo con `mutable: false`.




* **Comprobación y Compatibilidad de Tipos**:
* La condición de un `if` o `for` debe ser estrictamente de tipo `bool`.


* En asignaciones `A = B;`, los tipos de `A` y `B` deben ser compatibles (ej. `int` con `int`).


* Operaciones aritméticas y relacionales deben realizarse entre tipos válidos (ej. no sumar `int` + `bool`).


---
>SymbolTable.ts

### 1. Interfaz `SymbolEntry`

Esta estructura define exactamente qué metadatos se almacenarán por cada identificador que el compilador encuentre. Cada entrada guarda:

* `name`: El nombre del identificador en forma de texto.


* `type`: El tipo de dato subyacente (como `'int'`, `'float'`, `'bool'`, `'string'` o estructuras tipadas como `'stack<int>'`).


* `kind`: Clasifica el símbolo estrictamente como `'variable'` o `'constant'`.


* `scope`: Un número entero que indica en qué nivel de profundidad o bloque fue declarado el símbolo.


* `mutable`: Un valor booleano clave que determina si el símbolo puede ser modificado posteriormente (será `true` para variables y `false` para constantes).



### 2. Clase `SymbolTable`

Es el motor que administra activamente los registros en memoria a través de una pila de mapas (*stack of maps*).

* **Estado Interno (`scopes` y `currentScope`)**: La clase utiliza un arreglo de estructuras `Map` de TypeScript (`this.scopes`) para representar los distintos ámbitos del programa, inicializando siempre un mapa en la posición `0` para el ámbito global. La variable `currentScope` rastrea numéricamente el nivel de anidamiento actual.


* **Apertura y Cierre de Ámbitos (`enterScope` y `exitScope`)**:
* Al llamar a `enterScope()`, se incrementa el contador de ámbito y se añade un nuevo mapa vacío al final del arreglo `scopes`. Esto sucede cada vez que el analizador semántico entra en un nuevo bloque delimitado por `{}` (como un `if` o un `for`).


* `exitScope()` destruye el ámbito local más reciente eliminando el último mapa del arreglo (con `.pop()`) y decrementando el contador, asegurando así que las variables locales dejen de existir fuera de su bloque.




* **Inserción de Símbolos (`insert`)**:
* Este método intenta registrar un nuevo `SymbolEntry` consultando exclusivamente el mapa del ámbito actual (el último en el arreglo).


* Si el nombre del símbolo ya existe en el mapa de ese nivel específico, retorna `false`, permitiendo al analizador lanzar un error de "redeclaración en el mismo ámbito".


* Si el nombre está disponible, lo guarda en el mapa y retorna `true`.




* **Resolución de Símbolos (`lookup`)**:
* A diferencia de la inserción, la búsqueda de un símbolo se realiza recorriendo el arreglo de mapas en **orden inverso**, desde el ámbito más profundo (`this.scopes.length - 1`) bajando hasta el nivel global (`0`).


* Este mecanismo garantiza que si hay una variable local con el mismo nombre que una global (efecto *shadowing*), el compilador utilice siempre la declaración local más cercana.


* Si el bucle termina sin encontrar el identificador en ningún nivel, retorna `undefined`, lo que detona un error semántico de "variable no declarada".