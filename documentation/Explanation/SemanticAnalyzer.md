El código del analizador semántico (`semanticAnalyzer.ts`) implementa la **Fase 4** del compilador. Su responsabilidad exclusiva es recorrer el Árbol de Sintaxis Abstracta (AST) para aplicar las reglas de contexto que la gramática (el parser) no tiene la capacidad de validar estructuralmente, tales como la existencia previa de variables, la compatibilidad de tipos en operaciones y el manejo de los distintos *scopes* o ámbitos de memoria.

El funcionamiento y la arquitectura de este módulo se dividen en los siguientes mecanismos clave:

* **Arquitectura Recursiva (Patrón Visitor):**
* La clase `SemanticAnalyzer` recorre el AST procesando sus ramas. Comienza en la raíz llamando a `visitProgram()` y luego itera sobre cada instrucción del código, delegando la tarea a la función distribuidora `visitStatement()`.


* A través de una estructura `switch`, `visitStatement()` clasifica el nodo actual (`VariableDeclaration`, `Assignment`, `IfStatement`, etc.) y lo redirige a un método `visit...` especializado en hacer cumplir las reglas precisas de dicha instrucción.




* **Gestión Estricta de Ámbitos (Scopes):**
* El analizador incorpora su propia instancia de `SymbolTable` para rastrear las variables en memoria.


* Cuando el análisis penetra en estructuras lógicas encapsuladas (como un `if` o un `for`), llama explícitamente a `this.symbolTable.enterScope()` para abrir un nuevo contexto local. Tras evaluar las sub-instrucciones (ya sean la rama `thenBranch` o `elseBranch`), invoca inmediatamente `this.symbolTable.exitScope()`. Esto garantiza que cualquier variable declarada dentro del bloque se destruya y no contamine el ámbito global.




* **Reglas de Declaración y Mutabilidad:**
* **`visitVariableDeclaration()`:** Primero averigua si la declaración incluye una expresión inicial; si es así, compara el tipo inferido de la expresión con el tipo explícito de la variable para detectar incompatibilidades (ej. declarar un `int` y asignarle un `string`). Luego, inserta el identificador en la tabla de símbolos activando la bandera `mutable: true`. Si el registro falla por duplicidad en el mismo nivel, reporta el error de redeclaración.


* **`visitConstantDeclaration()`:** Ejecuta una lógica similar, pero fuerza a que el inicializador esté presente y guarda el registro en la tabla con la bandera `mutable: false`.




* **Asignaciones Protegidas:**
* Al procesar un nodo `Assignment`, invoca `lookup(node.target)` para verificar el identificador.


* Genera un error semántico si la variable no existe, o si su atributo `mutable` está marcado como falso (evitando que una constante definida previamente sea reescrita). Finalmente, vuelve a comprobar que el tipo de la nueva expresión cuadre matemáticamente con el tipo que fue registrado en la declaración original.




* **Inferencia y Verificación de Tipos (`getExpressionType`):**
* Es la función vital que deduce qué tipo de dato resulta al evaluar cualquier "hoja" o combinación matemática del árbol.


* Para los literales directos, los clasifica analizando el valor base (separando dinámicamente un `int` de un `float` con comprobaciones numéricas).


* Para las expresiones binarias, evalúa ambos lados (`left` y `right`). Si es un operador aritmético (`+`, `-`, `*`), confirma que los operandos posean tipos compatibles y retorna dicho tipo. Si detecta un operador relacional (`==`, `<`, etc.), verifica la compatibilidad de lados y retorna invariablemente el tipo `'bool'`. Si detecta un operador lógico (`&&`, `||`), exige que ambos lados sean `'bool'` (reportando el lado infractor por separado) y retorna `'bool'`.


* Para las expresiones unarias, evalúa el `argument`. El operador `!` exige un operando `'bool'` y retorna `'bool'`; el operador `-` exige un operando numérico (`'int'` o `'float'`) y retorna el tipo del operando. Si el tipo del operando es desconocido (p. ej. variable no declarada), no se reporta un error de operador adicional para evitar diagnósticos en cascada.


* Para sentencias de control, métodos como `visitIfStatement()` dependen de esta función para restringir y obligar a que la condición analizada resulte exclusivamente en un `bool`.




* **Tolerancia a Fallos y Sentencias de Expresión:**
* Los errores no lanzan excepciones fatales que interrumpan el proceso completo. Cualquier anomalía se empaqueta como un objeto (con su mensaje, línea y columna) en el arreglo `errors` de la clase, entregando al final un diagnóstico integral.


* Mediante `visitExpressionStatement()`, el sistema también habilita el procesamiento semántico libre para instrucciones de invocación que no almacenan un retorno, como llamadas a métodos `.push()` en pilas o `.dequeue()` en colas.