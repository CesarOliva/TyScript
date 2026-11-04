El código del analizador léxico (lexer) presentado actúa como la primera fase de un compilador. Su responsabilidad principal es leer el código fuente carácter por carácter y agruparlos en unidades con significado léxico llamadas **tokens**.

A continuación, se detalla el funcionamiento del analizador léxico en sus distintas partes:

* **Definición de Tokens (`TokenType` y `Token`)**:
* Se define un enumerador `TokenType` que contiene todos los tipos de tokens soportados por el lenguaje, tales como palabras reservadas (`INT`, `IF`, `PRINT`), identificadores, literales numéricos o de texto, y operadores (`ASSIGN`, `EQUAL_EQUAL`).


* La interfaz `Token` define la estructura de cada token que el lexer va a generar. Cada token almacena su tipo, el texto exacto reconocido (lexema o *value*), un valor literal asociado (si aplica) y la posición exacta donde fue encontrado a través de `line` (línea) y `column` (columna).




* **Estructura de la clase `Lexer**`:
* La clase controla el estado de la lectura utilizando variables de clase como `source` (el código fuente completo), `tokens` (el arreglo donde se guardarán los resultados), y variables para la posición como `current`, `line` y `column`.


* Emplea un mapa de memoria llamado `keywords` que vincula cadenas de texto específicas con su tipo de token reservado (por ejemplo, `"int"` se asocia con `TokenType.int`). Esto permite diferenciar fácilmente las palabras clave del lenguaje frente a los identificadores de variables comunes.




* **Bucle de Ejecución (`scanTokens`)**:
* Este método es el ciclo principal que procesa todo el texto. Emplea un bucle `while` que itera continuamente mientras no se llegue al final del código fuente mediante la validación de `!this.isAtEnd()`.


* En cada ciclo guarda la columna inicial, consume un carácter y determina qué regla léxica aplicar.


* Al concluir todo el escaneo, el método siempre añade un token de fin de archivo (`EOF`) y retorna el arreglo completo de tokens procesados.




* **Clasificación de Caracteres (`switch`)**:
* Para interpretar cada símbolo leído por el método auxiliar `advance()`, el lexer utiliza una estructura `switch`.


* **Espacios y saltos de línea**: Caracteres vacíos como espacios (`' '`), retornos de carro (`\r`) y tabuladores (`\t`) son simplemente ignorados con un `break`. Si el analizador encuentra un salto de línea (`\n`), incrementa la variable `line` y reinicia el valor de `column` a 1 para mantener el rastreo correcto de la posición.


* **Delimitadores**: Signos de puntuación de un solo carácter como `;`, `(`, `)`, `{`, `}` se emparejan inmediatamente y se agregan a la lista a través del método `addToken()`.


* **Operadores múltiples (Maximal Munch)**: Para símbolos que pueden componer operadores dobles (como `=` o `!`), el código evalúa el siguiente carácter usando el método `match()`. Por ejemplo, si un `=` es seguido por otro `=`, se genera un token de tipo "igualdad" (`==`); en caso contrario, se genera un token simple de "asignación" (`=`).


* **Cadenas de caracteres (Strings)**: Al detectar comillas dobles `"`, llama a la función `stringLiteral()`. Esta consume caracteres hasta encontrar la siguiente comilla doble de cierre. Si se alcanza el final del archivo y la cadena queda sin cerrar, se registra un error.




* **Lectura de Números e Identificadores (`default`)**:
* Si el símbolo no entra en los casos definidos, el bloque `default` comprueba si el carácter es un dígito mediante la función `isDigit()`. Si lo es, invoca a `numberLiteral()`, la cual leerá todos los dígitos consecutivos y comprobará la presencia de un punto decimal seguido de más números para determinar si genera un token entero o de coma flotante.


* Si el carácter es una letra o un guion bajo (evaluado con `isAlpha()`), invoca a `identifier()` o `identifierOrKeyword()`. Esta función lee caracteres alfanuméricos sucesivos y posteriormente busca la palabra en el mapa `keywords`. Si la palabra se encuentra ahí, le asigna el tipo de token reservado; si no, asume que es un identificador regular.




* **Recuperación de Errores Activa**:
* En lugar de detenerse cuando encuentra algo anormal (como un carácter no reconocido como `@` o un string sin cerrar), el lexer implementa una estrategia de tolerancia al registrar el error emitiendo un token de tipo `ERROR` (con un mensaje y su ubicación) y continúa procesando el resto del archivo.