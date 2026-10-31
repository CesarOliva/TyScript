# Plan de Implementación — Pipeline "Backend" del Compilador TyScript

## Estado actual

El compilador TyScript (TypeScript / React / Vite) cubre únicamente el *front-end*:

```
lexer → parser → análisis semántico → tabla de símbolos
```

Todo el pipeline vive en `src/Analyzer/` y el punto de entrada es `src/Analyzer/compiler.ts`
(`compileSource(source)`). **No existe IR, optimizador ni generación de código.**

Este plan añade las fases restantes sin romper lo existente:

```
Generador de código intermedio → Optimizador → Generador de código → Programa objeto
```

## Decisiones de diseño

| Decisión | Valor |
|---|---|
| Formato del código intermedio | **Cuádruples** (`op, arg1, arg2, result`) |
| Alcance del optimizador | **Local + bloques básicos** con grafo de flujo |
| Lenguaje objetivo (programa objeto) | **JavaScript / Node** |
| Integración con la UI | **Fase 1: solo CLI**; en una etapa futura tabs + vista paso a paso |
| Pipeline que accede al front-end | `compileSource()` existente; si hay errores se aborta y se reportan |

## Nueva estructura de archivos

```
src/Backend/
  ir.ts                        # Tipos Quad, temps, etiquetas
  irFormatter.ts               # Cuádruples → texto legible (t1 = a + b)
  intermediateGenerator.ts     # Fase 1: AST → cuádruples
  flowGraph.ts                 # Líderes, bloques básicos, grafo de flujo
  optimizer.ts                 # Fase 2: pases de optimización con registro
  javascriptGenerator.ts       # Fase 3: cuádruples optimizados → JS
src/cli/
  compile.ts                   # Fase 4: programa objeto + runner CLI
```

---

## Fase 1 — Generador de Código Intermedio (cuádruples)

### 1.1 `ir.ts`

- `interface Quad { op: string; arg1?: Operand; arg2?: Operand; result?: Operand; line?: number; }`
- Operaciones soportadas:
  - Aritméticas / relacionales / lógicas: `+ - * / % < <= > >= == != and or not`
  - Asignación: `:=`
  - Control de flujo: `label`, `goto`, `if_false`
  - Estructuras de datos: `new_stack`, `new_queue`, `push`, `pop`, `peek`, `top`, `isEmpty`, `isFull`, `enqueue`, `dequeue`, `front`, `size`
  - I/O: `print`, `read`
- Clase `QuadGenerator` con contadores de temporales (`t0, t1, ...`) y etiquetas (`L0, L1, ...`).

### 1.2 `intermediateGenerator.ts`

Recorrido del `ProgramNode` / `StatementNode` definidos en `src/Analyzer/ast.ts`:

- **Expresiones**:
  - `Literal` → constante.
  - `Identifier` → nombre de variable/constante.
  - `MethodCall` → cuádruples de estructura (`push`, `pop`, `enqueue`, ...).
  - `BinaryExpression` / `UnaryExpression` → generación en postorden con temporales.
- **Sentencias**:
  - Asignación (incluidos índices `IndexAccess`) → `:=`.
  - `print` → quad `print`, arg. `read` → quad `read`.
  - Declaraciones de variables/constantes → `:=` / `new_stack` / `new_queue`.
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
  - `do-while`: cuerpo primero, `if cond goto L_start` al final.
  - `for`: init → versión de `while` con update antes del salto de vuelta.

### 1.3 `irFormatter.ts`

- Renderizar cada cuádruple como línea indexada + formato clásico:
  - `t0 = a + b`, `if_false t1 goto L2`, `goto L0`, `label L3`.
- Representación tabular de 4 columnas (`#`, `op`, `arg1`, `arg2`, `result`) reutilizable en la futura UI.

**Criterio de aceptación:** para los ejemplos de `src/Analyzer/examples.ts`, el IR formateado
imprime sin errores y toda etiqueta referenciada por un salto existe (test que falla ante
`goto`/`if_false` hacia etiquetas inexistentes).

---

## Fase 2 — Optimizador (local + bloques básicos)

### 2.1 `flowGraph.ts`

- Calcular **líderes**: primera instrucción, destinos de saltos, instrucción posterior a un salto.
- Construir **bloques básicos** y **aristas** según los saltos → mapa de `predecessors / successors`.

### 2.2 `optimizer.ts`

Cada pase anota sus cambios en un **log de pases** (crucial para la futura UI paso a paso):

1. **Plegado de constantes**: `2+3 → t=5`, `true and false → false`.
2. **Simplificación algebraica**: `x+0`, `0+x`, `x*1`, `x*0` (esta última solo si `x` es puro, sin efectos).
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
El log queda expuesto en el resultado del pipeline para la integración futura con la UI.

**Criterio de aceptación:** los ejemplos de test reducen el número de cuádruples sin alterar el
resultado de ejecución (verificado en la Fase 4). Ejemplo: `x = 2 + 3*4` debe quedar en una sola
asignación.

---

## Fase 3 — Generador de Código (target JavaScript)

### 3.1 `javascriptGenerator.ts`

Recorre los cuádruples **optimizados** y emite texto JS:

- **Preámbulo runtime**:
  - Helpers de `stack` (`push/pop/peek/isEmpty/isFull`) y `queue` (`enqueue/dequeue/front/isFull/isEmpty/size`).
  - Objeto `CompilerRuntime` para `print` (capturable en tests) y `read` (mockeable / stdin).
- **Mapeo de operaciones**:
  - `/` entero → semántica entera del lenguaje (`Math.trunc`).
  - `and / or / not` → `&& / || / !`.
  - Comparaciones → operadores nativos.
- **Traducción de flujo**: los saltos y etiquetas se traducen de vuelta a constructos
  estructurados (`while(true)`, `if`, `break`) usando contadores de bloque.
- **Sanitización de identificadores**: evitar colisiones con palabras reservadas de JS y
  nombres del preámbulo runtime.
- **Correlación con el editor**: comentarios `// L{line}` con la línea original del código fuente.

### 3.2 Programa objeto

- `out/{programName}.js` — programa objeto (por defecto).
- `out/{programName}.ir.txt` — cuádruples intermedios y optimizados, para inspección.

---

## Fase 4 — Programa objeto + Runner CLI

### 4.1 `src/cli/compile.ts`

Comando: `npm run compile -- archivo.tys`

- Ejecuta `compileSource()` (existente); si falla, reporta los errores del front-end y aborta.
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

```json
"compile": "ts-node -P tsconfig.node.json src/cli/compile.ts"
```

---

## Fase 5 — Verificación

1. Extender los tests (nuevo `src/Backend/tests.ts` o ampliar `src/Analyzer/tests.ts`):
   - Igualdad del `print` del objeto JS generado contra la expectativa, para:
     - Factorial (`for`), Fibonacci (`while`), `do-while`, `if/else` anidados.
     - Estructuras `stack` / `queue` (push/pop, enqueue/dequeue).
     - Errores semánticos → el pipeline aborta antes de generar código.
   - Test de optimización: nº de cuádruples optimizado ≤ original y semánticamente
     equivalentes (mismo `CompilerRuntime.print`).
2. Comandos de verificación:

```powershell
npm test
npm run compile -- examples/factorio.tys
npm run build
```

---

## Orden de implementación

| # | Entrega | Estimación |
|---|---------|-----------|
| 1 | `ir.ts` + `irFormatter.ts` + `intermediateGenerator.ts` | 2 sesiones |
| 2 | `flowGraph.ts` + `optimizer.ts` (pases locales) | 2 sesiones |
| 3 | `javascriptGenerator.ts` + runtime | 1–2 sesiones |
| 4 | CLI + programa objeto + tests end-to-end | 1 sesión |
| 5 | *(Futuro)* Tabs UI + paso a paso con `passesLog` / `blocks` | próxima etapa |

> Los tipos de salida (`Quads`, `Blocks`, `passesLog`) se diseñarán ya pensando en la futura UI,
> de modo que la integración en `App.tsx` / `Tabs.tsx` sea casi únicamente presentación:
> nuevas pestañas (Código intermedio, Optimizado, Ensamblador/Objeto) y la extensión de
> `CompilerStepEngine` con fases `intermedio | optimizado | codigo | objeto`.
