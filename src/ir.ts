export type OperandKind = "var" | "temp" | "const" | "label";

export interface Operand {
    kind: OperandKind;
    name: string;
}

export const VALUE_METHODS = [
    "pop",
    "peek",
    "front",
    "dequeue",
    "size",
    "isEmpty"
] as const;

export const VOID_METHODS = [
    "push",
    "enqueue",
    "clear"
] as const;

export type MethodName = (typeof VALUE_METHODS)[number] | (typeof VOID_METHODS)[number];

export type QuadOp = 
    | "+" | "-" | "*" | "/" | "%"
    | "<" | "<=" | ">" | ">="
    | "==" | "!="
    | "&&" | "||"
    | "!" | "neg"

    | ":="

    | "new_array"
    | "idx_load"
    | "idx_store"

    | "new_stack"
    | "new_queue"
    | MethodName

    | "label"
    | "goto"
    | "if_false"

    | "print"
    | "read";

export interface Quad {
    op: QuadOp;
    arg1?: Operand;
    arg2?: Operand;
    result?: Operand;
    line?: number;
}

const CONTROL_OPS: QuadOp[] = ["label", "goto", "if_false"];

export class QuadGenerator {
    readonly quads: Quad[] = [];
    private tempCount = 0;
    private labelCount = 0;

    newTemp(): Operand {
        return { kind: "temp", name:`t${this.tempCount++}`};
    }

    newLabel(): Operand {
        return { kind: "label", name:`L${this.labelCount}`};
    }

    emit(op: QuadOp, arg1?: Operand, arg2?: Operand, result?: Operand, line?: number): Quad {
        const quad: Quad = { op };

        if (arg1 !== undefined) quad.arg1 = arg1;
        if (arg2 !== undefined) quad.arg2 = arg2;
        if (result !== undefined) quad.result = result;
        if (line !== undefined) quad.line = line;

        this.quads.push(quad);
        return quad;
    }

    label(target: Operand): Quad {
        return this.emit("label", undefined, undefined, target);
    }

    goto(target: Operand): Quad {
        return this.emit("goto", target);
    }

    emitIfFalse(condition: Operand, target: Operand): Quad {
        return this.emit("if_false", condition, target);
    }
}

export interface BrokenJump {
    index: number;
    op: QuadOp;
    target: string;
}

export function collectLabels(quads: Quad[]): Set<string> {
    const labels = new Set<string>();

    for (const quad of quads) {
        if (quad.op === "label" && quad.result) {
            labels.add(quad.result.name);
        }
    }

    return labels;
}

export function findBrokenJumps(quads: Quad[]): BrokenJump[] {
    const label = collectLabels(quads);
    const broken: BrokenJump[] = [];

    quads.forEach((quad, index) => {
        if (CONTROL_OPS.includes(quad.op) && quad.op !== "label" && quad.arg1 && quad.arg1.kind === "label") {
            if (!label.has(quad.arg1.name)) {
                broken.push({ index, op: quad.op, target: quad.arg1.name });
            }
        }
    })

    return broken;
}