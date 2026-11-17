export enum TokenType{
    // Palabras reservadas
    program = "program",

    int = "int",
    float = "float",
    boolean = "bool",
    string = "string",
    stack = "stack",
    queue = "queue",

    if = "if",
    else = "else",
    for = "for",
    do = "do",
    while = "while",

    const = "const",
    print = "print",
    read = "read",

    // Identificadores y literales
    identifier = "identifier",
    integerLiteral = "integerLiteral",
    floatLiteral = "floatLiteral",
    booleanLiteral = "booleanLiteral",
    stringLiteral = "stringLiteral",

    // Operadores
    assign = "assign",
    plus = "plus",
    minus = "minus",
    multiply = "multiply",
    module = "module",
    divide = "divide",
    equal_equal = "equal_equal",
    not_equal = "not_equal",
    less_than = "less_than",
    less_than_equal = "less_than_equal",
    greater_than = "greater_than",
    greater_than_equal = "greater_than_equal",
    and = "and",
    or = "or",
    not = "not",

    // Delimitadores
    semicolon = "semicolon",
    comma = "comma",
    dot = "dot",
    leftParen = "leftParen",
    rightParen = "rightParen",
    leftBrace = "leftBrace",
    rightBrace = "rightBrace",
    leftBracket = "leftBracket",
    rightBracket = "rightBracket",

    // Especiales
    EOF = "EOF",
    ERROR = "ERROR"
}

export interface Token {
    type: TokenType;
    lexeme: string;
    literal?: any;
    line: number;
    column: number;
}

export class Lexer {
    private source: string;
    private tokens: Token[] = [];
    private start = 0;
    private current = 0;
    private line = 1;
    private column = 1;
    private startColumn = 1;

    private static keywords: Map<string, TokenType> = new Map([
        ["program", TokenType.program],
        
        ["int", TokenType.int],
        ["float", TokenType.float],
        ["bool", TokenType.boolean],
        ["string", TokenType.string],
        ["stack", TokenType.stack],
        ["queue", TokenType.queue],

        ["if", TokenType.if],
        ["else", TokenType.else],
        ["for", TokenType.for],
        ["do", TokenType.do],
        ["while", TokenType.while],

        ["const", TokenType.const],
        ["print", TokenType.print],
        ["read", TokenType.read],

        ["true", TokenType.booleanLiteral],
        ["false", TokenType.booleanLiteral]
    ]);

    constructor(source: string) {
        this.source = source;
    }

    public scanTokens(): Token[] {
        while(!this.isAtEnd()){
            this.start = this.current;
            this.startColumn = this.column;
            this.scanToken();
        }

        this.tokens.push({
            type: TokenType.EOF,
            lexeme: "",
            line: this.line,
            column: this.column
        })

        return this.tokens;
    }

    private scanToken(): void {
        const char = this.advance();

        switch(char) {
            // Espacios y saltos de linea
            case ' ':
            case '\r':
            case '\t':
                break;
            case '\n':
                this.line++;
                this.column = 1;
                break;

            // Delimitadores
            case "(": this.addToken(TokenType.leftParen); break
            case ")": this.addToken(TokenType.rightParen); break
            case "{": this.addToken(TokenType.leftBrace); break
            case "}": this.addToken(TokenType.rightBrace); break
            case "[": this.addToken(TokenType.leftBracket); break
            case "]": this.addToken(TokenType.rightBracket); break
            case ";": this.addToken(TokenType.semicolon); break
            case ",": this.addToken(TokenType.comma); break
            case ".": this.addToken(TokenType.dot); break

            // Operadores
            case "+": this.addToken(TokenType.plus); break
            case "-": this.addToken(TokenType.minus); break
            case "*": this.addToken(TokenType.multiply); break
            case "%": this.addToken(TokenType.module); break

            case "=":
                this.addToken(this.match("=") ? TokenType.equal_equal : TokenType.assign);
                break
            case "!":
                this.addToken(this.match("=") ? TokenType.not_equal : TokenType.not);
                break
            case "<":
                this.addToken(this.match("=") ? TokenType.less_than_equal : TokenType.less_than);
                break
            case ">":
                this.addToken(this.match("=") ? TokenType.greater_than_equal : TokenType.greater_than);
                break
            case "&":
                if(this.match("&")){
                    this.addToken(TokenType.and);
                } else {
                    this.addErrorToken("Caractér no reconocido '&'");
                }
                break
            case "|":
                if(this.match("|")){
                    this.addToken(TokenType.or);
                } else {
                    this.addErrorToken("Caractér no reconocido '|'");
                }
                break

            // Comentarios
            case "/":
                if(this.match("/")){
                    while(this.peek() !== '\n' && !this.isAtEnd()){
                        this.advance();
                    }
                } else {
                    this.addToken(TokenType.divide);
                }
                break

            // Cadenas
            case '"':
                this.stringLiteral();
                break;

            default:
                if (this.isDigit(char)) {
                    this.numberLiteral();
                } else if(this.isAlpha(char)){
                    this.identifier();
                } else{
                    this.addErrorToken(`Carácter no reconocido '${char}'`)
                }
                break;
        }
    }
    
    private advance(): string {
        const char = this.source.charAt(this.current++);
        this.column++;
        return char;
    }

    private match(expected: string): boolean {
        if(this.isAtEnd()) return false;
        if(this.source.charAt(this.current) !== expected) return false;

        this.current++;
        this.column++;
        return true
    }

    private peek(): string {
        if(this.isAtEnd()) return '\0';
        return this.source.charAt(this.current);
    }

    private peekNext(): string {
        if(this.current + 1 >= this.source.length) return '\0';
        return this.source.charAt(this.current + 1);
    }

    private isAtEnd(): boolean {
        return this.current >= this.source.length;
    }

    private isDigit(char: string): boolean {
        return char >= '0' && char <= '9';
    }

    private isAlpha(char: string): boolean {
        return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_';
    }

    private isAlphaNumeric(char: string): boolean {
        return this.isAlpha(char) || this.isDigit(char);
    }

    private stringLiteral(): void {
        while(this.peek() !== '"' && !this.isAtEnd()){
            if(this.peek() === '\n'){
                this.line++;
                this.column = 1;
            }

            this.advance();
        }

        if(this.isAtEnd()){
            this.addErrorToken("Cadena (string) sin cerrar");
            return;
        }

        this.advance(); // Cierra la cadena
        const value = this.source.substring(this.start + 1, this.current - 1);
        this.addToken(TokenType.stringLiteral, value);
    }

    private numberLiteral(): void {
        while(this.isDigit(this.peek())){
            this.advance();
        }
        
        if(this.peek() === "." && this.isDigit(this.peekNext())){
            this.advance(); // Consume el punto

            while(this.isDigit(this.peek())){
                this.advance();
            }
            
            const value = parseFloat(this.source.substring(this.start, this.current));
            this.addToken(TokenType.floatLiteral, value);
            return;
        }

        const value = parseInt(this.source.substring(this.start, this.current), 10);
        this.addToken(TokenType.integerLiteral, value);
    }

    private identifier(): void {
        while(this.isAlphaNumeric(this.peek())){
            this.advance();
        }

        const text = this.source.substring(this.start, this.current);

        let type = Lexer.keywords.get(text);
        if(type===undefined){
            type = TokenType.identifier;
        }

        const value = (type === TokenType.booleanLiteral) ? (text === "true") : undefined;
        this.addToken(type, value);
    }

    private addToken(type: TokenType, value?: any): void {
        const text = this.source.substring(this.start, this.current);

        this.tokens.push({
            type,
            lexeme: text,
            literal: value,
            line: this.line,
            column: this.startColumn
        });
    }

    private addErrorToken(message: string): void {
        const text = this.source.substring(this.start, this.current);

        this.tokens.push({
            type: TokenType.ERROR,
            lexeme: text,
            literal: message,
            line: this.line,
            column: this.startColumn
        });
    }
}