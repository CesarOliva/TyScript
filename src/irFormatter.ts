import { Operand, Quad } from "./ir";

const BINARY_OPS = new Set([
    "+", "-" , "*", "/", "%",
    "<", "<=", ">", ">=",
    "==", "!=",
    "&&", "||",
]);

export function OperandToText(operand: Operand | undefined): string {
    if (!operand) return '_';
    return operand.name;
}

function jumpToText(quad: Quad): string {
    const target = OperandToText(quad.arg1);

    if (quad.op === "label") {
        return `${OperandToText(quad.result)}`;
    }
    if (quad.op === "goto") {
        return `goto ${target}`
    }

    return `if_false ${OperandToText(quad.arg1)} goto ${OperandToText(quad.arg2)}`;
}

export function quadToText(quad: Quad): string {
    const a1 = OperandToText(quad.arg1);
    const a2 = OperandToText(quad.arg2);
    const res = OperandToText(quad.result);

    if (quad.op === "label"  || quad.op === "goto" || quad.op === "if_false") {
        return jumpToText(quad);
    }

    if (BINARY_OPS.has(quad.op)) {
        return `${res} = ${a1} ${quad.op} ${a2}`;
    }

    switch (quad.op) {
        case ":=":          return `${res} = ${a1}`;
        case "!":           return `${res} = ! ${a1}`;
        case "neg":         return `${res} = -${a1}`;
        case "print":       return `print ${a1}`;
        case "read":        return `read ${res}`;
        case "new_stack":   return `${res} = new stack`;
        case "new_queue":   return `${res} = new queue`;
        case "new_array":   return `${res} = new array`;
        case "idx_load":    return `${res} = ${a1}[${a2}]`;
        case "idx_store":   return `${a1}[${a2}] = ${res}`;
        case "push":        return `${a1}.push(${a2})`;
        case "pop":         return `${res} = ${a1}.pop()`;
        case "peek":        return `${res} = ${a1}.peek()`;
        case "enqueue":     return `${a1}.enqueue(${a2})`;
        case "dequeue":     return `${res} = ${a1}.dequeue()`;
        case "front":       return `${res} = ${a1}.front()`;
        case "size":        return `${res} = ${a1}.size()`;
        case "isEmpty":     return `${res} = ${a1}.isEmpty()`;
        case "clear":       return `${a1}.clear()`;
        default:
            return `${res} = ${a1} ${quad.op} ${a2}`;
    }
}

export function formatQuads(quads: Quad[]): string {
    const width = String(quads.length - 1).length;
    return quads
        .map((quad, index) => `${String(index).padStart(width, " ")}:\t${quadToText(quad)}`)
        .join('\n');
}

export interface QuadRow {
    '#': number;
    op: string;
    arg1: string;
    arg2: string;
    result: string;
}

export function quadTable(quads: Quad[]): QuadRow[] {
    return quads.map((quad, index) => ({
        '#': index,
        op: quad.op,
        arg1: OperandToText(quad.arg1),
        arg2: OperandToText(quad.arg2),
        result: OperandToText(quad.result)
    }))
}