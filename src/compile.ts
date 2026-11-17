import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { compileSource, type CompileDiagnostic } from "./compiler";
import { IntermediateGenerator } from "./intermediateGenerator";
import { optimize } from "./optimizer";
import {
    createCompilerRuntime,
    generateProgramObject,
    programObjectPaths,
} from "./javascriptGenerator";
import { formatQuads } from "./irFormatter";

interface CliOptions {
    file?: string;
    showIr: boolean;
    showOpt: boolean;
    outOnly: boolean;
    help: boolean;
}

const HELP_TEXT = `Uso: npm run compile -- <archivo.tys> [opciones]

Compila un programa TyScript a JavaScript y lo ejecuta.

Opciones:
  --ir         Muestra los cuádruples intermedios.
  --opt        Muestra los pases aplicados y los cuádruples optimizados.
  --out        Solo escribe el programa objeto en out/; no lo ejecuta.
  -h, --help   Muestra esta ayuda.`;

function parseArgs(argv: string[]): { options: CliOptions; errors: string[] } {
    const options: CliOptions = {
        showIr: false,
        showOpt: false,
        outOnly: false,
        help: false,
    };
    const errors: string[] = [];

    for (const argument of argv) {
        switch (argument) {
            case "--ir":
                options.showIr = true;
                break;
            case "--opt":
                options.showOpt = true;
                break;
            case "--out":
                options.outOnly = true;
                break;
            case "-h":
            case "--help":
                options.help = true;
                break;
            default:
                if (argument.startsWith("-")) {
                    errors.push(`Opción desconocida: ${argument}`);
                } else if (options.file === undefined) {
                    options.file = argument;
                } else {
                    errors.push(`Argumento extra inesperado: ${argument}`);
                }
                break;
        }
    }

    return { options, errors };
}

function diagnosticPhase(phase: CompileDiagnostic["phase"]): string {
    switch (phase) {
        case "lexico": return "Léxico";
        case "sintactico": return "Sintáctico";
        case "semantico": return "Semántico";
    }
}

function printDiagnostics(file: string, diagnostics: CompileDiagnostic[]): void {
    console.error(`\n❌ Compilación fallida: ${file}`);

    for (const diagnostic of diagnostics) {
        const location = diagnostic.line !== undefined
            ? ` línea ${diagnostic.line}${diagnostic.column !== undefined ? `, col ${diagnostic.column}` : ""}`
            : "";
        console.error(`  [${diagnosticPhase(diagnostic.phase)}${location}] ${diagnostic.message}`);
    }
}

function preloadStdin(runtime: ReturnType<typeof createCompilerRuntime>): void {
    try {
        if (process.stdin.isTTY) return;

        const data = readFileSync(0, "utf8");
        const lines = data.replace(/\r\n/g, "\n").split("\n");

        if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

        runtime.setInput(lines);
    } catch {
        // Sin entrada disponible: read() reportará el error si se usa.
    }
}

function printPassSummary(optimized: ReturnType<typeof optimize>): void {
    const totals = new Map<string, number>();

    for (const entry of optimized.passesLog) {
        if (entry.changed <= 0) continue;
        totals.set(entry.pass, (totals.get(entry.pass) ?? 0) + entry.changed);
    }

    if (totals.size === 0) {
        console.log("Pases aplicados: ninguno");
        return;
    }

    console.log("Pases aplicados:");
    for (const [pass, changes] of totals) {
        console.log(`  ${pass}: ${changes} cambio(s)`);
    }
}

export function runCli(argv: string[]): number {
    const { options, errors } = parseArgs(argv);

    if (options.help) {
        console.log(HELP_TEXT);
        return 0;
    }

    if (errors.length > 0) {
        for (const error of errors) console.error(`❌ ${error}`);
        console.error(`\n${HELP_TEXT}`);
        return 1;
    }

    if (!options.file) {
        console.error("❌ Falta el archivo fuente.\n");
        console.error(HELP_TEXT);
        return 1;
    }

    let source: string;

    try {
        source = readFileSync(options.file, "utf8");
    } catch (error) {
        console.error(`❌ No se pudo leer '${options.file}': ${(error as Error).message}`);
        return 1;
    }

    const analysis = compileSource(source);

    if (!analysis.ok || !analysis.ast) {
        printDiagnostics(options.file, analysis.errors);
        return 1;
    }

    const originalQuads = new IntermediateGenerator().generate(analysis.ast);
    const optimized = optimize(originalQuads);

    if (options.showIr) {
        console.log(`\n=== Cuádruples intermedios (${originalQuads.length}) ===`);
        console.log(formatQuads(originalQuads));
    }

    if (options.showOpt) {
        console.log(`\n=== Optimización (${originalQuads.length} → ${optimized.optimizedQuads.length}, eliminados: ${optimized.removedCount}) ===`);
        printPassSummary(optimized);
        console.log(`\n=== Cuádruples optimizados (${optimized.optimizedQuads.length}) ===`);
        console.log(formatQuads(optimized.optimizedQuads));
    }

    let object;

    try {
        object = generateProgramObject({
            programName: analysis.ast.name,
            optimizedQuads: optimized.optimizedQuads,
            originalQuads,
        });
    } catch (error) {
        console.error(`❌ No se pudo generar el programa objeto: ${(error as Error).message}`);
        return 1;
    }

    const paths = programObjectPaths(analysis.ast.name);

    try {
        mkdirSync("out", { recursive: true });
        writeFileSync(paths.js, object.code, "utf8");
        writeFileSync(paths.ir, object.ir, "utf8");
    } catch (error) {
        console.error(`❌ No se pudo escribir el programa objeto: ${(error as Error).message}`);
        return 1;
    }

    console.log(`\n✅ Programa objeto generado (${object.structured ? "flujo estructurado" : "máquina de estados"}):`);
    console.log(`   ${paths.js}`);
    console.log(`   ${paths.ir}`);

    if (options.outOnly) return 0;

    console.log("\n=== Programa objeto ===");
    console.log(object.code);

    console.log("=== Ejecución ===");

    try {
        const runtime = createCompilerRuntime();

        if (originalQuads.some((quad) => quad.op === "read")) preloadStdin(runtime);

        new Function("CompilerRuntime", object.body)(runtime);
    } catch (error) {
        console.error(`\n❌ Error de ejecución: ${(error as Error).message}`);
        return 1;
    }

    return 0;
}

if (require.main === module) {
    process.exitCode = runCli(process.argv.slice(2));
}
