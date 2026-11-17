import type { Quad } from "./ir";

export interface BasicBlock {
    id: number;
    start: number;
    end: number;
    predecessors: number[];
    successors: number[];
}

export interface FlowGraph {
    blocks: BasicBlock[];
    targetBlocks: Map<string, number>;
}

export function buildFlowGraph(quads: Quad[]): FlowGraph {
    const indexByLabel = new Map<string, number>();

    quads.forEach((quad, index) => {
        if (quad.op === "label" && quad.result) {
            indexByLabel.set(quad.result.name, index);
        }
    });

    const leaders = new Set<number>();
    if (quads.length > 0) leaders.add(0);

    quads.forEach((quad, index) => {
        if (quad.op === "label") {
            leaders.add(index);
            return;
        }

        if (quad.op === "goto" || quad.op === "if_false") {
            const targetOperand = quad.op === "if_false" ? quad.arg2 : quad.arg1;
            const targetIndex = targetOperand ? indexByLabel.get(targetOperand.name) : undefined;

            if (targetIndex !== undefined) leaders.add(targetIndex);
            if (index + 1 < quads.length) leaders.add(index + 1);
        }
    });

    const starts = [...leaders].sort((a, b) => a - b);
    const blocks: BasicBlock[] = starts.map((start, i) => ({
        id: i,
        start,
        end: i + 1 < starts.length ? starts[i + 1] : quads.length,
        predecessors: [],
        successors: [],
    }));

    for (const block of blocks) {
        if (block.start >= quads.length) continue;

        const last = quads[block.end - 1];
        const fallthroughId = block.id + 1 < blocks.length ? block.id + 1 : null;
        const successors = new Set<number>();

        if (last.op === "goto") {
            const targetId = last.arg1 ? blockOfLabel(indexByLabel, starts, last.arg1.name) : null;
            if (targetId !== null) successors.add(targetId);
        } else if (last.op === "if_false") {
            const targetId = last.arg2 ? blockOfLabel(indexByLabel, starts, last.arg2.name) : null;
            if (targetId !== null) successors.add(targetId);
            if (fallthroughId !== null) successors.add(fallthroughId);
        } else if (fallthroughId !== null) {
            successors.add(fallthroughId);
        }

        block.successors = [...successors];
        for (const succId of block.successors) {
            blocks[succId].predecessors.push(block.id);
        }
    }

    const targetBlocks = new Map<string, number>();
    for (const [labelName, labelIndex] of indexByLabel) {
        for (let i = 0; i < starts.length; i++) {
            if (labelIndex >= starts[i] && labelIndex < (i + 1 < starts.length ? starts[i + 1] : quads.length)) {
                targetBlocks.set(labelName, i);
                break;
            }
        }
    }

    return { blocks, targetBlocks };
}

function blockOfLabel(indexByLabel: Map<string, number>, starts: number[], labelName: string): number | null {
    const labelIndex = indexByLabel.get(labelName);
    if (labelIndex === undefined) return null;

    for (let i = 0; i < starts.length; i++) {
        if (starts[i] === labelIndex) return i;
        if (starts[i] > labelIndex) return null;
    }

    return null;
}