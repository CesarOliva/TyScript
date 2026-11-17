import { buildFlowGraph, type BasicBlock } from "./flowGraph";
import type { Operand, Quad, QuadOp } from "./ir";

const BINARY_OPS = new Set<QuadOp>([
    "+", "-", "*", "/", "%",
    "<", "<=", ">", ">=",
    "==", "!=",
    "&&", "||",
]);

const COMMUTATIVE_OPS = new Set<QuadOp>(["+", "*", "=="]);

export interface PassLogEntry {
    pass: string;
    iteration: number;
    changed: number;
}

export interface OptimizerOutput {
    optimizedQuads: Quad[];
    blocks: BasicBlock[];
    passesLog: PassLogEntry[];
    removedCount: number;
}

function isNumberName(name: string): boolean {
    return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(name);
}

function isIntName(name: string): boolean {
    return /^[+-]?\d+$/.test(name);
}

function constValue(operand: Operand | undefined): number | boolean | undefined {
    if (!operand || operand.kind !== "const") return undefined;
    if (operand.name === "true") return true;
    if (operand.name === "false") return false;
    if (isNumberName(operand.name)) return Number(operand.name);
    return undefined;
}

function constOperand(name: string): Operand {
    return { kind: "const", name };
}

function isPure(operand: Operand): boolean {
    return operand.kind === "var" || operand.kind === "const";
}

function rewriteAsCopy(quad: Quad, source: Operand): void {
    quad.op = ":=";
    quad.arg1 = { ...source };
    delete quad.arg2;
}

function rewriteAsConst(quad: Quad, name: string): void {
    quad.op = ":=";
    quad.arg1 = constOperand(name);
    delete quad.arg2;
}

export function quadKey(quad: Quad): string {
    const part = (o: Operand | undefined) => (o ? `${o.kind}:${o.name}` : "-");
    return `${quad.op}|${part(quad.arg1)}|${part(quad.arg2)}|${part(quad.result)}|${quad.line ?? "-"}`;
}

function foldConstants(quads: Quad[]): number {
    let changed = 0;

    for (const quad of quads) {
        if (!quad.result) continue;

        if (BINARY_OPS.has(quad.op)) {
            const left = constValue(quad.arg1);
            const right = constValue(quad.arg2);
            if (left === undefined || right === undefined) continue;

            let value: number | boolean | undefined;

            switch (quad.op) {
                case "+": case "-": case "*": {
                    if (typeof left === "boolean" || typeof right === "boolean") continue;
                    value = quad.op === "+" ? left + right : quad.op === "-" ? left - right : left * right;
                    break;
                }
                case "/": {
                    if (typeof left === "boolean" || typeof right === "boolean") continue;
                    if (right === 0) continue;
                    if (!isIntName(left.toString()) || !isIntName(right.toString())) continue;
                    value = Math.trunc(left / right);
                    break;
                }
                case "%": {
                    if (typeof left === "boolean" || typeof right === "boolean") continue;
                    if (right === 0) continue;
                    if (!isIntName(left.toString()) || !isIntName(right.toString())) continue;
                    value = left % right;
                    break;
                }
                case "<": case "<=": case ">": case ">=": {
                    if (typeof left === "boolean" || typeof right === "boolean") continue;
                    value = quad.op === "<" ? left < right
                        : quad.op === "<=" ? left <= right
                        : quad.op === ">" ? left > right
                        : left >= right;
                    break;
                }
                case "==": case "!=": {
                    if (typeof left !== typeof right) continue;
                    value = quad.op === "==" ? left === right : left !== right;
                    break;
                }
                case "&&": case "||": {
                    if (typeof left !== "boolean" || typeof right !== "boolean") continue;
                    value = quad.op === "&&" ? left && right : left || right;
                    break;
                }
            }

            if (value === undefined) continue;
            rewriteAsConst(quad, String(value));
            changed++;
            continue;
        }

        if (quad.op === "!") {
            const v = constValue(quad.arg1);
            if (typeof v !== "boolean") continue;
            rewriteAsConst(quad, String(!v));
            changed++;
            continue;
        }

        if (quad.op === "neg") {
            const v = constValue(quad.arg1);
            if (typeof v !== "number") continue;
            rewriteAsConst(quad, String(-v));
            changed++;
        }
    }

    return changed;
}

function algebraicSimplify(quads: Quad[]): number {
    let changed = 0;

    for (const quad of quads) {
        if (!quad.result || !BINARY_OPS.has(quad.op)) continue;
        const left= quad.arg1;
        const right = quad.arg2;
        if (!left|| !right) continue;

        const isConst = (o: Operand, name: string) => o.kind === "const" && o.name === name;

        switch (quad.op) {
            case "+":
                if (isConst(left, "0")) rewriteAsCopy(quad, right);
                else if (isConst(right, "0")) rewriteAsCopy(quad, left);
                break;
            case "-":
                if (isConst(right, "0")) rewriteAsCopy(quad, left);
                break;
            case "*": {
                if (isConst(left, "1")) rewriteAsCopy(quad, right);
                else if (isConst(right, "1")) rewriteAsCopy(quad, left);
                else if (isConst(left, "0") && isPure(right)) rewriteAsConst(quad, "0");
                else if (isConst(right, "0") && isPure(left)) rewriteAsConst(quad, "0");
                break;
            }
            case "/": {
                const rVal = constValue(right);
                if (rVal === 1) rewriteAsCopy(quad, left);
                else if (constValue(left) === 0 && typeof rVal === "number" && rVal !== 0) rewriteAsConst(quad, "0");
                break;
            }
            case "%": {
                if (constValue(right) === 1 && isPure(left)) rewriteAsConst(quad, "0");
                break;
            }
            case "&&": {
                const lVal = constValue(left);
                const rVal = constValue(right);
                if (lVal === false) {
                    if (isPure(right)) rewriteAsConst(quad, "false");
                } else if (lVal === true || rVal === true) {
                    rewriteAsCopy(quad, lVal === true ? right : left);
                } else if (rVal === false && isPure(left)) {
                    rewriteAsConst(quad, "false");
                }
                break;
            }
            case "||": {
                const lVal = constValue(left);
                const rVal = constValue(right);
                if (lVal === true) {
                    if (isPure(right)) rewriteAsConst(quad, "true");
                } else if (lVal === false) {
                    rewriteAsCopy(quad, right);
                } else if (rVal === false) {
                    rewriteAsCopy(quad, left);
                }
                break;
            }
        }

        if (quad.op === ":=") changed++;
    }

    return changed;
}

const VALUE_COPYABLE = new Set<QuadOp>([...BINARY_OPS, "!", "neg", ":=", "print", "if_false"]);

function propagateConstantsAndCopies(quads: Quad[]): number {
    let changed = 0;
    const graph = buildFlowGraph(quads);

    for (const block of graph.blocks) {
        const known = new Map<string, Operand>();

        const invalidate = (name: string): void => {
            known.delete(name);
            for (const [key, value] of known) {
                if (value.kind !== "const" && value.name === name) known.delete(key);
            }
        };

        for (let i = block.start; i < block.end; i++) {
            const quad = quads[i];

            if (VALUE_COPYABLE.has(quad.op)) {
                const positions: ("arg1" | "arg2")[] =
                    BINARY_OPS.has(quad.op) ? ["arg1", "arg2"] : ["arg1"];

                for (const pos of positions) {
                    const operand = quad[pos];
                    if (!operand) continue;
                    if (operand.kind !== "var" && operand.kind !== "temp") continue;
                    const mapped = known.get(operand.name);
                    if (!mapped || mapped.name === operand.name) continue;
                    quad[pos] = { ...mapped };
                    changed++;
                }
            }

            if (!quad.result) continue;

            const name = quad.result.name;
            invalidate(name);

            if (quad.op === ":=" && quad.arg1) {
                known.set(name, { ...quad.arg1 });
            }
        }
    }

    return changed;
}

function commonSubexpressionElimination(quads: Quad[]): number {
    let changed = 0;
    const graph = buildFlowGraph(quads);

    for (const block of graph.blocks) {
        const table = new Map<string, Operand>();

        for (let i = block.start; i < block.end; i++) {
            const quad = quads[i];
            const isCandidate = BINARY_OPS.has(quad.op) || quad.op === "!" || quad.op === "neg";

            if (isCandidate && quad.result) {
                let key: string;

                if (quad.op === "!" || quad.op === "neg") {
                    key = `${quad.op}(${quad.arg1 ? quad.arg1.name : "-"})`;
                } else if (quad.arg1 && quad.arg2) {
                    let a1 = quad.arg1.name;
                    let a2 = quad.arg2.name;

                    if (COMMUTATIVE_OPS.has(quad.op) && a1 > a2) [a1, a2] = [a2, a1];
                    key = `${quad.op}(${a1}|${a2})`;
                } else {
                    key = "";
                }

                if (key !== "") {
                    const existing = table.get(key);
                    if (existing) {
                        rewriteAsCopy(quad, existing);
                        changed++;
                    } else {
                        table.set(key, { ...quad.result });
                    }
                }
            }

            const writer = quad.result?.name;
            if (writer) {
                for (const key of [...table.keys()]) {
                    if (key.includes(writer)) table.delete(key);
                }
            }
        }
    }

    return changed;
}

function removeDeadTemporalAssignments(quads: Quad[]): number {
    let removedTotal = 0;
    let removedThisTurn = true;

    while (removedThisTurn) {
        removedThisTurn = false;

        const uses = new Map<string, number>();
        for (const quad of quads) {
            for (const operand of [quad.arg1, quad.arg2]) {
                if (operand && (operand.kind === "var" || operand.kind === "temp")) {
                    uses.set(operand.name, (uses.get(operand.name) ?? 0) + 1);
                }
            }
        }

        const removableOps = new Set<QuadOp>([...BINARY_OPS, "!", "neg", ":=", "idx_load", "new_array"]);
        const keep: Quad[] = [];

        for (const quad of quads) {
            const result = quad.result;
            const isDead =
                result !== undefined &&
                result.kind === "temp" &&
                removableOps.has(quad.op) &&
                !uses.has(result.name);

            if (isDead) {
                removedThisTurn = true;
                removedTotal++;
            } else {
                keep.push(quad);
            }
        }

        quads.length = 0;
        for (const quad of keep) quads.push(quad);
    }

    return removedTotal;
}

function removeOrphanLabels(quads: Quad[]): number {
    const referenced = new Set<string>();

    for (const quad of quads) {
        if (quad.op === "goto" && quad.arg1 && quad.arg1.kind === "label") {
            referenced.add(quad.arg1.name);
        }

        if (quad.op === "if_false" && quad.arg2 && quad.arg2.kind === "label") {
            referenced.add(quad.arg2.name);
        }
    }

    const keep = quads.filter((quad) => {
        if (quad.op !== "label" || !quad.result) return true;

        return referenced.has(quad.result.name);
    });

    const removed = quads.length - keep.length;
    quads.length = 0;

    for (const quad of keep) quads.push(quad);

    return removed;
}

function removeUnreachableBlocks(quads: Quad[]): number {
    if (quads.length === 0) return 0;

    const graph = buildFlowGraph(quads);
    const reachable = new Set<number>();
    const pending = [0];

    while (pending.length > 0) {
        const blockId = pending.pop()!;
        if (reachable.has(blockId)) continue;

        reachable.add(blockId);

        for (const succ of graph.blocks[blockId].successors) {
            if (!reachable.has(succ)) pending.push(succ);
        }
    }

    const keep: Quad[] = [];

    for (const block of graph.blocks) {
        if (!reachable.has(block.id)) continue;
        for (let i = block.start; i < block.end; i++) keep.push(quads[i]);
    }

    const removed = quads.length - keep.length;
    quads.length = 0;

    for (const quad of keep) quads.push(quad);

    return removed;
}

const PASSES: Array<[string, (quads: Quad[]) => number]> = [
    ["fold", foldConstants],
    ["algebraic", algebraicSimplify],
    ["propagacion", propagateConstantsAndCopies],
    ["cse", commonSubexpressionElimination],
    ["dead-temporales", removeDeadTemporalAssignments],
    ["etiquetas-huerfanas", removeOrphanLabels],
    ["bloques-inalcanzables", removeUnreachableBlocks],
];

export function optimize(quads: Quad[]): OptimizerOutput {
    const originalCount = quads.length;
    const current: Quad[] = quads.map((quad) => ({ ...quad }));
    const passesLog: PassLogEntry[] = [];

    for (let iteration = 0; iteration < 10; iteration++) {
        const keyBefore = current.map(quadKey).join("\n");

        for (const [pass, apply] of PASSES) {
            const changed = apply(current);
            passesLog.push({ pass, iteration: iteration + 1, changed });
        }

        const keyAfter = current.map(quadKey).join("\n");
        if (keyBefore === keyAfter) break;
    }

    const graph = buildFlowGraph(current);

    return {
        optimizedQuads: current,
        blocks: graph.blocks,
        passesLog,
        removedCount: originalCount - current.length,
    };
}