export type OperandKind = "const" | "name" | "temp" | "label";

export interface Operand {
    kind: OperandKind;
    value: string | number | boolean;
}

export type QuadOp =
    | "+"
    | "-"
    | "*"
    | "/"
    | "%"
    | "<"
    | "<="
    | ">"
    | ">="
    | "=="
    | "!="
    | "and"
    | "or"
    | "uminus"
    | "not"
    | ":="
    | "label"
    | "goto"
    | "if"
    | "if_false"
    | "new_stack"
    | "new_queue"
    | "push"
    | "pop"
    | "peek"
    | "isEmpty"
    | "size"
    | "clear"
    | "enqueue"
    | "dequeue"
    | "front"
    | "print"
    | "read"
    | "alloc"
    | "idx_get"
    | "idx_set";

export interface Quad {
    op: QuadOp;
    arg1: Operand | null;
    arg2: Operand | null;
    result: Operand | null;
    line?: number;
}

export interface QuadGeneratorSnapshot {
    tempCount: number;
    labelCount: number;
}

type OperandLike = string | number | boolean | Operand;

export class QuadGenerator {
    public quads: Quad[] = [];
    private tempCounter = 0;
    private labelCounter = 0;

    public newTemp(): Operand {
        return { kind: "temp", value: `t${this.tempCounter++}` };
    }

    public newLabel(): Operand {
        return { kind: "label", value: `L${this.labelCounter++}` };
    }

    public emit(op: QuadOp, arg1?: OperandLike, arg2?: OperandLike, result?: OperandLike): Quad {
        const quad: Quad = {
            op,
            arg1: arg1 === undefined ? null : toOperand(arg1),
            arg2: arg2 === undefined ? null : toOperand(arg2),
            result: result === undefined ? null : toOperand(result)
        };
        this.quads.push(quad);
        return quad;
    }

    public last(): Quad {
        return this.quads[this.quads.length - 1];
    }

    public take(): Quad[] {
        const out = this.quads;
        this.quads = [];
        this.tempCounter = 0;
        this.labelCounter = 0;
        return out;
    }

    public getSnapshot(): QuadGeneratorSnapshot {
        return { tempCount: this.tempCounter, labelCount: this.labelCounter };
    }
}

export function toOperand(value: OperandLike): Operand {
    if (isOperand(value)) {
        return value;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return { kind: "const", value };
    }
    throw new Error(`Operando no soportado en IR: ${JSON.stringify(value)}`);
}

export function isOperand(value: unknown): value is Operand {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const candidate = value as Operand;
    return (
        typeof candidate.kind === "string" &&
        ["const", "name", "temp", "label"].includes(candidate.kind) &&
        typeof candidate.value !== "object"
    );
}

export const BINARY_OPS: readonly QuadOp[] = [
    "+", "-", "*", "/", "%",
    "<", "<=", ">", ">=", "==", "!=",
    "and", "or"
];

export const STACK_METHODS: readonly string[] = ["push", "pop", "peek", "isEmpty", "size", "clear"];
export const QUEUE_METHODS: readonly string[] = ["enqueue", "dequeue", "front", "isEmpty", "size", "clear"];

export const VOID_STRUCT_METHODS: readonly string[] = ["push", "enqueue", "clear"];
export const VALUE_STRUCT_METHODS: readonly string[] = ["pop", "peek", "front", "dequeue", "isEmpty", "size"];

export function isStackValidMethod(method: string): boolean {
    return STACK_METHODS.includes(method);
}

export function isQueueValidMethod(method: string): boolean {
    return QUEUE_METHODS.includes(method);
}

export function findUndefinedJumpTargets(quads: Quad[]): string[] {
    const defined = new Set<string>();
    const referenced = new Set<string>();

    for (const quad of quads) {
        if (quad.op === "label") {
            if (quad.result?.kind === "label") {
                defined.add(String(quad.result.value));
            }
        }
        for (const arg of [quad.arg1, quad.arg2] as (Operand | null)[]) {
            if (arg && arg.kind === "label" && (quad.op === "goto" || quad.op === "if" || quad.op === "if_false")) {
                referenced.add(String(arg.value));
            }
        }
    }

    return [...referenced]
        .filter((label) => !defined.has(label))
        .sort();
}
