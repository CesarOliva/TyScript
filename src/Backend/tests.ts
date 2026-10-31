import { compileSource } from "../Analyzer/compiler";
import { codeExamples } from "../Analyzer/examples";
import { generateIntermediateCode } from "./intermediateGenerator";
import { formatQuads } from "./irFormatter";
import { findUndefinedJumpTargets } from "./ir";

interface IrTestResult {
    name: string;
    quads: number;
    temps: number;
    labels: number;
    generatorErrors: string[];
    undefinedJumpTargets: string[];
    ir: string;
    passed: boolean;
}

function runIrTest(name: string, source: string): IrTestResult {
    console.log("==================================================");
    console.log(` RUNNING IR TEST: ${name}`);
    console.log("==================================================");

    const compiled = compileSource(source);
    if (!compiled.ok || !compiled.ast) {
        console.log(" FRONT-END FALLÓ: no se puede generar IR");
        console.table([
            { lexical: compiled.lexicalErrors.length, syntax: compiled.syntaxError, semantic: compiled.semanticErrors.length }
        ]);
        return buildResult(name, null);
    }

    const ir = generateIntermediateCode(compiled.ast);
    const undefinedJumpTargets = findUndefinedJumpTargets(ir.quads);
    const formatted = formatQuads(ir.quads);
    console.log(formatted);
    console.log(`\n Cuádruples: ${ir.quads.length} | Temporales: ${ir.tempCount} | Etiquetas: ${ir.labelCount}`);

    if (ir.errors.length > 0) {
        console.log(" ERRORES DEL GENERADOR:");
        console.table(ir.errors);
    }
    if (undefinedJumpTargets.length > 0) {
        console.log(" ETIQUETAS DE SALTO SIN DEFINIR:");
        console.table(undefinedJumpTargets);
    }
    if (ir.errors.length === 0 && undefinedJumpTargets.length === 0) {
        console.log(" IR GENERADO EXITOSAMENTE\n");
    }
    console.log("\n");

    return {
        name,
        quads: ir.quads.length,
        temps: ir.tempCount,
        labels: ir.labelCount,
        generatorErrors: ir.errors,
        undefinedJumpTargets,
        ir: formatted,
        passed: ir.errors.length === 0 && undefinedJumpTargets.length === 0
    };
}

function buildResult(name: string, _unused: null): IrTestResult {
    return {
        name,
        quads: 0,
        temps: 0,
        labels: 0,
        generatorErrors: ["front-end falló"],
        undefinedJumpTargets: [],
        ir: "",
        passed: false
    };
}

const extraCases: { name: string; source: string }[] = [
    {
        name: "DoWhile + if/else",
        source: `
program DoWhileDemo {
    int i = 0;
    do {
        print(i);
        i = i + 1;
    } while (i < 3);

    if (i == 3) {
        print("tres");
    } else {
        print("otro");
    }
}`
    },
    {
        name: "Unary + algebraic",
        source: `
program UnaryDemo {
    int a = -5;
    int b = -a + (2 * 3);
    bool flag = !(1 < 2);
    print(b);
    print(flag);
}`
    }
];

const summary: IrTestResult[] = [];

for (const key of ["valido", "arrays", "stack"] as const) {
    summary.push(runIrTest(`Ejemplo '${key}'`, codeExamples[key]));
}
extraCases.forEach((testCase) => summary.push(runIrTest(testCase.name, testCase.source)));

console.log("==================================================");
console.log(" RESUMEN IR");
console.log("==================================================");
console.table(summary.map((result) => ({
    caso: result.name,
    cuadruples: result.quads,
    temporales: result.temps,
    etiquetas: result.labels,
    errores: result.generatorErrors.length + result.undefinedJumpTargets.length,
    passed: result.passed
})));
