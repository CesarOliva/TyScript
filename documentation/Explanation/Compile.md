# Explicación — `src/compile.ts` (Fase 4)

Este módulo implementa la **Fase 4 del plan** (`documentation/5-Compilador.md`): la **CLI de compilación** y el **runner** que lleva el pipeline completo de TyScript hasta un programa ejecutable:

```text
archivo.tys
  → compileSource()        (léxico → sintáctico → semántico)
  → IntermediateGenerator  (cuádruples)
  → optimize()             (optimizador)
  → generateProgramObject()(JavaScript + reporte IR)
  → out/<Programa>.js / .ir.txt
  → ejecución aislada con CompilerRuntime
```

El script de `package.json` es:

```json
"compile": "ts-node src/compile.ts"
```

### 1. Uso

```powershell
npm run compile -- examples/factorial.tys
npm run compile -- examples/factorial.tys --ir
npm run compile -- examples/factorial.tys --opt
npm run compile -- examples/factorial.tys --out
npm run compile -- --help
```

| Flag | Efecto |
|---|---|
| `--ir` | Imprime los cuádruples intermedios con `formatQuads()`. |
| `--opt` | Imprime el resumen de pases aplicados y los cuádruples optimizados. |
| `--out` | Solo escribe los archivos de `out/`, muestra sus rutas y no ejecuta. |
| `-h`, `--help` | Muestra la ayuda y termina con código 0. |

Sin `--out`, el comportamiento por defecto es **escribir el objeto en silencio y ejecutarlo mostrando únicamente la salida del programa** (los `print`). Las banderas son combinables: `--ir --opt` añade la traza de inspección antes del resultado. Si se quiere ocultar también el banner que imprime `npm`, puede usarse `npm run --silent compile -- ...`.

### 2. Parseo de argumentos

`parseArgs(argv)` es deliberadamente manual para mantener la CLI sin dependencias:

* Reconoce los flags anteriores.
* El primer argumento que no empieza por `-` se toma como archivo fuente.
* Cualquier flag desconocido o segundo argumento posicional se acumula en `errors`; la CLI lo reporta junto con la ayuda y devuelve código 1.

Toda la lógica está expuesta como **`runCli(argv): number`**, y el módulo solo la ejecuta automáticamente gracias al guard:

```ts
if (require.main === module) {
    process.exitCode = runCli(process.argv.slice(2));
}
```

Esto permite probar la CLI desde otro módulo sin lanzar un proceso hijo. Se usa `process.exitCode` en lugar de `process.exit()` para permitir que la salida de consola se vacíe correctamente.

### 3. Análisis y diagnósticos

1. Se lee el archivo con `readFileSync(file, "utf8")`. Si falla (por ejemplo `ENOENT`), se informa y se devuelve 1.
2. Se llama a `compileSource()` (ver `Compiler.md`).
3. Si `ok` es `false` o no hay AST, `printDiagnostics()` imprime cada error con su fase y ubicación y la CLI termina con código 1:

   ```text
   ❌ Compilación fallida: bad.tys
     [Semántico] La variable 'y' no ha sido declarada
     [Semántico] La condición del 'if' debe ser de tipo 'bool', se recibió 'int'
   ```

   Las fases se muestran como `Léxico`, `Sintáctico` y `Semántico`. El pipeline se detiene aquí: no se genera IR ni código.

### 4. Generación y escritura del programa objeto

Con el AST válido:

1. `new IntermediateGenerator().generate(ast)` produce los cuádruples originales.
2. `optimize(originalQuads)` devuelve `optimizedQuads`, bloques y `passesLog`.
3. `generateProgramObject({ programName, optimizedQuads, originalQuads })` construye:
   * `code`: programa autocontenido (`"use strict"` + runtime + cuerpo).
   * `body`: solo el cuerpo, para el runner.
   * `structured`: si el flujo se reconstruyó o se usó la máquina de estados.
   * `ir`: reporte con los cuádruples intermedios y optimizados.
4. `programObjectPaths(ast.name)` calcula las rutas y se crean con `mkdirSync("out", { recursive: true })`:

   ```text
   out/Factorial.js       # programa objeto
   out/Factorial.ir.txt   # cuádruples originales + optimizados
   ```

   El nombre del archivo se sanitiza (por ejemplo, caracteres no alfanuméricos se reemplazan por `_`). `out/` está en `.gitignore` porque es salida generada.

Los archivos se escriben siempre (también en una ejecución normal), pero las rutas solo se muestran con `--out`; así una ejecución normal no imprime información adicional.

Cualquier fallo de generación o escritura se captura y se reporta con código 1.

### 5. Visualización opcional

* **`--ir`**: encabezado con el número de cuádruples y `formatQuads(originalQuads)`.
* **`--opt`**: encabezado con el tamaño antes/después y `removedCount`; luego `printPassSummary()` agrega los `passesLog` por nombre de pase:

  ```text
  === Optimización (13 → 10, eliminados: 3) ===
  Pases aplicados:
    fold: 2 cambio(s)
    algebraic: 1 cambio(s)
  ```

  Finalmente imprime los cuádruples optimizados.

### 6. Runner aislado

Sin `--out`, la CLI:

1. No imprime el código del programa objeto: lo escribe en `out/` y pasa directamente a la ejecución. Solo se ven los `print` del programa.
2. Crea un runtime **nuevo** con `createCompilerRuntime()`.
3. Si el IR contiene algún cuádruple `read`, prepara la entrada:
   * **tubería / archivo** (`echo 21 | npm run compile -- programa.tys`): se lee toda la entrada con `readFileSync(0, "utf8")`, se separa por líneas y se entrega con `runtime.setInput(lines)`;
   * **terminal interactiva (TTY)**: no se precarga nada para no bloquear; el runtime pide cada valor **línea por línea** cuando el programa ejecuta `read()`, leyendo de `stdin` de forma síncrona. Si el sistema no permite esa lectura síncrona, muestra una indicación para introducir todos los valores y terminar con `Ctrl+Z` + Enter (Windows) o `Ctrl+D` (Unix);
   * si no hay entrada disponible, el runtime lanza un error claro.
4. Ejecuta el cuerpo con:

   ```ts
   new Function("CompilerRuntime", object.body)(runtime);
   ```

   El runtime se pasa como **parámetro**, no se publica en `globalThis`: cada ejecución queda aislada y no hay contaminación global. El cuerpo usa los mismos helpers que el archivo `.js` autónomo.

Los `print` del programa aparecen por consola mediante `CompilerRuntime.print`; un error en tiempo de ejecución se reporta como `❌ Error de ejecución: ...` con código 1. El programa objeto escrito en `out/` también funciona de forma autónoma: `node out/Programa.js` acepta entrada interactiva o por tubería.

### 7. Códigos de salida

| Situación | Código |
|---|---|
| Compilación y ejecución correctas | `0` |
| `--help` | `0` |
| Archivo ilegible, error de análisis, de generación/escritura o de ejecución | `1` |

### 8. Verificación realizada

* `npm run compile -- examples/factorial.tys` → escribe el objeto, ejecuta y muestra únicamente `120`.
* `npm run --silent compile -- examples/factorial.tys` → lo mismo, sin el banner de `npm`.
* `--ir` muestra los 13 cuádruples del `for` y `--opt` indica que no hubo cambios (el factorial ya es compacto).
* `--out` escribe `out/Factorial.js` y `out/Factorial.ir.txt` sin ejecutar.
* Un programa con variable no declarada y `if` no booleano termina con código 1 y ambos diagnósticos semánticos, sin generar `out/`.
* Un programa con `read` ejecutado con una tubería (`"20" | ...`) imprime `Mayor de edad`.
* `npx tsc --noEmit` no reporta errores.
