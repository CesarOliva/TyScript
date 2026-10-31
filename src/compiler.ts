import { Lexer, Token, TokenType } from './lexer';
import { Parser } from './parser';
import { SemanticAnalyzer, SemanticError } from './semanticAnalyzer';
import type { ProgramNode } from './ast';
import type { SymbolEntry } from './symbolTable';

export interface CompileResult {
    tokens: Token[];
    lexicalErrors: Token[];
    ast: ProgramNode | null;
    syntaxError: string | null;
    semanticErrors: SemanticError[];
    symbols: SymbolEntry[];
    ok: boolean;
}

export function compileSource(source: string): CompileResult {
    const empty: CompileResult = {
        tokens: [],
        lexicalErrors: [],
        ast: null,
        syntaxError: null,
        semanticErrors: [],
        symbols: [],
        ok: false,
    };

    if (!source.trim()) return empty;

    // 1. Analizador Léxico
    const lexer = new Lexer(source);
    const tokens = lexer.scanTokens();
    const lexicalErrors = tokens.filter((t) => t.type === TokenType.ERROR);

    if (lexicalErrors.length > 0) {
        return { ...empty, tokens, lexicalErrors };
    }

    // 2. Analizador Sintáctico
    let ast: ProgramNode | null = null;
    try {
        const parser = new Parser(tokens);
        ast = parser.parse();
    } catch (e) {
        return {
            ...empty,
            tokens,
            lexicalErrors,
            syntaxError: e instanceof Error ? e.message : String(e),
        };
    }

    // 3. Analizador Semántico
    const analyzer = new SemanticAnalyzer();
    const ok = analyzer.analyze(ast);
    const symbols = analyzer.getSymbolTable().getAllSymbols();

    return {
        tokens,
        lexicalErrors,
        ast,
        syntaxError: null,
        semanticErrors: analyzer.errors,
        symbols,
        ok,
    };
}
