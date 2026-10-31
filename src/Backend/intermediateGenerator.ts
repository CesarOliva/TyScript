import type {
    AssignmentNode,
    BinaryExpressionNode,
    ConstantDeclarationNode,
    DoWhileStatementNode,
    ExpressionNode,
    ForStatementNode,
    IfStatementNode,
    IndexAccessNode,
    MethodCallNode,
    PrintStatementNode,
    ProgramNode,
    ReadStatementNode,
    StatementNode,
    UnaryExpressionNode,
    VariableDeclarationNode,
    WhileStatementNode
} from "../Analyzer/ast";
import {
    isQueueValidMethod,
    isStackValidMethod,
    Operand,
    Quad,
    QuadGenerator,
    QuadOp
} from "./ir";

export interface IntermediateGeneratorResult {
    quads: Quad[];
    tempCount: number;
    labelCount: number;
    errors: string[];
}

const VOID_METHODS = new Set(["push", "enqueue", "clear"]);

export class IntermediateGenerator {
    private gen = new QuadGenerator();
    private errors: string[] = [];

    public generate(program: ProgramNode): IntermediateGeneratorResult {
        for (const statement of program.body) {
            this.genStatement(statement);
        }
        const snapshot = this.gen.getSnapshot();
        const quads = this.gen.take();
        return {
            quads,
            tempCount: snapshot.tempCount,
            labelCount: snapshot.labelCount,
            errors: this.errors
        };
    }

    private genStatement(statement: StatementNode): void {
        switch (statement.type) {
            case "VariableDeclaration":
                return this.genVariableDeclaration(statement);
            case "ConstantDeclaration":
                return this.genConstantDeclaration(statement);
            case "Assignment":
                return this.genAssignment(statement);
            case "PrintStatement":
                return this.genPrint(statement);
            case "ReadStatement":
                return this.genRead(statement);
            case "IfStatement":
                return this.genIf(statement);
            case "WhileStatement":
                return this.genWhile(statement);
            case "DoWhileStatement":
                return this.genDoWhile(statement);
            case "ForStatement":
                return this.genFor(statement);
            case "ExpressionStatement":
                this.genExpression(statement.expression);
                return;
            default:
                this.errors.push(`Sentencia no soportada en IR: ${statement["type"] as string}`);
        }
    }

    private genVariableDeclaration(node: VariableDeclarationNode): void {
        const target: Operand = { kind: "name", value: node.name };

        if (isCollectionType(node.varType)) {
            if (node.varType.startsWith("stack")) {
                this.gen.emit("new_stack", undefined, undefined, target);
            } else {
                this.gen.emit("new_queue", undefined, undefined, target);
            }
            return;
        }

        if (!node.initializer) {
            return;
        }

        if (node.initializer.type === "ArrayLiteral") {
            this.gen.emit("alloc", { kind: "const", value: node.initializer.elements.length }, undefined, target);
            node.initializer.elements.forEach((element: ExpressionNode, index: number) => {
                this.gen.emit("idx_set", target, { kind: "const", value: index }, this.genExpression(element) ?? undefined);
            });
            return;
        }

        this.gen.emit(":=", this.genExpression(node.initializer) ?? undefined, undefined, target);
    }

    private genConstantDeclaration(node: ConstantDeclarationNode): void {
        this.gen.emit(":=", this.genExpression(node.value) ?? undefined, undefined, { kind: "name", value: node.name });
    }

    private genAssignment(node: AssignmentNode): void {
        const value = this.genExpression(node.value);

        if (node.index) {
            const index = this.genExpression(node.index);
            this.gen.emit("idx_set", { kind: "name", value: node.target }, index ?? undefined, value ?? undefined);
            return;
        }

        this.gen.emit(":=", value ?? undefined, undefined, { kind: "name", value: node.target });
    }

    private genPrint(node: PrintStatementNode): void {
        this.gen.emit("print", this.genExpression(node.expression) ?? undefined);
    }

    private genRead(node: ReadStatementNode): void {
        this.gen.emit("read", undefined, undefined, { kind: "name", value: node.target });
    }

    private genIf(node: IfStatementNode): void {
        const condition = this.genExpression(node.condition) ?? undefined;

        if (node.elseBranch === undefined) {
            const endLabel = this.gen.newLabel();
            this.gen.emit("if_false", condition, endLabel);
            this.genBranch(node.thenBranch);
            this.gen.emit("label", undefined, undefined, endLabel);
            return;
        }

        const elseLabel = this.gen.newLabel();
        const endLabel = this.gen.newLabel();

        this.gen.emit("if_false", condition, elseLabel);
        this.genBranch(node.thenBranch);
        this.gen.emit("goto", endLabel);
        this.gen.emit("label", undefined, undefined, elseLabel);
        this.genElseBranch(node.elseBranch);
        this.gen.emit("label", undefined, undefined, endLabel);
    }

    private genElseBranch(branch: StatementNode[] | IfStatementNode): void {
        if (Array.isArray(branch)) {
            branch.forEach((stmt: StatementNode) => this.genStatement(stmt));
        } else {
            this.genStatement(branch);
        }
    }

    private genBranch(statements: StatementNode[]): void {
        statements.forEach((stmt: StatementNode) => this.genStatement(stmt));
    }

    private genWhile(node: WhileStatementNode): void {
        const startLabel = this.gen.newLabel();
        const endLabel = this.gen.newLabel();

        this.gen.emit("label", undefined, undefined, startLabel);
        const condition = this.genExpression(node.condition) ?? undefined;
        this.gen.emit("if_false", condition, endLabel);
        this.genBranch(node.body);
        this.gen.emit("goto", startLabel);
        this.gen.emit("label", undefined, undefined, endLabel);
    }

    private genDoWhile(node: DoWhileStatementNode): void {
        const startLabel = this.gen.newLabel();

        this.gen.emit("label", undefined, undefined, startLabel);
        this.genBranch(node.body);
        const condition = this.genExpression(node.condition) ?? undefined;
        this.gen.emit("if", condition, startLabel);
    }

    private genFor(node: ForStatementNode): void {
        if (node.init) {
            this.genStatement(node.init);
        }

        const startLabel = this.gen.newLabel();
        const endLabel = this.gen.newLabel();

        this.gen.emit("label", undefined, undefined, startLabel);

        if (node.condition) {
            const condition = this.genExpression(node.condition) ?? undefined;
            this.gen.emit("if_false", condition, endLabel);
        }

        this.genBranch(node.body);

        if (node.update) {
            if (isStatementUpdate(node.update)) {
                this.genStatement(node.update);
            } else {
                this.genExpression(node.update);
            }
        }

        this.gen.emit("goto", startLabel);
        this.gen.emit("label", undefined, undefined, endLabel);
    }

    private genExpression(expression: ExpressionNode): Operand | null {
        switch (expression.type) {
            case "Literal":
                return { kind: "const", value: expression.value };
            case "Identifier":
                return { kind: "name", value: expression.name };
            case "BinaryExpression":
                return this.genBinaryExpression(expression);
            case "UnaryExpression":
                return this.genUnaryExpression(expression);
            case "MethodCall":
                return this.genMethodCall(expression);
            case "IndexAccess":
                return this.genIndexAccess(expression);
            case "ArrayLiteral":
                return null;
            default:
                this.errors.push(`Expresión no soportada en IR: ${expression["type"] as string}`);
                return null;
        }
    }

    private genBinaryExpression(node: BinaryExpressionNode): Operand | null {
        const left = this.genExpression(node.left);
        const right = this.genExpression(node.right);
        if (left === null || right === null) {
            this.errors.push(`Expresión binaria '${node.operator}' con operandos no generables`);
            return null;
        }
        const temp = this.gen.newTemp();
        this.gen.emit(toQuadBinaryOp(node.operator), left, right, temp);
        return temp;
    }

    private genUnaryExpression(node: UnaryExpressionNode): Operand | null {
        const argument = this.genExpression(node.argument);
        if (argument === null) {
            this.errors.push(`Expresión unaria '${node.operator}' con argumento no generable`);
            return null;
        }
        const isMinus = node.operator === "-";
        const temp = this.gen.newTemp();
        this.gen.emit(isMinus ? "uminus" : "not", argument, undefined, temp);
        return temp;
    }

    private genMethodCall(node: MethodCallNode): Operand | null {
        if (!isStackValidMethod(node.method) && !isQueueValidMethod(node.method)) {
            this.errors.push(`Método '${node.method}' no soportado para '${node.object}'`);
            return null;
        }

        const object: Operand = { kind: "name", value: node.object };

        if (VOID_METHODS.has(node.method)) {
            const arg = node.args.length > 0 ? this.genExpression(node.args[0]) : null;
            this.gen.emit(toQuadStructOp(node.method), object, arg ?? undefined);
            return null;
        }

        const arg = node.args.length > 0 ? this.genExpression(node.args[0]) : null;
        const temp = this.gen.newTemp();
        this.gen.emit(toQuadStructOp(node.method), object, arg ?? undefined, temp);
        return temp;
    }

    private genIndexAccess(node: IndexAccessNode): Operand | null {
        const base = this.genExpression(node.array);
        const index = this.genExpression(node.index);
        if (base === null || index === null) {
            this.errors.push("Acceso a índice con base o índice no generables");
            return null;
        }
        const temp = this.gen.newTemp();
        this.gen.emit("idx_get", base, index, temp);
        return temp;
    }
}

export function generateIntermediateCode(program: ProgramNode): IntermediateGeneratorResult {
    return new IntermediateGenerator().generate(program);
}

function isCollectionType(varType: string): boolean {
    return varType.startsWith("stack") || varType.startsWith("queue");
}

function isStatementUpdate(update: ExpressionNode | StatementNode): update is StatementNode {
    return update.type === "Assignment" || update.type === "ExpressionStatement";
}

function toQuadBinaryOp(operator: string): QuadOp {
    return operator as QuadOp;
}

function toQuadStructOp(method: string): QuadOp {
    return method as QuadOp;
}
