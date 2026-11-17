import { findBrokenJumps, type Operand, type Quad, type QuadOp } from "./ir";
import { formatQuads } from "./irFormatter";

const BINARY_OPS = new Set<QuadOp>([
    "+", "-", "*", "%",
    "<", "<=", ">", ">=",
    "&&", "||",
]);

export const RUNTIME_SOURCE = `const CompilerRuntime = (() => {
  const output = [];
  let input = [];
  let inputIndex = 0;
  let silent = false;

  const parseInput = (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    if (trimmed !== "" && !Number.isNaN(Number(trimmed))) return Number(trimmed);
    return value;
  };

  class TyStack {
    constructor() {
      this.items = [];
    }

    push(value) {
      this.items.push(value);
    }

    pop() {
      return this.items.pop();
    }

    peek() {
      return this.items[this.items.length - 1];
    }

    isEmpty() {
      return this.items.length === 0;
    }

    size() {
      return this.items.length;
    }

    clear() {
      this.items.length = 0;
    }
  }

  class TyQueue {
    constructor() {
      this.items = [];
      this.head = 0;
    }

    enqueue(value) {
      this.items.push(value);
    }

    dequeue() {
      if (this.head >= this.items.length) return undefined;
      const value = this.items[this.head++];
      if (this.head > 32 && this.head * 2 >= this.items.length) {
        this.items = this.items.slice(this.head);
        this.head = 0;
      }
      return value;
    }

    front() {
      return this.items[this.head];
    }

    isEmpty() {
      return this.head >= this.items.length;
    }

    size() {
      return this.items.length - this.head;
    }

    clear() {
      this.items = [];
      this.head = 0;
    }
  }

  return {
    output,
    newStack() {
      return new TyStack();
    },
    newQueue() {
      return new TyQueue();
    },
    newArray() {
      return [];
    },
    print(value) {
      output.push(value);
      if (!silent && typeof console !== "undefined") console.log(value);
    },
    read() {
      if (inputIndex < input.length) return parseInput(input[inputIndex++]);
      throw new Error(
        "CompilerRuntime: no hay entrada disponible para read(). " +
        "Usa CompilerRuntime.setInput([...]) antes de ejecutar el programa."
      );
    },
    setInput(values) {
      input = (values || []).slice();
      inputIndex = 0;
    },
    setSilent(value) {
      silent = Boolean(value);
    },
    reset() {
      output.length = 0;
      input = [];
      inputIndex = 0;
      silent = false;
    }
  };
})();`;

export interface TyStackValue {
    push(value: unknown): void;
    pop(): unknown;
    peek(): unknown;
    isEmpty(): boolean;
    size(): number;
    clear(): void;
}

export interface TyQueueValue {
    enqueue(value: unknown): void;
    dequeue(): unknown;
    front(): unknown;
    isEmpty(): boolean;
    size(): number;
    clear(): void;
}

export interface CompilerRuntimeApi {
    readonly output: unknown[];
    newStack(): TyStackValue;
    newQueue(): TyQueueValue;
    newArray(): unknown[];
    print(value: unknown): void;
    read(): unknown;
    setInput(values: ReadonlyArray<unknown>): void;
    setSilent(value: boolean): void;
    reset(): void;
}

export function createCompilerRuntime(): CompilerRuntimeApi {
    const factory = new Function(`${RUNTIME_SOURCE}\nreturn CompilerRuntime;`);
    return factory() as CompilerRuntimeApi;
}

export interface JavaScriptGeneratorOptions {
    programName?: string;
    useStructured?: boolean;
}

export interface JavaScriptOutput {
    code: string;
    body: string;
    structured: boolean;
    runtimeSource: string;
}

export interface ProgramObjectInput {
    programName: string;
    optimizedQuads: Quad[];
    originalQuads?: Quad[];
    options?: Omit<JavaScriptGeneratorOptions, "programName">;
}

export interface ProgramObject {
    programName: string;
    code: string;
    body: string;
    structured: boolean;
    ir: string;
}

export interface ProgramObjectPaths {
    js: string;
    ir: string;
}

function sanitizeIdentifier(name: string): string {
    const cleaned = name.replace(/[^A-Za-z0-9_$]/g, "_");
    return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
}

function variableName(operand: Operand): string {
    const prefix = operand.kind === "temp" ? "__t_" : "__v_";
    return `${prefix}${sanitizeIdentifier(operand.name)}`;
}

function operandToJs(operand: Operand): string {
    if (operand.kind === "const" || operand.kind === "label") return operand.name;
    return variableName(operand);
}

function simpleQuadToJs(quad: Quad): string {
    const a1 = quad.arg1 ? operandToJs(quad.arg1) : "_";
    const a2 = quad.arg2 ? operandToJs(quad.arg2) : "_";
    const res = quad.result ? operandToJs(quad.result) : "_";

    if (BINARY_OPS.has(quad.op)) {
        return `${res} = ${a1} ${quad.op} ${a2};`;
    }

    switch (quad.op) {
        case "/":           return `${res} = Math.trunc(${a1} / ${a2});`;
        case "==":          return `${res} = ${a1} === ${a2};`;
        case "!=":          return `${res} = ${a1} !== ${a2};`;
        case "!":           return `${res} = !${a1};`;
        case "neg":         return `${res} = -${a1};`;
        case ":=":          return `${res} = ${a1};`;
        case "print":       return `CompilerRuntime.print(${a1});`;
        case "read":        return `${res} = CompilerRuntime.read();`;
        case "new_stack":   return `${res} = CompilerRuntime.newStack();`;
        case "new_queue":   return `${res} = CompilerRuntime.newQueue();`;
        case "new_array":   return `${res} = CompilerRuntime.newArray();`;
        case "idx_load":    return `${res} = ${a1}[${a2}];`;
        case "idx_store":   return `${a1}[${a2}] = ${res};`;
        case "push":
        case "enqueue":     return `${a1}.${quad.op}(${a2});`;
        case "clear":       return `${a1}.clear();`;
        case "pop":
        case "peek":
        case "front":
        case "dequeue":
        case "size":
        case "isEmpty":     return `${res} = ${a1}.${quad.op}();`;
        default:
            throw new Error(`[JS] Operación de cuádruple no soportada: '${quad.op}'.`);
    }
}

function collectDeclarations(quads: Quad[]): string[] {
    const names = new Set<string>();

    const add = (operand: Operand | undefined): void => {
        if (operand && (operand.kind === "var" || operand.kind === "temp")) {
            names.add(variableName(operand));
        }
    };

    for (const quad of quads) {
        add(quad.arg1);
        add(quad.arg2);
        add(quad.result);
    }

    return [...names].sort();
}

class StructuredEmitter {
    readonly lines: string[] = [];
    unsupported = false;

    private indent = 0;
    private readonly quads: Quad[];
    private readonly labelIndex = new Map<string, number>();
    private readonly backEdges = new Map<number, number[]>();

    constructor(quads: Quad[]) {
        this.quads = quads;

        quads.forEach((quad, index) => {
            if (quad.op === "label" && quad.result) {
                this.labelIndex.set(quad.result.name, index);
            }
        });

        quads.forEach((quad, index) => {
            if (quad.op !== "goto" && quad.op !== "if_false") return;

            const target = quad.op === "goto" ? quad.arg1 : quad.arg2;
            if (!target || target.kind !== "label") return;

            const targetIndex = this.labelIndex.get(target.name);
            if (targetIndex === undefined || index <= targetIndex) return;

            const sources = this.backEdges.get(targetIndex) ?? [];
            sources.push(index);
            this.backEdges.set(targetIndex, sources);
        });
    }

    run(): void {
        this.emitRange(0, this.quads.length);
    }

    private line(text: string): void {
        this.lines.push(`${"  ".repeat(this.indent)}${text}`);
    }

    private emitRange(start: number, end: number): void {
        let index = start;

        while (index < end) {
            if (this.unsupported) return;
            index = this.emitAt(index, end);
        }
    }

    private emitAt(index: number, end: number): number {
        const quad = this.quads[index];

        if (quad.op === "label") {
            const sources = this.backEdges.get(index);
            if (sources && sources.length > 0) return this.emitLoop(index, end);
            return index + 1;
        }

        if (quad.op === "if_false") return this.emitIf(index, end);

        if (quad.op === "goto") {
            this.unsupported = true;
            return end;
        }

        this.line(simpleQuadToJs(quad));
        return index + 1;
    }

    private emitLoop(headerIndex: number, rangeEnd: number): number {
        const header = this.quads[headerIndex];
        const sources = this.backEdges.get(headerIndex) ?? [];

        if (!header.result || sources.length === 0) {
            this.unsupported = true;
            return rangeEnd;
        }

        const backIndex = Math.max(...sources);
        const back = this.quads[backIndex];

        if (backIndex >= rangeEnd) {
            this.unsupported = true;
            return rangeEnd;
        }

        if (back.op === "goto") {
            const exitIndex = backIndex + 1;
            const exit = this.quads[exitIndex];

            if (!exit || exit.op !== "label" || exitIndex >= rangeEnd) {
                this.unsupported = true;
                return rangeEnd;
            }

            let guardIndex = -1;
            for (let i = headerIndex + 1; i < backIndex; i++) {
                const candidate = this.quads[i];
                if (
                    candidate.op === "if_false" &&
                    candidate.arg2 &&
                    candidate.arg2.kind === "label" &&
                    candidate.arg2.name === exit.result?.name
                ) {
                    guardIndex = i;
                    break;
                }
            }

            if (guardIndex === -1 || !this.quads[guardIndex].arg1) {
                this.unsupported = true;
                return rangeEnd;
            }

            this.line("while (true) {");
            this.indent++;
            this.emitRange(headerIndex + 1, guardIndex);
            this.line(`if (!(${operandToJs(this.quads[guardIndex].arg1!)})) break;`);
            this.emitRange(guardIndex + 1, backIndex);
            this.indent--;
            this.line("}");
            return exitIndex + 1;
        }

        if (back.op === "if_false" && back.arg1) {
            this.line("while (true) {");
            this.indent++;
            this.emitRange(headerIndex + 1, backIndex);
            this.line(`if (${operandToJs(back.arg1)}) break;`);
            this.indent--;
            this.line("}");
            return backIndex + 1;
        }

        this.unsupported = true;
        return rangeEnd;
    }

    private emitIf(index: number, rangeEnd: number): number {
        const quad = this.quads[index];

        if (!quad.arg1 || !quad.arg2 || quad.arg2.kind !== "label") {
            this.unsupported = true;
            return rangeEnd;
        }

        const targetIndex = this.labelIndex.get(quad.arg2.name);
        if (targetIndex === undefined || targetIndex <= index || targetIndex > rangeEnd) {
            this.unsupported = true;
            return rangeEnd;
        }

        const condition = operandToJs(quad.arg1);
        const beforeTarget = this.quads[targetIndex - 1];

        if (beforeTarget && beforeTarget.op === "goto" && beforeTarget.arg1) {
            const endIndex = this.labelIndex.get(beforeTarget.arg1.name);

            if (endIndex !== undefined && endIndex > targetIndex && endIndex <= rangeEnd) {
                this.line(`if (${condition}) {`);
                this.indent++;
                this.emitRange(index + 1, targetIndex - 1);
                this.indent--;
                this.line("} else {");
                this.indent++;
                this.emitRange(targetIndex + 1, endIndex);
                this.indent--;
                this.line("}");
                return endIndex + 1;
            }
        }

        this.line(`if (${condition}) {`);
        this.indent++;
        this.emitRange(index + 1, targetIndex);
        this.indent--;
        this.line("}");
        return targetIndex + 1;
    }
}

function buildStructuredBody(quads: Quad[]): string | null {
    const emitter = new StructuredEmitter(quads);
    emitter.run();

    return emitter.unsupported ? null : emitter.lines.join("\n");
}

function buildStateMachineBody(quads: Quad[]): string {
    const lines: string[] = [];
    const labelIndex = new Map<string, number>();

    quads.forEach((quad, index) => {
        if (quad.op === "label" && quad.result) {
            labelIndex.set(quad.result.name, index);
        }
    });

    lines.push("let __pc = 0;");
    lines.push(`const __quadCount = ${quads.length};`);
    lines.push("while (__pc < __quadCount) {");
    lines.push("  switch (__pc) {");

    quads.forEach((quad, index) => {
        lines.push(`    case ${index}:`);

        if (quad.op === "label") {
            lines.push(`      __pc = ${index + 1};`);
        } else if (quad.op === "goto") {
            const target = quad.arg1 ? labelIndex.get(quad.arg1.name) : undefined;
            lines.push(`      __pc = ${target ?? quads.length};`);
        } else if (quad.op === "if_false") {
            const target = quad.arg2 ? labelIndex.get(quad.arg2.name) : undefined;
            const condition = quad.arg1 ? operandToJs(quad.arg1) : "false";
            lines.push(`      __pc = (${condition}) ? ${index + 1} : ${target ?? quads.length};`);
        } else {
            lines.push(`      ${simpleQuadToJs(quad)}`);
            lines.push(`      __pc = ${index + 1};`);
        }

        lines.push("      break;");
    });

    lines.push("    default:");
    lines.push(`      __pc = __quadCount;`);
    lines.push("      break;");
    lines.push("  }");
    lines.push("}");

    return lines.join("\n");
}

export function generateJavaScript(
    quads: Quad[],
    options: JavaScriptGeneratorOptions = {},
): JavaScriptOutput {
    const broken = findBrokenJumps(quads);

    if (broken.length > 0) {
        const details = broken.map((jump) => `#${jump.index} (${jump.op} → ${jump.target})`).join(", ");
        throw new Error(`[JS] No se puede generar código: saltos a etiquetas inexistentes: ${details}.`);
    }

    const declarations = collectDeclarations(quads);
    const structuredBody = options.useStructured === false ? null : buildStructuredBody(quads);
    const structured = structuredBody !== null;
    const flowBody = structuredBody ?? buildStateMachineBody(quads);

    const bodyLines: string[] = [];
    if (declarations.length > 0) bodyLines.push(`let ${declarations.join(", ")};`);
    bodyLines.push(flowBody);

    const body = bodyLines.join("\n");
    const codeHeader = [
        `"use strict";`,
        `// Programa objeto generado por TyScript${options.programName ? ` — ${options.programName}` : ""}`,
        RUNTIME_SOURCE,
    ];

    return {
        code: `${codeHeader.join("\n")}\n\n${body}\n`,
        body,
        structured,
        runtimeSource: RUNTIME_SOURCE,
    };
}

export function programObjectPaths(programName: string): ProgramObjectPaths {
    const safeName = sanitizeIdentifier(programName);
    return {
        js: `out/${safeName}.js`,
        ir: `out/${safeName}.ir.txt`,
    };
}

export function generateProgramObject(input: ProgramObjectInput): ProgramObject {
    const generated = generateJavaScript(input.optimizedQuads, {
        ...input.options,
        programName: input.programName,
    });

    const sections: string[] = [`// TyScript IR — ${input.programName}`];

    if (input.originalQuads) {
        sections.push(
            `// Cuádruples intermedios (${input.originalQuads.length})\n${formatQuads(input.originalQuads)}`
        );
    }

    sections.push(
        `// Cuádruples optimizados (${input.optimizedQuads.length})\n${formatQuads(input.optimizedQuads)}`
    );

    return {
        programName: input.programName,
        code: generated.code,
        body: generated.body,
        structured: generated.structured,
        ir: sections.join("\n\n") + "\n",
    };
}
