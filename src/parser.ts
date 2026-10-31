import { Token, TokenType } from "./lexer";
import * as AST from "./ast"

export class Parser {
    private tokens: Token[];
    private current: number = 0;

    constructor(tokens: Token[]){
        this.tokens = tokens;
    }

    public parse(): AST.ProgramNode {
        return this.program();
    }

    // program ::= "program" IDENTIFIER "{" statementList "}" EOF
    private program(): AST.ProgramNode {
        this.consume(TokenType.program, "Se esperaba la palabra reservada 'program'");
        const nameToken = this.consume(TokenType.identifier, "Se esperaba el nombre del programa");
        this.consume(TokenType.leftBrace, "Se esperaba '{' tras el nombre del programa");

        const body: AST.StatementNode[] = [];
        while (!this.check(TokenType.rightBrace) && !this.isAtEnd()) {
            body.push(this.statement());
        }

        this.consume(TokenType.rightBrace, "Se esperaba '}' al final del programa");
        this.consume(TokenType.EOF, "Se esperaba el final del archivo");

        return { 
            type: "Program",
            name: nameToken.lexeme,
            body
        }
    }

    // statement ::= variableDeclaration | ifStatement | printStatement
    private statement(): AST.StatementNode {
        if (this.match(
            TokenType.int, 
            TokenType.float, 
            TokenType.boolean, 
            TokenType.string,
            TokenType.stack,
            TokenType.queue
        )){
            return this.variableDeclaration();
        }

        if(this.match(TokenType.const)) {
            return this.constantDeclaration();
        }

        if (this.match(TokenType.if)) {
            return this.ifStatement();
        }

        if (this.match(TokenType.for)) {
            return this.forStatement();
        }

        if (this.match(TokenType.while)) {
            return this.whileStatement();
        }

        if (this.match(TokenType.do)) {
            return this.doWhileStatement();
        }

        if (this.match(TokenType.print)) {
            return this.printStatement();
        }

        if (this.match(TokenType.read)) {
            return this.readStatement();
        }

        if (this.check(TokenType.identifier) && this.peekNextType() === TokenType.assign) {
            return this.assignmentStatement();
        }

        if (
            this.check(TokenType.identifier) &&
            (this.peekNextType() === TokenType.assign || this.peekNextType() === TokenType.leftBracket)
        ) {
            return this.assignmentStatement();
        }
        return this.expressionStatement();
    }

    // variableDeclaration ::= dataType IDENTIFIER ";"
    // variableDeclaration ::= dataType IDENTIFIER "=" expression ";"
    private variableDeclaration(): AST.VariableDeclarationNode {
        const typeToken = this.previous();
        let fullType = typeToken.lexeme;

        // Arrays
        if (this.match(TokenType.leftBracket)) {
            this.consume(TokenType.rightBracket, "Se esperaba ']' en la declaración del tipo array");
            fullType = `${typeToken.lexeme}[]`;
        }

        // Queues, Stacks
        if (typeToken.type === TokenType.stack || typeToken.type === TokenType.queue) {
            this.consume(TokenType.less_than, "Se esperaba '<' tras la declaración del tipo de estructura.");
            const innerType = this.consumeAny(
                [TokenType.int, TokenType.float, TokenType.string, TokenType.boolean],
                "Se esperaba un tipo primitivo dentro de '< >'"
            )
            this.consume(TokenType.greater_than, "Se esperaba '>' al cerrar el tipo parametrizado.");

            fullType = `${typeToken.lexeme}<${innerType.lexeme}>`;
        }

        const nameToken = this.consume(TokenType.identifier, "Se esperaba el nombre de la variable");
        let initializer: AST.ExpressionNode | undefined;

        if(this.match(TokenType.assign)) {
            initializer = this.expression();
        }

        this.consume(TokenType.semicolon, "Se esperaba ';' tras la declaración")

        return { 
            type: "VariableDeclaration", 
            varType: fullType, 
            name: nameToken.lexeme, 
            initializer
        }
    }

    // constantDeclaration ::= dataType IDENTIFIER "=" expression ";"
    private constantDeclaration(): AST.ConstantDeclarationNode {
        const typeToken = this.consumeAny(
            [TokenType.int, TokenType.float, TokenType.boolean, TokenType.string],
            "Se esperaba el tipo de dato tras 'const'"
        );
        const nameToken = this.consume(TokenType.identifier, "Se esperaba el nombre de la constante");
        this.consume(TokenType.assign, "Se esperaba '=' en la declaración de la constante")
        const value = this.expression();
        this.consume(TokenType.semicolon, "Se esperaba '=' al final de la constante");

        return {
            type: "ConstantDeclaration",
            varType: typeToken.lexeme,
            name: nameToken.lexeme,
            value
        }
    }

    // ifStatement ::= "if" "(" expression ")" "{" statementList "}"
    private ifStatement(): AST.IfStatementNode {
        this.consume(TokenType.leftParen, "Se esperaba '(' despues de 'if'")
        const condition = this.expression();
        this.consume(TokenType.rightParen, "Se esperaba ')' despues de la condición");

        const thenBranch = this.block();
        let elseBranch: AST.StatementNode[] | AST.IfStatementNode | undefined;

        if(this.match(TokenType.else)) {
            if(this.match(TokenType.if)) {
                elseBranch = this.ifStatement();
            } else {
                elseBranch = this.block();
            }
        }

        return {
            type: "IfStatement",
            condition,
            thenBranch,
            elseBranch
        };
    }

    // forStatment ::= "for" "(" init;condition;update ")" "{" statementList "}"
    private forStatement(): AST.ForStatementNode {
        this.consume(TokenType.leftParen, "Se esperaba '(' despues de 'for'")

        let init: AST.StatementNode | undefined;
        if (!this.match(TokenType.semicolon)) {
            if (this.match(TokenType.int, TokenType.float, TokenType.boolean, TokenType.string)) {
                init = this.variableDeclaration();
            } else {
                init = this.assignmentStatement();
            }
        }

        let condition: AST.ExpressionNode | undefined;
        if (!this.check(TokenType.semicolon)) {
            condition = this.expression();
        }
        this.consume(TokenType.semicolon, "Se esperaba ';' tras la condición del 'for'");

        let update: AST.ExpressionNode | AST.StatementNode | undefined;
        if(!this.check(TokenType.rightParen)) {
            if(this.check(TokenType.identifier) && this.peekNextType() === TokenType.assign) {
                const target = this.advance().lexeme;
                this.advance();
                update = { 
                    type: "Assignment", 
                    target, 
                    value: this.expression()
                }
            } else {
                update = this.expression();
            }
        }

        this.consume(TokenType.rightParen, "Se esperaba ')' tras los parámetros del 'for'")

        const body = this.block();
        return {
            type: "ForStatement",
            init,
            condition,
            update,
            body
        }
    }

    // whileStatement ::= "while", "(", condition, ")"
    private whileStatement(): AST.WhileStatementNode {
        this.consume(TokenType.leftParen, "Se esperaba '(' despues de 'while'");
        const condition = this.expression();
        this.consume(TokenType.rightParen, "Se esperaba ')' despues de la condición");

        const body = this.block();

        return {
            type: "WhileStatement",
            condition,
            body
        }
    }

    // doWhileStatement ::= "do" "{" statementList "}" "while" "(" expression ")" ";"
    private doWhileStatement(): AST.DoWhileStatementNode {
        const body = this.block();
        this.consume(TokenType.while, "Se esperaba 'while' tras el bloque 'do'");
        this.consume(TokenType.leftParen, "Se esperaba '(' despues de 'while'");
        const condition = this.expression();
        this.consume(TokenType.rightParen, "Se esperaba ')' despues de la condición");
        this.consume(TokenType.semicolon, "Se esperaba ';' al final del 'do-while'");

        return {
            type: "DoWhileStatement",
            body,
            condition
        }
    }

    // printStatement ::= "print" "(" expression ")" ";"
    private printStatement(): AST.PrintStatementNode {
        this.consume(TokenType.leftParen, "Se esperaba '(' despues de 'print'");
        const expr = this.expression();
        this.consume(TokenType.rightParen, "Se esperaba ')' despues de la expresión");
        this.consume(TokenType.semicolon, "Se esperaba ';' al final del print");

        return {
            type: "PrintStatement",
            expression: expr
        }
    }

    // readStatement ::= "read" "(" target ")" ";"
    private readStatement(): AST.ReadStatementNode {
        this.consume(TokenType.leftParen, "Se esperaba '(' tras 'read'.");
        const target = this.consume(TokenType.identifier, "Se esperaba una variable en 'read'.").lexeme;
        this.consume(TokenType.rightParen, "Se esperaba ')' tras 'read(...)'.");
        this.consume(TokenType.semicolon, "Se esperaba ';' tras 'read(...)'.");

        return {
            type: "ReadStatement",
            target
        }
    }

    private assignmentStatement(): AST.AssignmentNode {
        const target = this.consume(TokenType.identifier, "Se esperaba el identificador").lexeme;
        let index: AST.ExpressionNode | undefined;

        if (this.match(TokenType.leftBracket)) {
            index = this.expression();
            this.consume(TokenType.rightBracket, "Se esperaba ']' tras el indice del arreglo.");
        }

        this.consume(TokenType.assign, "Se esperaba '=' en la asignación");
        const value = this.expression();
        this.consume(TokenType.semicolon, "Se esperaba ';' al final de la asignación");

        return {
            type: "Assignment",
            target,
            index,
            value
        }
    }

    private block(): AST.StatementNode[] {
        this.consume(TokenType.leftBrace, "Se esperaba '{' al inicio del bloque");
        const statements: AST.StatementNode[] = [];

        while (!this.check(TokenType.rightBrace) && !this.isAtEnd()) {
            statements.push(this.statement());
        }

        this.consume(TokenType.rightBrace, "Se esperaba '}' al cerrar el bloque");
        return statements;
    }

    private expressionStatement(): AST.ExpressionStatementNode {
        const expr = this.expression();
        this.consume(TokenType.semicolon, "Se esperaba ';' al final de la expresión")

        return {
            type: "ExpressionStatement",
            expression: expr
        }
    }

    //
    private expression(): AST.ExpressionNode {
        return this.logicalOr();
    }

    private logicalOr(): AST.ExpressionNode {
        let expr = this.logicalAnd();
        while (this.match(TokenType.or)) {
            const operator = this.previous().lexeme;
            const right = this.logicalAnd();
            expr = {
                type: "BinaryExpression",
                left: expr,
                operator,
                right
            }
        }
        
        return expr;
    }

    private logicalAnd(): AST.ExpressionNode {
        let expr = this.equality();
        while (this.match(TokenType.and)) {
            const operator = this.previous().lexeme;
            const right = this.equality();
            expr = {
                type: "BinaryExpression",
                left: expr,
                operator,
                right
            }
        }
        
        return expr;
    }

    private equality(): AST.ExpressionNode {
        let expr = this.relational();
        while (this.match(TokenType.equal_equal, TokenType.not_equal)) {
            const operator = this.previous().lexeme;
            const right = this.relational();
            expr = {
                type: "BinaryExpression",
                left: expr,
                operator,
                right
            }
        }

        return expr;
    }

    private relational(): AST.ExpressionNode {
        let expr = this.additive();
        while (this.match(TokenType.less_than, TokenType.less_than_equal, TokenType.greater_than, TokenType.greater_than_equal)) {
            const operator = this.previous().lexeme;
            const right = this.additive();
            expr = {
                type: "BinaryExpression",
                left: expr,
                operator,
                right
            }
        }

        return expr;
    }

    private additive(): AST.ExpressionNode {
        let expr = this.multiplicative();
        while (this.match(TokenType.plus, TokenType.minus)) {
            const operator = this.previous().lexeme;
            const right = this.multiplicative();
            expr = {
                type: "BinaryExpression",
                left: expr,
                operator,
                right
            }
        }

        return expr;
    }

    private multiplicative(): AST.ExpressionNode {
        let expr = this.unary();
        while (this.match(TokenType.multiply, TokenType.divide, TokenType.module)) {
            const operator = this.previous().lexeme;
            const right = this.unary();
            expr = {
                type: "BinaryExpression",
                left: expr,
                operator,
                right
            }
        }

        return expr;
    }

    private unary(): AST.ExpressionNode {
        if (this.match(TokenType.not, TokenType.minus)) {
            const operator = this.previous().lexeme;
            const argument = this.unary();
            return { 
                type: "UnaryExpression", 
                operator, argument 
            };
        }

        return this.primary();
    }

    private primary(): AST.ExpressionNode {
        // Literales de array
        if (this.match(TokenType.leftBracket)) {
            const elements: AST.ExpressionNode[] = [];
            if (!this.check(TokenType.rightBracket)) {
                do {
                    elements.push(this.expression());
                } while (this.match(TokenType.comma))
            }

            this.consume(TokenType.rightBracket, "Se esperaba ']' al cerrar el literal de array")
            return {
                type: "ArrayLiteral",
                elements
            }
        }

        // Literales Primitivos
        if (this.match(TokenType.integerLiteral, TokenType.floatLiteral, TokenType.stringLiteral, TokenType.booleanLiteral)) {
            const token = this.previous();
            return {
                type: "Literal",
                value: token.literal, 
                raw: token.lexeme
            }
        }

        // Identificadores, Metodos y acceso por indice
        if (this.match(TokenType.identifier)) {
            const name = this.previous().lexeme;
            let expr: AST.ExpressionNode = {
                type: "Identifier",
                name
            }

            // Acceso por indice
            if (this.match(TokenType.leftBracket)) {
                const index = this.expression();
                this.consume(TokenType.rightBracket, "Se esperaba ']' tras el indice");
                expr = {
                    type: "IndexAccess",
                    array: expr,
                    index
                }
            }

            // Llamadas a metodos
            if (this.match(TokenType.dot)) {
                const methodToken = this.consume(TokenType.identifier, "Se esperaba el nombre del método tras '.'");
                this.consume(TokenType.leftParen, "Se esperaba '(' tras el nombre del método")

                const args: AST.ExpressionNode[] = [];
                if(!this.check(TokenType.rightParen)) {
                    do {
                        args.push(this.expression());
                    } while (this.match(TokenType.comma));
                }

                this.consume(TokenType.rightParen, "Se esperaba ')' tras los argumentos del método")

                return {
                    type: "MethodCall",
                    object: name,
                    method: methodToken.lexeme,
                    args
                }
            }

            return expr;
        }

        if(this.match(TokenType.leftParen)) {
            const expr = this.expression();
            this.consume(TokenType.rightParen, "Se esperaba ')' tras la expresión")
            return expr;
        }

        throw new Error(`[Línea ${this.peek().line}, Col ${this.peek().column}] Error Sintáctico: Expresión no válida cerca de '${this.peek().lexeme}'`);
    }

    // Métodos auxiliares
    private match(...types: TokenType[]): boolean {
        for (const type of types) {
            if (this.check(type)) {
                this.advance();
                return true;
            }
        }

        return false;
    }

    private consume(type: TokenType, message: string): Token {
        if (this.check(type)) return this.advance();
        throw new Error(`[Línea ${this.peek().line}, Col ${this.peek().column}] Error Sintáctico: ${message} (Se encontró '${this.peek().lexeme}')`);
    }

    private consumeAny(types: TokenType[], message: string): Token {
        for (const type of types) {
            if(this.check(type)) {
                return this.advance();
            }
        }

        throw new Error(`[Línea ${this.peek().line}, Col ${this.peek().column}] Error Sintáctico: ${message}`);
    }

    private check(type: TokenType): boolean {
        if (this.isAtEnd()) {
            return type === TokenType.EOF;
        }

        return this.peek().type === type;
    }

    private advance(): Token {
        if(!this.isAtEnd()) this.current++;
        return this.previous();
    }

    private isAtEnd(): boolean {
        return this.peek().type === TokenType.EOF;
    }

    private peek(): Token {
        return this.tokens[this.current];
    }

    private peekNextType(): TokenType | null {
        if (this.current + 1 >= this.tokens.length) return null;

        return this.tokens[this.current + 1].type;
    }

    private previous(): Token {
        return this.tokens[this.current - 1];
    }
}