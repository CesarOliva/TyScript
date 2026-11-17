# TyScript — Academic Compiler (TypeScript → JavaScript)

An academic compiler written in **TypeScript** that compiles a small, statically typed language to **JavaScript**.

The project implements the classic compiler phases end to end:

```text
source.tys
  → lexer → parser → semantic analyzer
  → intermediate code (quads) → optimizer
  → JavaScript code generator → out/<Program>.js
  → isolated runner (Node)
```

> Language name is **TyScript** — see `documentation/1-Especificacion_LenguajeDeProgramacion.md`.

## Requirements

- Node.js (LTS recommended)
- npm

## Setup

```powershell
npm install
```

## Playground web

The React playground is available locally with:

```powershell
npm run dev
```

Use **Abrir .tys** and **Guardar .tys** to load or download a source file. **Ejecutar** runs it in the integrated terminal; programs using `read(...)` pause there until a value is entered. The step-by-step view continues to show the Lexer, Parser and Semantic phases.

Build the static site with `npm run build`.

## Quick start

```powershell
npm run compile -- examples/factorial.tys
```

Output:

```text
120
```

By default the compiler writes the object program to `out/`, executes it and prints **only the program output**. If you also want to hide npm's own banner, use:

```powershell
npm run --silent compile -- examples/factorial.tys
```

## CLI usage

```powershell
npm run compile -- <archivo.tys> [opciones]
```

| Flag | Effect |
|---|---|
| `--ir` | Prints the intermediate quads (`formatQuads`). |
| `--opt` | Prints the applied optimization passes and the optimized quads. |
| `--out` | Only writes `out/<Program>.js` and `out/<Program>.ir.txt`; does not execute. |
| `-h`, `--help` | Shows help and exits with code 0. |

Flags are combinable:

```powershell
npm run --silent compile -- examples/factorial.tys --ir --opt
npm run --silent compile -- examples/factorial.tys --out
```

Generated files:

```text
out/Factorial.js       # self-contained object program (runtime + generated body)
out/Factorial.ir.txt   # intermediate and optimized quads
```

`out/` is ignored by git.

### Interactive input (`read`)

Programs that use `read(variable);` accept input **one value per line**. In an interactive terminal, type the value and press `Enter` for each `read`. You can also pipe the values:

```powershell
# PowerShell
"10`n20" | npm run --silent compile -- examples/lectura.tys
```

```bash
# bash / zsh
printf "10\n20\n" | npm run --silent compile -- examples/lectura.tys
```

The generated object program works the same way:

```powershell
"10`n20" | node out/Lectura.js
```

## Examples

All programs live in `examples/` and can be compiled and executed directly.

| File | Covers | Expected output |
|---|---|---|
| `factorial.tys` | `for`, constants, multiplication | `120` |
| `fibonacci.tys` | `while`, sequential state | `0 1 1 2 3 5 8 13 21 34` (one per line) |
| `cuenta_regresiva.tys` | `do-while` | `3 2 1 Fin` |
| `condicionales.tys` | `if / else if / else`, `&&`, `\|\|`, `!` | `Aprobado`, `Cumple asistencia, pero debe tareas`, `Tiene al menos un requisito` |
| `arreglos.tys` | array literals, index read/write | `Suma: 108`, `Primer elemento: 5` |
| `estructuras.tys` | `stack<int>`, `queue<string>`, `push/pop/peek`, `enqueue/dequeue/front` | `30 20 10` (stack) and `Ana Luis Marta` (queue) |
| `primos.tys` | nested loops, `%`, boolean flag | `2 3 5 7 11 13 17 19 23 29` |
| `lectura.tys` | `read`, arithmetic, integer division | prompts + `30`, `200`, `15` for input `10`, `20` |
| `triangle.tys` | `read`, compound boolean conditions, `else if` | triangle classification |

Example:

```powershell
npm run --silent compile -- examples/primos.tys
```

```powershell
"3`n3`n3" | npm run --silent compile -- examples/triangle.tys
```

## Tests

Run the console test harness:

```powershell
npm test
```

`src/compiler/tests.ts` exercises every phase:

- **Lexer / parser / semantic analyzer**: valid program, accumulated semantic errors, and out-of-scope variable errors.
- **Intermediate code**: quads for `for`, `while`, `do-while`, nested `if/else`, stacks, queues, arrays, logic and `read`; verifies that every jump target exists.
- **Optimizer**: constant folding, algebraic simplification, constant/copy propagation, CSE, dead temporaries, orphan labels and unreachable blocks.
- **JavaScript generation**: executes the generated object program with a silent `CompilerRuntime`, compares `print` output against the expectation, and checks equivalence before/after optimization.

Type-check the whole project:

```powershell
npx tsc --noEmit
```

## Project structure

```text
src/
  lexer.ts                 # scanner (source → Token[])
  ast.ts                   # AST node definitions
  parser.ts                # recursive-descent parser (Token[] → AST)
  symbolTable.ts           # scoped symbol table
  semanticAnalyzer.ts      # type/scope checks and accumulated diagnostics
  compiler.ts              # compileSource(): lexer → parser → semantic
  ir.ts                    # Quad/Operand types, temporals, labels, jump checks
  irFormatter.ts           # textual and tabular quad rendering
  intermediateGenerator.ts # AST → quads
  flowGraph.ts             # leaders, basic blocks, CFG
  optimizer.ts             # local/basic-block optimization passes
  javascriptGenerator.ts   # quads → JavaScript + CompilerRuntime
  compile.ts               # CLI, program object writer, isolated runner
  tests.ts                 # end-to-end test harness
examples/                  # sample TyScript programs
documentation/             # specs + Explanation/ per-module notes
out/                       # generated object programs (git-ignored)
```

## Language overview

- **Program shape:** `program Identifier { statements }`
- **Primitive types:** `int`, `float`, `bool`, `string`
- **Structured types:** `stack<T>` and `queue<T>` with primitive `T`
- **Arrays:** single-dimensional `T[]`, e.g. `int[] numbers = [10, 20, 30];`
- **Declarations:** `int x = 10;`, `int x;`, `const int MAX = 100;`, `stack<int> s;`, `int[] a = [1, 2];`
- **Assignment:** `x = expr;` and indexed assignment `arr[i] = expr;`
- **Control flow:** `if / else if / else`, `for`, `while`, `do { ... } while (cond);`
- **I/O:** `print(expression);`, `read(variable);`
- **Collections:** `push`, `pop`, `peek`, `isEmpty`, `size`, `clear` for stacks; `enqueue`, `dequeue`, `front`, `isEmpty`, `size`, `clear` for queues
- **Operators:** `+ - * / %`, `== != < <= > >=`, `&& || !`
- **Comments:** `//` single-line
- **Statement terminator:** `;`

Out of scope: user-defined functions, classes, modules, multidimensional arrays, `const` of structured/array types.

Full details: `documentation/1-Especificacion_LenguajeDeProgramacion.md`.

## Documentation

- `documentation/1-Especificacion_LenguajeDeProgramacion.md` — language definition and types.
- `documentation/2-Especificacion_Lexica_Formal.md` — tokens, regexes and lexical acceptance criteria.
- `documentation/3-Especificacion_Sintactica_Formal.md` — EBNF grammar and precedence.
- `documentation/4-LogicaProposicional_Flujo.md` — flowcharts and propositional-logic notes.
- `documentation/5-Compilador.md` — implementation plan for the full pipeline.
- `documentation/Explanation/` — per-module notes:
  `Lexer.md`, `AST.md`, `Parser.md`, `SymbolTable.md`, `SemanticAnalyzer.md`,
  `Ir.md`, `IrFormatter.md`, `IntermediateGenerator.md`, `FlowGraph.md`,
  `Optimizer.md`, `JavaScriptGenerator.md`, `Compiler.md`, `Compile.md`.

## Status

| Phase | Status |
|---|---|
| Lexer | ✅ Implemented |
| Parser + AST | ✅ Implemented |
| Semantic analyzer + symbol table | ✅ Implemented |
| Intermediate code (quads) | ✅ Implemented |
| Optimizer (local + basic blocks) | ✅ Implemented |
| JavaScript code generation + runtime | ✅ Implemented |
| CLI (`compile`) + isolated runner | ✅ Implemented |
| End-to-end test harness | ✅ Implemented (`npm test`) |
