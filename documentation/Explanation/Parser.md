Su función principal es tomar la lista de tokens generada previamente por el analizador léxico y estructurarla en un Árbol de Sintaxis Abstracta (AST) aplicando una técnica conocida como **descenso recursivo**.

### 1. Estructura base de la clase `Parser`

* La clase `Parser` se inicializa con el arreglo de `Token`s proveniente del Lexer.


* Mantiene una propiedad interna llamada `current`, inicializada en `0`, que actúa como un cursor para rastrear cuál token se está leyendo en cada momento.


* Su punto de entrada principal es el método `parse()`, el cual arranca el análisis delegando la lectura al método `program()` para construir la raíz del AST.



### 2. Análisis del Programa y Sentencias

* **`program()`**: Implementa la regla principal de la gramática. Obliga a que el código comience validando la palabra reservada `program`, seguida del nombre (identificador) y una llave de apertura `{`. Luego lee una lista de sentencias para el bloque y finaliza exigiendo la llave de cierre `}` y el token de fin de archivo (`EOF`).


* **`statement()`**: Actúa como un distribuidor central. Comprueba el tipo del token actual utilizando métodos como `match()` o `check()` para determinar qué regla de instrucción debe procesar a continuación.


* Dependiendo del token, `statement()` redirige el flujo hacia métodos especializados que retornan nodos específicos del AST, tales como `variableDeclaration()`, `constantDeclaration()`, `ifStatement()`, `forStatement()`, `printStatement()`, `readStatement()`, o asignaciones.



### 3. Resolución de Expresiones y Precedencia

Para evitar ambigüedades en las operaciones matemáticas o lógicas, el Parser implementa la jerarquía de operadores estructurando las llamadas a métodos en cascada (desde la menor a la mayor precedencia):

* El orden de las llamadas desciende sistemáticamente: `expression()` llama a `logicalOr()`, que llama a `logicalAnd()`, y este a `equality()`, pasando por `relational()`, `additive()`, `multiplicative()`, `unary()`, hasta llegar a `primary()`.


* **`primary()`**: Es el nivel de mayor precedencia. Aquí se consumen los datos puros (las "hojas" del árbol), tales como literales enteros (`integerLiteral`), flotantes (`floatLiteral`), cadenas (`stringLiteral`), booleanos, identificadores (nombres de variables) o expresiones que estén agrupadas explícitamente dentro de paréntesis `()`.



### 4. Métodos Auxiliares de Exploración (Lookahead y Consumo)

El parser navega a través de los tokens gracias a una serie de funciones internas muy importantes:

* **`consume(type, message)`**: Es el método que impone el cumplimiento de la sintaxis. Verifica si el token actual coincide con el `type` requerido; si es así, avanza el cursor y lo retorna. Si no coincide, lanza un error de sintaxis que incluye el `message` personalizado, además del token encontrado, la línea y la columna del error.


* **`match(...types)`**: Itera sobre una lista de tipos de tokens permitidos y comprueba si el actual coincide con alguno utilizando `check()`. Si hay coincidencia, llama a `advance()` para consumirlo y devuelve verdadero, lo cual es ideal para bifurcaciones condicionales `if`.


* **`check(type)`**: Revisa de manera segura el tipo del token actual sin llegar a consumirlo ni modificar el apuntador `current`.


* **`advance()`, `peek()` y `previous()**`: `peek()` observa el token actual; `advance()` incrementa el cursor `current` si no se ha llegado al final y devuelve el token anterior; y `previous()` simplemente retorna el token que se acaba de analizar (en `current - 1`).



### 5. Manejo de Errores

El analizador sintáctico es responsable de reportar construcciones ilegales. Si durante la validación de una regla, como `ifStatement()`, el parser esperaba encontrar un paréntesis de cierre (`TokenType.rightParen` o `TokenType.RPAREN`) después de la expresión condicional, y encuentra otra cosa, la función `consume()` interrumpirá el análisis y mostrará exactamente en qué línea y columna ocurrió la discrepancia.