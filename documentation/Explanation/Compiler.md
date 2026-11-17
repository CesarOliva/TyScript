# Explicación — `src/compiler.ts`

Este módulo es la **puerta de entrada del análisis** y unifica las tres primeras fases del compilador TyScript en una sola función: **léxico → sintáctico → semántico**. La CLI de la Fase 4 (`src/compile.ts`) lo usa directamente, y los tests pueden reutilizarlo sin repetir el cableado de `Lexer`, `Parser` y `SemanticAnalyzer`.

### 1. Contrato (`CompileResult`)

```ts
type CompilePhase = "lexico" | "sintactico" | "semantico";

interface CompileDiagnostic {
    phase: CompilePhase;
    message: string;
    line?: number;
    column?: number;
}

interface CompileResult {
    ok: boolean;        // true solo si las tres fases pasaron
    tokens: Token[];    // siempre disponible, incluso con errores
    ast?: ProgramNode;  // disponible si el parser llegó a construirlo
    errors: CompileDiagnostic[];
}
```

La distinción entre `tokens`, `ast` y `errors` permite que una futura UI muestre los tokens o el AST parcial aunque el programa no sea válido. `compileSource` **no imprime nada**: solo devuelve datos; la presentación es responsabilidad de la CLI.

### 2. Flujo de `compileSource(source)`

1. **Normalización**: si el texto empieza con BOM (`U+FEFF`, habitual en archivos guardados en Windows), se elimina antes de analizarlo.
2. **Fase léxica**: `new Lexer(source).scanTokens()`. Los errores léxicos llegan como tokens `TokenType.ERROR`, con el mensaje en `literal`. Si hay al menos uno:
   * se convierten a `CompileDiagnostic` de fase `"lexico"`;
   * se devuelve `ok: false` **sin intentar parsear**, porque la secuencia de tokens no es fiable.
3. **Fase sintáctica**: `new Parser(tokens).parse()` dentro de `try/catch`. El parser lanza `Error` con un mensaje del estilo:
   ```text
   [Línea 3, Col 7] Error Sintáctico: Se esperaba ';' ...
   ```
   * `parseLocation()` extrae `line` y `column` con una expresión regular y quita ese prefijo del mensaje para no duplicarlo en la CLI.
   * Si el error no tiene ese formato, se conserva el mensaje completo sin ubicación.
   * Un fallo sintáctico se reporta como fase `"sintactico"` y se aborta: no hay AST fiable.
4. **Fase semántica**: `new SemanticAnalyzer().analyze(ast)`.
   * Si devuelve `false`, cada `SemanticError` (`message`, `line`, `column`) se mapea a un `CompileDiagnostic` de fase `"semantico"`.
   * Se conserva el `ast` en el resultado para inspección.
   * Una excepción inesperada del analizador también se captura y se reporta como error semántico, en lugar de romper la CLI.
5. **Éxito**: `{ ok: true, tokens, ast, errors: [] }`.

### 3. Relación con la Fase 4

`compile.ts` hace:

```ts
const analysis = compileSource(source);

if (!analysis.ok || !analysis.ast) {
    printDiagnostics(file, analysis.errors);
    return 1;
}
```

Solo cuando el análisis es exitoso se generan IR, optimización y programa objeto. Así el pipeline **nunca produce JavaScript de un programa inválido**, tal como exige el plan del compilador.
