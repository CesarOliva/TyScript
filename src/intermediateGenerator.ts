import { 
    ConstantDeclarationNode, 
    ForStatementNode, 
    IfStatementNode, 
    ProgramNode, 
    StatementNode, 
    VariableDeclarationNode, 
    ExpressionNode,
    WhileStatementNode,
    DoWhileStatementNode,
    PrintStatementNode,
    ReadStatementNode,
    AssignmentNode,
    ExpressionStatementNode,
    LiteralNode,
    BinaryExpressionNode,
    UnaryExpressionNode,
    MethodCallNode,
    ArrayLiteralNode,
    IndexAccessNode
} from "./ast";
import { Operand, Quad, QuadGenerator, VALUE_METHODS } from "./ir";

export class IntermediateGenerator {
    private gen = new QuadGenerator();

    generate(program: ProgramNode): Quad[] {
        for (const statement of program.body) {
            this.genStatement(statement);
        }

        return this.gen.quads;
    }

    private genStatement(statement: StatementNode): void {
        switch (statement.type) {
            case "VariableDeclaration":
                return this.genVariableDeclaration(statement);
            case "ConstantDeclaration":
                return this.genConstantDeclaration(statement);
            case "IfStatement":
                return this.genIf(statement);
            case "ForStatement":
                return this.genFor(statement);
            case "WhileStatement":
                return this.genWhile(statement);
            case "DoWhileStatement":
                return this.genDoWhile(statement);
            case "PrintStatement":
                return this.genPrint(statement);
            case "ReadStatement":
                return this.genRead(statement);
            case "Assignment":
                return this.genAssignment(statement);
            case "ExpressionStatement":
                return this.genExpressionStatement(statement);
        }
    }

    private genVariableDeclaration(node: VariableDeclarationNode): void {
        if (node.varType === "stack" || node.varType.startsWith("stack<")) {
            this.gen.emit("new_stack", undefined, undefined, { kind: "var", name: node.name });
            return;
        }

        if (node.varType === "queue" || node.varType.startsWith("queue<")) {
            this.gen.emit("new_queue", undefined, undefined, { kind: "var", name: node.name });
            return;
        }

        if (node.varType.endsWith("[]")) {
            this.gen.emit("new_array", undefined, undefined, { kind: "var", name: node.name });

            if (node.initializer && node.initializer.type === "ArrayLiteral") {
                this.genArrayLiteralInto(node.initializer, { kind: "var", name: node.name });
            }

            return;
        }

        if (node.initializer) {
            const value = this.genExpression(node.initializer);
            this.gen.emit(":=", value, undefined, { kind: "var", name: node.name })
        }
    }

    private genConstantDeclaration(node: ConstantDeclarationNode): void {
        const value = this.genExpression(node.value);
        this.gen.emit(":=", value, undefined, { kind: "var", name: node.name })
    }

    private genIf(node: IfStatementNode): void {
        const condition = this.genExpression(node.condition);

        if (node.elseBranch === undefined) {
            const endLabel = this.gen.newLabel();
            this.gen.emitIfFalse(condition, endLabel);
            this.genBranch(node.thenBranch);
            this.gen.label(endLabel);
            return;
        }

        const elseLabel = this.gen.newLabel();
        const endLabel =this.gen.newLabel();

        this.gen.emitIfFalse(condition, elseLabel);
        this.genBranch(node.thenBranch);
        this.gen.goto(endLabel);
        this.gen.label(elseLabel);
        this.genBranch(node.elseBranch);
        this.gen.label(endLabel);
    }

    private genBranch(branch: StatementNode[] | IfStatementNode): void {
        if (Array.isArray(branch)) {
            for (const statement of branch) {
                this.genStatement(statement);
            }

            return;
        }

        this.genIf(branch);
    }

    private genFor(node: ForStatementNode): void {
        if (node.init) {
            this.genStatement(node.init);
        }

        const startLabel = this.gen.newLabel();
        const endLabel = this.gen.newLabel();

        this.gen.label(startLabel);

        const condition = node.condition
            ? this.genExpression(node.condition)
            : { kind: "const" as const, name: "true"};
        
        this.gen.emitIfFalse(condition, endLabel);

        for (const statement of node.body) {
            this.genStatement(statement);
        }

        if (node.update) {
            if (node.update.type === "Assignment") {
                this.genAssignment(node.update);
            } else {
                this.genExpression(node.update as ExpressionNode);
            }
        }

        this.gen.goto(startLabel);
        this.gen.label(endLabel);
    }

    private genWhile(node: WhileStatementNode): void {
        const startLabel = this.gen.newLabel();
        const endLabel = this.gen.newLabel();

        this.gen.label(startLabel);
        const condition = this.genExpression(node.condition);
        this.gen.emitIfFalse(condition, endLabel);

        for (const statement of node.body) {
            this.genStatement(statement);
        }

        this.gen.goto(startLabel);
        this.gen.label(endLabel);
    }

    private genDoWhile(node: DoWhileStatementNode): void {
        const startLabel = this.gen.newLabel();

        this.gen.label(startLabel);

        for (const statement of node.body) {
            this.genStatement(statement);
        }

        const condition = this.genExpression(node.condition);
        const skipNeg = this.gen.newTemp();

        this.gen.emit("!", condition, undefined, skipNeg);
        this.gen.emitIfFalse(skipNeg, startLabel);
    }

    private genPrint(node: PrintStatementNode): void {
        const value = this.genExpression(node.expression);
        this.gen.emit("print", value);
    }

    private genRead(node: ReadStatementNode): void {
        this.gen.emit("read", undefined, undefined, { kind: "var", name: node.target});
    }

    private genAssignment(node: AssignmentNode): void {
        const value = this.genExpression(node.value);

        if (node.index) {
            const array: Operand = { kind: "var", name: node.target };
            const index = this.genExpression(node.index);

            this.gen.emit("idx_store", array, index, value);

            return;
        }

        this.gen.emit(":=", value, undefined, { kind: "var", name: node.target});
    }

    private genExpressionStatement(node: ExpressionStatementNode): void {
        this.genExpression(node.expression);
    }

    private genExpression(expr: ExpressionNode): Operand {
        switch (expr.type) {
            case "Literal":
                return this.genLiteral(expr);
            case "Identifier":
                return { kind: "var", name: expr.name };
            case "BinaryExpression":
                return this.genBinary(expr);
            case "UnaryExpression":
                return this.genUnary(expr);
            case "MethodCall":
                return this.genMethodCall(expr);
            case "ArrayLiteral":
                return this.genArrayLiteral(expr);
            case "IndexAccess":
                return this.genIndexAccess(expr);
        }
    }

    private genLiteral(node: LiteralNode): Operand {
        return { kind: "const", name: node.raw };
    }

    private genBinary(node: BinaryExpressionNode): Operand {
        const left = this.genExpression(node.left);
        const righ = this.genExpression(node.right);
        const result = this.gen.newTemp();

        this.gen.emit(node.operator as never, left, righ, result);

        return result;
    }

    private genUnary(node: UnaryExpressionNode): Operand {
        const argument = this.genExpression(node.argument);
        const result = this.gen.newTemp();
        const op = node.operator === '-' ? "neg" : "!";
        
        this.gen.emit(op, argument, undefined, result)

        return result;
    }

    private genMethodCall(node: MethodCallNode): Operand {
        const object: Operand = { kind: "var", name: node.object };
        const result = this.gen.newTemp();
        const isValueMethod = VALUE_METHODS.includes(node.method as never);

        if (!isValueMethod) {
            const arg = node.args[0] ? this.genExpression(node.args[0]) : undefined;
            this.gen.emit(node.method as never, object, arg, undefined);
        }

        this.gen.emit(node.method as never, object, undefined, result);

        return result;
    }

    private genArrayLiteral(node: ArrayLiteralNode): Operand {
        const array = this.gen.newTemp();

        this.gen.emit("new_array", undefined, undefined, array);
        this.genArrayLiteralInto(node, array);

        return array;
    }

    private genArrayLiteralInto(node: ArrayLiteralNode, array: Operand): void {
        node.elements.forEach((element, index) => {
            const value = this.genExpression(element);
            const indexOperand: Operand = { kind: "const", name: String(index) };

            this.gen.emit("idx_store", array, indexOperand, value);
        })
    }

    private genIndexAccess(node: IndexAccessNode): Operand {
        const array = this.genExpression(node.array);
        const index = this.genExpression(node.index);
        const result = this.gen.newTemp();

        this.gen.emit("idx_load", array, index, result);

        return result;
    }
}

export interface IntermediateOutput {
    ok: boolean;
    quads: Quad[];
}

export function generateIntermediateCode(program: ProgramNode, analysisOk: boolean): IntermediateOutput {
    if (!analysisOk) {
        return { ok: false, quads: [] }; 
    }

    const generator = new IntermediateGenerator();
    return { ok: true, quads: generator.generate(program) }
}