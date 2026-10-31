import { BINARY_OPS, Operand, Quad, QuadOp } from "./ir";

export interface QuadRow {
    index: number;
    op: string;
    arg1: string;
    arg2: string;
    result: string;
}

export function renderOperand(operand: Operand | null): string {
    if (operand === null) {
        return "-";
    }
    if (operand.kind === "const") {
        if (typeof operand.value === "string") {
            return `"${operand.value}"`;
        }
        if (typeof operand.value === "boolean") {
            return operand.value ? "true" : "false";
        }
        return String(operand.value);
    }
    return String(operand.value);
}

export function formatQuad(quad: Quad, index: number): string {
    switch (quad.op) {
        case "label":
            return `${renderLabel(quad.result)}:`;
        case "goto":
            return `goto ${renderLabel(quad.arg1)}`;
        case "if":
            return `if ${renderOperand(quad.arg1)} goto ${renderLabel(quad.arg2)}`;
        case "if_false":
            return `if_false ${renderOperand(quad.arg1)} goto ${renderLabel(quad.arg2)}`;
        case ":=":
            return `${renderOperand(quad.result)} = ${renderOperand(quad.arg1)}`;
        case "uminus":
        case "not":
            return `${renderOperand(quad.result)} = ${quad.op} ${renderOperand(quad.arg1)}`;
        case "print":
            return `print ${renderOperand(quad.arg1)}`;
        case "read":
            return `read ${renderOperand(quad.result)}`;
        case "new_stack":
        case "new_queue":
            return `${renderOperand(quad.result)} = ${quad.op}()`;
        case "alloc":
            return `${renderOperand(quad.result)} = new_array(${renderOperand(quad.arg1)})`;
        case "idx_get":
            return `${renderOperand(quad.result)} = ${renderOperand(quad.arg1)}[${renderOperand(quad.arg2)}]`;
        case "idx_set":
            return `${renderOperand(quad.arg1)}[${renderOperand(quad.arg2)}] = ${renderOperand(quad.result)}`;
        default:
            if (isStructMethod(quad.op as QuadOp)) {
                return formatStructMethod(quad);
            }
            if (BINARY_OPS.includes(quad.op)) {
                return `${renderOperand(quad.result)} = ${renderOperand(quad.arg1)} ${quad.op} ${renderOperand(quad.arg2)}`;
            }
            return `${index}: ${quad.op}`;
    }
}

export function formatQuads(quads: Quad[]): string {
    return quads
        .map((quad, index) => `${index}: ${formatQuad(quad, index)}`)
        .join("\n");
}

export function toQuadRows(quads: Quad[]): QuadRow[] {
    return quads.map((quad, index) => ({
        index,
        op: quad.op,
        arg1: renderOperand(quad.arg1),
        arg2: renderOperand(quad.arg2),
        result: renderOperand(quad.result)
    }));
}

const STRUCT_OPS: readonly QuadOp[] = [
    "push", "pop", "peek", "isEmpty", "size", "clear",
    "enqueue", "dequeue", "front"
];

function isStructMethod(op: QuadOp): boolean {
    return STRUCT_OPS.includes(op);
}

function formatStructMethod(quad: Quad): string {
    const object = quad.arg1 === null ? "-" : String(quad.arg1.value);
    if (quad.result === null) {
        return `${object}.${quad.op}(${quad.arg2 === null ? "" : renderOperand(quad.arg2)})`;
    }
    return `${renderOperand(quad.result)} = ${object}.${quad.op}(${quad.arg2 === null ? "" : renderOperand(quad.arg2)})`;
}

function renderLabel(operand: Operand | null): string {
    return operand === null ? "-" : String(operand.value);
}
