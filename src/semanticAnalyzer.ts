import * as AST from "./ast";
import { SymbolTable } from "./symbolTable";

export interface SemanticError {
    message: string;
    line?: number;
    column?: number;
}

export interface StatementTrace {
    stmt: AST.StatementNode;
    path: string;
    depth: number;
    scopeLevel: number;
    detail: string;
    symbols: import("./symbolTable").SymbolEntry[];
    errors: SemanticError[];
}

function cloneValue<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

const stackMethods = ['push', 'pop', 'peek', 'isEmpty', 'size', 'clear'];
const queueMethods = ['enqueue', 'dequeue', 'front', 'isEmpty', 'size', 'clear'];

export class SemanticAnalyzer {
    private symbolTable = new SymbolTable();
    public errors: SemanticError[] = [];
    private trace: StatementTrace[] | null = null;
    private traceSuspended = 0;
    private tracePath = '';
    private traceDepth = 0;

    analyze(ast: AST.ProgramNode | AST.StatementNode[]): boolean {
        this.errors = [];
        this.symbolTable = new SymbolTable();
        this.trace = null;

        if ('body' in ast && Array.isArray(ast.body)) {
            this.visitProgram(ast as AST.ProgramNode);
        } else if (Array.isArray(ast)){
            for (const stmt of ast) {
                this.visitStatement(stmt);
            }
        }

        return this.errors.length === 0;
    }


    // Métodos especificos para el modo paso a paso en el web playground

    analyzeWithTrace(program: AST.ProgramNode): StatementTrace[] {
        this.errors = [];
        this.symbolTable = new SymbolTable();
        this.trace = [];
        this.traceSuspended = 0;

        program.body.forEach((stmt, i) => {
            this.visitStatement(stmt, `${i}`, 0);
        });

        const out = this.trace;
        this.trace = null;
        return out;
    }

    private snapshotSymbols(): import("./symbolTable").SymbolEntry[] {
        return cloneValue(this.symbolTable.getAllSymbols());
    }

    private pushTrace(stmt: AST.StatementNode, path: string, depth: number, detail: string): void {
        if (!this.trace || this.traceSuspended > 0) return;
        this.trace.push({
            stmt: cloneValue(stmt),
            path,
            depth,
            scopeLevel: this.symbolTable.getCurrentScopeLevel(),
            detail,
            symbols: this.snapshotSymbols(),
            errors: this.errors.map((e) => ({ ...e })),
        });
    }

    private traceDetail(stmt: AST.StatementNode): string {
        const level = this.symbolTable.getCurrentScopeLevel();

        switch (stmt.type) {
            case 'VariableDeclaration':
                return `[Semántico] Registrando '${stmt.varType} ${stmt.name}' en Scope ${level}` +
                    (stmt.initializer ? ' · verificando tipo del inicializador' : ' · sin inicializador');
            case 'ConstantDeclaration':
                return `[Semántico] Registrando 'const ${stmt.varType} ${stmt.name}' en Scope ${level} (inmutable)`;
            case 'Assignment':
                return `[Semántico] Asignando valor a '${stmt.target}' en Scope ${level} · verificando tipos` +
                    (stmt.index ? ' · índice debe ser int' : '');
            case 'PrintStatement':
                return `[Semántico] Evaluando expresión de 'print(...)' en Scope ${level}`;
            case 'ReadStatement':
                return `[Semántico] Verificando 'read(${stmt.target})' en Scope ${level} · debe existir y ser mutable`;
            case 'IfStatement':
                return `[Semántico] Evaluando condición del 'if' en Scope ${level} (debe ser bool) · entra a un nuevo Scope`;
            case 'ForStatement':
                return `[Semántico] Analizando 'for' en Scope ${level} (init, condición bool, update) · nuevo Scope`;
            case 'WhileStatement':
                return `[Semántico] Evaluando condición del 'while' en Scope ${level} (debe ser bool) · entra a un nuevo Scope`;
            case 'DoWhileStatement':
                return `[Semántico] Evaluando cuerpo del 'do-while' en Scope ${level} y condición final (debe ser bool) · entra a un nuevo Scope`;
            case 'ExpressionStatement':
                return `[Semántico] Evaluando sentencia de expresión en Scope ${level} (p. ej. llamada push/pop)`;
            default:
                return `[Semántico] Procesando sentencia ${(stmt as { type: string }).type} en Scope ${level}`;
        }
    }

    // Analizador Sintáctico
    private visitProgram(node: AST.ProgramNode): void {
        node.body.forEach((stmt, i) => {
            this.visitStatement(stmt, `${i}`, 0);
        });
    }

    private visitStatement(stmt: AST.StatementNode, path = '', depth = 0): void {
        this.tracePath = path;
        this.traceDepth = depth;
        switch (stmt.type) {
            case 'VariableDeclaration':
                this.visitVariableDeclaration(stmt);
                break;
            case 'ConstantDeclaration':
                this.visitConstantDeclaration(stmt);
                break;
            case 'IfStatement':
                this.visitIfStatement(stmt, path, depth);
                break;
            case 'ForStatement':
                this.visitForStatement(stmt, path, depth);
                break;
            case 'WhileStatement':
                this.visitWhileStatement(stmt, path, depth);
                break;
            case 'DoWhileStatement':
                this.visitDoWhileStatement(stmt, path, depth);
                break;
            case 'PrintStatement':
                this.visitPrintStatement(stmt);
                break;
            case 'ReadStatement':
                this.visitReadStatement(stmt);
                break;
            case 'Assignment':
                this.visitAssignment(stmt);
                break;
            case 'ExpressionStatement':
                this.visitExpressionStatement(stmt);
                break;
        }
    }

    private visitVariableDeclaration(node: AST.VariableDeclarationNode): void {
        let initType: string | undefined;

        if (node.initializer) {
            initType = this.getExpressionType(node.initializer);
            if (initType && initType !== node.varType) {
                this.errors.push({
                    message: `Incompatibilidad de tipos: Se esperaba '${node.varType}, se obtuvo '${initType}'`
                })
            }
        }

        const inserted = this.symbolTable.insert({
            name: node.name,
            type: node.varType,
            kind: 'variable',
            scope: this.symbolTable.getCurrentScopeLevel(),
            mutable: true
        })

        if (!inserted) {
            this.errors.push({
                message: `La variable ${node.name}' ya ha sido declarada en el ámbito actual`
            })
        }

        this.pushTrace(node, this.tracePath, this.traceDepth, this.traceDetail(node));
    }

    private visitConstantDeclaration(node: AST.ConstantDeclarationNode): void {
        const valueType = this.getExpressionType(node.value);
        if (valueType && valueType!== node.varType) {
            this.errors.push({
                message: `Incompatibilidad de tipos en constante '${node.name}': Se esperaba '${node.varType}', se obtuvo '${valueType}'`
            })
        }

        const inserted = this.symbolTable.insert({
            name: node.name,
            type: node.varType,
            kind: 'constant',
            scope: this.symbolTable.getCurrentScopeLevel(),
            mutable: false
        })

        if (!inserted) {
            this.errors.push({
                message: `La constante '${node.name}' ya ha sido declarada en este ámbito`
            })
        }

        this.pushTrace(node, this.tracePath, this.traceDepth, this.traceDetail(node));
    }

    private visitIfStatement(node: AST.IfStatementNode, path = '', depth = 0): void {
        const condType = this.getExpressionType(node.condition);
        if (condType && condType !== 'bool') {
            this.errors.push({
                message: `La condición del 'if' debe ser de tipo 'bool', se recibió '${condType}'`
            })
        }

        this.pushTrace(node, path, depth, this.traceDetail(node));

        this.symbolTable.enterScope();
        node.thenBranch.forEach((stmt, i) => {
            this.visitStatement(stmt, `${path}.then.${i}`, depth + 1);
        });
        this.symbolTable.exitScope();

        if (node.elseBranch) {
            if (Array.isArray(node.elseBranch)) {
                this.symbolTable.enterScope();
                node.elseBranch.forEach((stmt, i) => {
                    this.visitStatement(stmt, `${path}.else.${i}`, depth + 1);
                });
                this.symbolTable.exitScope();
            } else {
                this.visitIfStatement(node.elseBranch as AST.IfStatementNode, `${path}.else`, depth + 1);
            }
        }
    }

    private visitForStatement(node: AST.ForStatementNode, path = '', depth = 0): void {
        this.symbolTable.enterScope();

        if (node.init) {
            this.traceSuspended++;
            try {
                this.visitStatement(node.init, `${path}.init`, depth + 1);
            } finally {
                this.traceSuspended--;
            }
        }

        if (node.condition) {
            const condType = this.getExpressionType(node.condition);
            if (condType && condType !== 'bool') {
                this.errors.push({
                    message: `La condición del 'for' debe ser de tipo 'bool', se obtuvo '${condType}'`
                })
            }
        }

        if (node.update) {
            if ('type' in node.update && typeof node.update.type === 'string' && node.update.type.endsWith('Statement')) {
                this.traceSuspended++;
                try {
                    this.visitStatement(node.update as AST.StatementNode, `${path}.update`, depth + 1);
                } finally {
                    this.traceSuspended--;
                }
            } else {
                this.getExpressionType(node.update as AST.ExpressionNode);
            }
        }

        this.pushTrace(node, path, depth, this.traceDetail(node));

        node.body.forEach((stmt, i) => {
            this.visitStatement(stmt, `${path}.body.${i}`, depth + 1);
        });

        this.symbolTable.exitScope();
    }

    private visitWhileStatement(node: AST.WhileStatementNode, path = '', depth = 0): void {
        const condType = this.getExpressionType(node.condition);
        if (condType && condType !== 'bool') {
            this.errors.push({
                message: `La condición del 'while' debe ser de tipo 'bool', se obtuvo '${condType}'`
            })
        }

        this.pushTrace(node, path, depth, this.traceDetail(node));

        this.symbolTable.enterScope();
        node.body.forEach((stmt, i) => {
            this.visitStatement(stmt, `${path}.body.${i}`, depth + 1);
        });

        this.symbolTable.exitScope();
    }

    private visitDoWhileStatement(node: AST.DoWhileStatementNode, path = '', depth = 0): void {
        this.pushTrace(node, path, depth, this.traceDetail(node));

        this.symbolTable.enterScope();
        node.body.forEach((stmt, i) => {
            this.visitStatement(stmt, `${path}.body.${i}`, depth + 1);
        });
        this.symbolTable.exitScope();

        const condType = this.getExpressionType(node.condition);
        if (condType && condType !== 'bool') {
            this.errors.push({
                message: `La condición del 'do-while' debe ser de tipo 'bool', se obtuvo '${condType}'`
            })
        }
    }

    private visitPrintStatement(node: AST.PrintStatementNode): void {
        this.getExpressionType(node.expression);
        this.pushTrace(node, this.tracePath, this.traceDepth, this.traceDetail(node));
    }

    private visitReadStatement(node: AST.ReadStatementNode): void {
        const symbol = this.symbolTable.lookup(node.target);

        if (!symbol) {
            this.errors.push({
                message: `La variable '${node.target}' utilizada en 'read()' no ha sido declarada`
            })
            this.pushTrace(node, this.tracePath, this.traceDepth, this.traceDetail(node));
            return;
        }

        if (!symbol.mutable) {
            this.errors.push({
                message: `No se puede leer un valor mediante 'read()' hacia la constante '${node.target}'`
            })
        }

        this.pushTrace(node, this.tracePath, this.traceDepth, this.traceDetail(node));
    }

    private visitAssignment(node: AST.AssignmentNode): void {
        const symbol = this.symbolTable.lookup(node.target);

        if (!symbol) {
            this.errors.push({
                message: `La variable '${node.target}' no ha sido declarada`
            });
            this.pushTrace(node, this.tracePath, this.traceDepth, this.traceDetail(node));
            return;
        }

        if (!symbol.mutable) {
            this.errors.push({
                message: `No se puede modificar la constante '${node.target}'`
            })
        }

        if (node.index) {
            const indexType = this.getExpressionType(node.index);
            if (indexType && indexType !== 'int') {
                this.errors.push({
                    message: `El índice de un arreglo debe ser de tipo 'int', se recibió '${indexType}'`
                });
            }
        }

        const exprType = this.getExpressionType(node.value);

        const expectedType = node.index && symbol.type.endsWith('[]')
            ? symbol.type.replace('[]', '')
            : symbol.type;

        if (exprType && exprType !== expectedType) {
            this.errors.push({
                message: `No se puede asignar un valor de tipo '${exprType}' a '${node.target}' (${symbol.type})`
            })
        }

        this.pushTrace(node, this.tracePath, this.traceDepth, this.traceDetail(node));
    }

    private visitExpressionStatement(stmt: AST.ExpressionStatementNode): void {
        this.getExpressionType(stmt.expression);
        this.pushTrace(stmt, this.tracePath, this.traceDepth, this.traceDetail(stmt));
    }

    private getExpressionType(expr: AST.ExpressionNode): string | undefined {
        switch (expr.type) {
            case 'Literal':
                if (typeof expr.value === 'number') {
                    return Number.isInteger(expr.value) ? 'int' : 'float';
                }
                if (typeof expr.value === 'boolean') return 'bool';
                if (typeof expr.value === 'string') return 'string';
                return undefined;

            case 'Identifier': {
                const symbol = this.symbolTable.lookup(expr.name);
                if (!symbol) {
                    this.errors.push({
                        message: `La variable '${expr.name}' no ha sido declarada`
                    })
                    return undefined;
                }
                return symbol.type
            }

            case 'BinaryExpression': {
                const leftType = this.getExpressionType(expr.left);
                const rightType = this.getExpressionType(expr.right);

                if (['&&', '||'].includes(expr.operator)) {
                    if (leftType && leftType !== 'bool') {
                        this.errors.push({
                            message: `El operador '${expr.operator}' requiere operandos de tipo 'bool', se recibió '${leftType}' en el lado izquierdo`
                        })
                    }
                    if (rightType && rightType !== 'bool') {
                        this.errors.push({
                            message: `El operador '${expr.operator}' requiere operandos de tipo 'bool', se recibió '${rightType}' en el lado derecho`
                        })
                    }
                    return 'bool';
                }

                if (['==', '!=', '<', '<=','>', '>='].includes(expr.operator)) {
                    if (leftType !== rightType) {
                        this.errors.push({
                            message: `Operación relacional incompatible entre '${leftType}' y '${rightType}'`
                        })
                    }
                    return 'bool';
                }

                if (['+', '-', '*', '/', '%'].includes(expr.operator)) {
                    if (leftType !== rightType) {
                        this.errors.push({
                            message: `Operación aritmética incompatible entre '${leftType}' y '${rightType}'`        
                        })
                    }
                    return leftType;
                }

                return undefined
            }

            case 'UnaryExpression': {
                const argType = this.getExpressionType(expr.argument);

                if (expr.operator === '!') {
                    if (argType && argType !== 'bool') {
                        this.errors.push({
                            message: `El operador '!' requiere un operando de tipo 'bool', se recibió '${argType}'`
                        })
                    }
                    return 'bool';
                }

                if (expr.operator === '-') {
                    if (argType && argType !== 'int' && argType !== 'float') {
                        this.errors.push({
                            message: `El operador '-' requiere un operando numérico ('int' o 'float'), se recibió '${argType}'`
                        })
                    }
                    return argType;
                }

                return undefined;
            }

            case 'MethodCall':
                return this.visitMethodCall(expr);

            case 'IndexAccess': {
                const arrayType = this.getExpressionType(expr.array);
                const indexType = this.getExpressionType(expr.index);

                if (indexType && indexType !== 'int') {
                    this.errors.push({
                        message: `El índice de acceso al arreglo debe ser de tipo 'int', se recibió '${indexType}'`
                    })
                }

                if (arrayType && arrayType.endsWith('[]')) {
                    return arrayType.replace('[]', '');
                }

                this.errors.push({
                    message: `Acceso por índice no válido sobre el tipo '${arrayType}'`
                })
                return undefined;
            }

            case "ArrayLiteral": {
                if (expr.elements.length === 0) return 'int[]';

                const firstType = this.getExpressionType(expr.elements[0]);
                for(let i = 1; i < expr.elements.length; i++) {
                    const elemType = this.getExpressionType(expr.elements[i]);
                    if (elemType !== firstType) {
                        this.errors.push({
                            message: `Los elementos del arreglo deben ser homogéneos. Se encontró '${elemType}' y '${firstType}'`
                        })
                    }
                }
                
                return `${firstType}[]`;
            }

            default:
                return undefined;
        }
    }

    private visitMethodCall(node: AST.MethodCallNode): string | undefined {
        const symbol = this.symbolTable.lookup(node.object);

        if (!symbol) {
            this.errors.push({
                message: `El objeto '${node.object}' no ha sido declarado`
            })
            return undefined;
        }

        if (symbol.type.startsWith('stack<')) {
            if (!stackMethods.includes(node.method)) {
                this.errors.push({
                    message: `El método '${node.method}()' no existe para la estructura 'stack'. Métodos válidos: ${stackMethods.join(', ')}`
                })
                return undefined;
            }
            const innerType = symbol.type.match(/<(.+)>/)?.[1];

            if (node.method == 'push') {
                if (node.args.length !== 1) {
                    this.errors.push({
                        message: `El método 'push()' requiere exactamente 1 argumento.`
                    })
                } else {
                    const argType = this.getExpressionType(node.args[0]);
                    if (argType && argType !== innerType) {
                        this.errors.push({
                            message: `Elemento incorrecto en stack: 'push()' esperaba '${innerType}', recibió '${argType}'`
                        })
                    }
                }
                return 'void';
            }

            if(node.method === 'pop' || node.method === 'peek') return innerType;

            if(node.method === 'isEmpty') return 'bool';

            if(node.method === 'size') return 'int';

            if(node.method === 'clear') return 'void';
        }

        if (symbol.type.startsWith('queue<')) {
            if (!queueMethods.includes(node.method)) {
                this.errors.push({
                    message: `El método '${node.method}()' no existe para la estructura 'queue'. Métodos válidos: ${queueMethods.join(', ')}`
                })
            }

            const innerType = symbol.type.match(/<(.+)>/)?.[1];

            if(node.method === 'enqueue') {
                if(node.args.length !== 1) {
                    this.errors.push({ 
                        message: `El método 'enqueue()' requiere exactamente 1 argumento`
                    });
                } else {
                    const argType = this.getExpressionType(node.args[0]);
                    if(argType && argType !== innerType) {
                        this.errors.push({
                            message: `Elemento incorrecto en queue: 'enqueue()' esperaba '${innerType}', pero recibió '${argType}'`
                        })
                    }
                }
                return 'void';
            }

            if (node.method === 'dequeue' || node.method === 'front') return innerType;

            if (node.method === 'isEmpty') return 'bool';

            if(node.method === 'size') return 'int';

            if(node.method === 'clear') return 'void'
        }

        this.errors.push({
            message: `La variable '${node.object}' (${symbol.type}) no soporta la invocación de métodos`
        })

        return undefined;
    }

    public getSymbolTable(): SymbolTable {
        return this.symbolTable;
    }
}