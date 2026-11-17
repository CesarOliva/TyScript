# Plan de Implementación — Pipeline Completo del Compilador TyScript

## Estado actual

El proyecto es una aplicación de consola en TypeScript puro (Node.js + `ts-node`, módulos CommonJS).
**No hay ninguna UI ni framework de vista en el proyecto**: `package.json` solo declara
`ts-node` / `typescript` y el único script es `test` (`ts-node src/tests.ts`).

El compilador TyScript cubre únicamente las fases de análisis:

```
lexer → parser → análisis semántico → tabla de símbolos
```

Todo el pipeline vive plano en `src/` (sin subcarpetas):

```
src/lexer.ts
src/parser.ts
src/semanticAnalyzer.ts
src/symbolTable.ts
src/ast.ts
src/compiler.ts            # export function compileSource(source): CompileResult
src/tests.ts               # harness de pruebas por consola (npm test)
```

Punto de entrada del análisis: `src/compiler.ts` → `compileSource(source)`.
**No existe IR, optimizador, generación de código ni CLI compiladora.**

Este plan añade las fases restantes del compilador sin romper lo existente:

```
Generador de código intermedio → Optimizador → Generador de código → Programa objeto
```

## Decisiones de diseño

| Decisión | Valor |
|---|---|
| Formato del código intermedio | **Cuádruples** (`op, arg1, arg2, result`) |
| Alcance del optimizador | **Local + bloques básicos** con grafo de flujo |
| Lenguaje objetivo (programa objeto) | **JavaScript / Node** |
| Integración con una UI | **No existe UI en el proyecto actual; solo CLI.** Los tipos de salida se diseñarán pensando en una posible UI futura |
| Acceso a las fases de análisis | `compileSource()` existente (`src/compiler.ts`); si hay errores se aborta y se reportan |

## Nueva estructura de archivos

Se respeta la convención actual de archivos planos en `src/`; todos los módulos nuevos van
directamente en `src/`:

```
src/ir.ts                    # Tipos Quad, temps, etiquetas
src/irFormatter.ts           # Cuádruples → texto legible (t1 = a + b)
src/intermediateGenerator.ts # Fase 1: AST → cuádruples
src/flowGraph.ts             # Líderes, bloques básicos, grafo de flujo
src/optimizer.ts             # Fase 2: pases de optimización con registro
src/javascriptGenerator.ts   # Fase 3: cuádruples optimizados → JS
src/compile.ts               # Fase 4: programa objeto + runner CLI
```

---

## Fase 1 — Generador de Código Intermedio (cuádruples)

### 1.1 `src/ir.ts`

- `interface Quad { op: string; arg1?: Operand; arg2?: Operand; result?: Operand; line?: number; }`
- Operaciones soportadas (según `src/lexer.ts` / `src/parser.ts` reales):
  - Aritméticas / relacionales / lógicas: `+ - * / % < <= > >= == != && || !`
    (el lenguaje **no** tiene palabras clave `and/or/not`; usa `&&`, `||`, `!`).
  - Asignación: `:=`
  - Control de flujo: `label`, `goto`, `if_false`
  - Estructuras de datos (métodos reales validados por el semántico):
    - `stack<T>`: `push`, `pop`, `peek`, `isEmpty`, `size`, `clear`
    - `queue<T>`: `enqueue`, `dequeue`, `front`, `isEmpty`, `size`, `clear`
  - I/O: `print`, `read`
- Clase `QuadGenerator` con contadores de temporales (`t0, t1, ...`) y etiquetas (`L0, L1, ...`).

### 1.2 `src/intermediateGenerator.ts`

Recorrido de los nodos definidos en `src/ast.ts` (ya existen todos):

`ProgramNode`, `VariableDeclaration`, `ConstantDeclaration`, `IfStatement`, `ForStatement`,
`WhileStatement`, `DoWhileStatement`, `PrintStatement`, `ReadStatement`, `Assignment`,
`ExpressionStatement`, `BinaryExpression`, `UnaryExpression`, `Literal`, `Identifier`,
`MethodCall`, `ArrayLiteral`, `IndexAccess`.

- **Expresiones**:
  - `Literal` → constante.
  - `Identifier` → nombre de variable/constante.
  - `MethodCall` → cuádruples de estructura (`push`, `pop`, `enqueue`, `front`, ...).
  - `ArrayLiteral` / `IndexAccess` → creación de arreglo y lectura/escritura indexada.
  - `BinaryExpression` / `UnaryExpression` → generación en postorden con temporales.
- **Sentencias**:
  - Asignación (incluidos índices `IndexAccess`) → `:=`.
  - `print` → quad `print`, arg. `read` → quad `read`.
  - Declaraciones de variables/constantes → `:=` / creación de `stack` / `queue` / arreglo.

- **Control de flujo** (patrón clásico con etiquetas y saltos):
  - `if / else`:
    ```
    if_false cond goto L_else
    ...then...
    goto L_end
    label L_else
    ...else...
    label L_end
    ```
  - `while`:
    ```
    label L_start
    if_false cond goto L_end
    ...body...
    goto L_start
    label L_end
    ```
  - `do-while`: cuerpo primero, `if cond goto L_start` al final (el cuerpo siempre se ejecuta).
  - `for`: init → versión de `while` con update antes del salto de vuelta.

### 1.3 `src/irFormatter.ts`

- Renderizar cada cuádruple como línea indexada + formato clásico:
  - `t0 = a + b`, `if_false t1 goto L2`, `goto L0`, `label L3`.
- Representación tabular de 4 columnas (`#`, `op`, `arg1`, `arg2`, `result`), reutilizable por
  consola (y por una futura UI si algún día se añade).

**Criterio de aceptación:** para los ejemplos ya existentes en `src/tests.ts` (programas
`TestValido`, `TestErrores`, `TestScope`) más ejemplos nuevos de control de flujo, el IR
formateado imprime sin errores y toda etiqueta referenciada por un salto existe (test que
falla ante `goto`/`if_false` hacia etiquetas inexistentes).

---

## Fase 2 — Optimizador (local + bloques básicos)

### 2.1 `src/flowGraph.ts`

- Calcular **líderes**: primera instrucción, destinos de saltos, instrucción posterior a un salto.
- Construir **bloques básicos** y **aristas** según los saltos → mapa de `predecessors / successors`.

### 2.2 `src/optimizer.ts`

Cada pase anota sus cambios en un **log de pases** (`passesLog`), pensado para inspección por
consola en la CLI (`--opt`) y por una futura UI:

1. **Plegado de constantes**: `2+3 → t=5`, `true && false → false`.
2. **Simplificación algebraica**: `x+0`, `0+x`, `x*1`, `x*0` (esta última solo si `x` es puro,
   sin efectos).
3. **Propagación de constantes y copias**: local y conservadora; se reinicia al asignar dentro
   del mismo bloque y se detiene en los puntos de unión (*joins*).
4. **CSE local** (eliminación de subexpresiones comunes): tabla hash por bloque,
   con canonicalización conmutativa de `a+b` / `b+a`.
5. **Código muerto**:
   - Eliminación de asignaciones a temporales nunca usados.
   - Limpieza de etiquetas y saltos huérfanos.
   - Eliminación de bloques inalcanzables desde el bloque de entrada.
6. **Punto fijo simple**: repetir la secuencia de pases (máx. 10 iteraciones) hasta que la lista
   de cuádruples no cambie.

**Salida:** `{ optimizedQuads, blocks, passesLog, removedCount }`.

**Criterio de aceptación:** los ejemplos de test reducen el número de cuádruples sin alterar el
resultado de ejecución (verificado en la Fase 4). Ejemplo: `x = 2 + 3*4` debe quedar en una sola
asignación.

---

## Fase 3 — Generador de Código (target JavaScript)

### 3.1 `src/javascriptGenerator.ts`

Recorre los cuádruples **optimizados** y emite texto JS:

- **Preámbulo runtime**:
  - Helpers de `stack` (`push/pop/peek/isEmpty/size/clear`) y `queue`
    (`enqueue/dequeue/front/isEmpty/size/clear`), con la semántica validada por el semántico.
  - Helpers para arreglos (`IndexAccess`, `ArrayLiteral`).
  - Objeto `CompilerRuntime` para `print` (capturable en tests) y `read` (mockeable / stdin).
- **Mapeo de operaciones**:
  - `/` entero → semántica entera del lenguaje (`Math.trunc`).
  - `&& / || / !` → operadores nativos de JS.
  - Comparaciones → operadores nativos.
- **Traducción de flujo**: los saltos y etiquetas se traducen de vuelta a constructos
  estructurados (`while(true)`, `if`, `break`) usando contadores de bloque.
- **Sanitización de identificadores**: evitar colisiones con palabras reservadas de JS y
  nombres del preámbulo runtime.

### 3.2 Programa objeto

- `out/{programName}.js` — programa objeto (por defecto).
- `out/{programName}.ir.txt` — cuádruples intermedios y optimizados, para inspección.

---

## Fase 4 — Programa objeto + Runner CLI

### 4.1 `src/compile.ts`

Comando: `npm run compile -- archivo.tys`

- Ejecuta `compileSource()` (existente, `src/compiler.ts`); Si el análisis reporta errores,
  se aborta y se reportan.
- Si `ok`, ejecuta las fases nuevas en orden:
  1. Generador de código intermedio → cuádruples.
  2. Optimizador → cuádruples optimizados + bloques + log de pases.
  3. Generador de código JS → programa objeto.
- **Flags**:
  - `--ir` · imprime los cuádruples intermedios.
  - `--opt` · muestra los pases aplicados y el resultado optimizado.
  - `--out` · solo escribe el objeto, no lo ejecuta.
- Por defecto imprime el objeto y lo **ejecuta** en un runner aislado
  (`new Function` + `CompilerRuntime` capturado).

### 4.2 `package.json`

El proyecto usa un único `tsconfig.json`, así que el script es directo:

```json
"compile": "ts-node src/compile.ts"
```

---

## Fase 5 — Verificación

1. Ampliar el harness existente `src/tests.ts` (o crear un `src/backendTests.ts` con el mismo
   estilo console-based y encadenarlo):
   - Igualdad del `print` del objeto JS generado contra la expectativa, para:
     - Factorial (`for`), Fibonacci (`while`), `do-while`, `if/else` anidados.
     - Estructuras `stack` / `queue` (`push`/`pop`/`peek`, `enqueue`/`dequeue`/`front`).
     - Arreglos (`IndexAccess`, `ArrayLiteral`).
     - Errores del análisis → el pipeline aborta antes de generar código (reutilizar los casos
       `TestErrores` / `TestScope` ya presentes en `src/tests.ts`).
   - Test de optimización: nº de cuádruples optimizado ≤ original y semánticamente
     equivalentes (mismo `CompilerRuntime.print`).
2. Comandos de verificación (ajustados a los scripts reales de `package.json`):

```powershell
npm test
npm run compile -- examples/factorial.tys
npx tsc --noEmit   # sustituye "npm run build", que no existe en este proyecto
```

---

## Orden de implementación

| # | Entrega | Estimación |
|---|---------|-----------|
| 1 | `ir.ts` + `irFormatter.ts` + `intermediateGenerator.ts` | 2 sesiones |
| 2 | `flowGraph.ts` + `optimizer.ts` (pases locales) | 2 sesiones |
| 3 | `javascriptGenerator.ts` + runtime | 1–2 sesiones |
| 4 | CLI + programa objeto + tests end-to-end | 1 sesión |
| 5 | *(Futuro, opcional)* UI de visualización de fases | no existe UI hoy |

> Los tipos de salida (`Quads`, `Blocks`, `passesLog`) se diseñarán ya pensando en una posible
> UI futura, de modo que una integración posterior sea casi únicamente presentación. El
> proyecto actual no tiene componentes ni framework de vista; toda interacción en el corto
> plazo es por consola (`src/tests.ts` y la CLI de la Fase 4).
