Define la estructura del Árbol de Sintaxis Abstracta (AST) utilizando TypeScript. Su objetivo es modelar jerárquicamente cómo se agrupan los tokens (previamente generados por el analizador léxico) para representar gramáticas válidas empleando la técnica de descenso recursivo.

### 1. La Raíz y las Categorías Principales

El árbol se sustenta fundamentalmente en el tipo general `ASTNode`, el cual unifica tres grandes categorías de nodos:

* **`ProgramNode`**: Representa el punto de inicio absoluto o la raíz del programa; contiene el nombre del programa y un arreglo de instrucciones principales llamado `body`.


* **`StatementNode`**: Agrupa las sentencias o acciones imperativas del código que ejecutan instrucciones pero no necesariamente devuelven un valor inmediato (como declaraciones de variables, impresiones o ciclos).


* **`ExpressionNode`**: Categoriza todas las entidades que se evalúan matemáticamente o lógicamente para producir un valor resultante (como números, textos, variables u operaciones binarias).



---

### 2. Nodos de Sentencia (Statements)

Las interfaces de TypeScript que componen a `StatementNode` estructuran cada instrucción permitida en el lenguaje:

* **Declaraciones (`VariableDeclarationNode`, `ConstantDeclarationNode`)**: Guardan la información vital de memoria: el tipo de dato subyacente (`varType`), el nombre del identificador y su valor de inicialización.


* **Estructuras de Control (`IfStatementNode`, `ForStatementNode`)**: Organizan el flujo del programa. El nodo condicional `if`, por ejemplo, separa estrictamente la evaluación de la `condition`, la rama de ejecución principal (`thenBranch`) y la alternativa opcional (`elseBranch`).


* **Asignación e I/O**: Nodos operativos como `PrintStatementNode`, `ReadStatementNode` y `AssignmentNode` manejan interacciones de usuario y mutación de estados vinculando un objetivo (`target`) con una expresión a guardar o imprimir.



---

### 3. Nodos de Expresión (Expressions)

Para resolver la precedencia de operadores y la ejecución lógica, el AST define interfaces específicas para evaluar datos:

* **`BinaryExpressionNode`**: Estructura operaciones entre dos valores conectando una expresión izquierda (`left`) y una derecha (`right`) mediante un operador en particular.


* **`UnaryExpressionNode`**: Aplica una mutación o inversión a un solo argumento de expresión (como un signo negativo `-` o negación lógica `!`).


* **`LiteralNode` e `IdentifierNode**`: Actúan habitualmente como las "hojas" finales del árbol, representando directamente datos estáticos crudos (`value`, `raw`) o referencias a nombres de variables.