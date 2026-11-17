import type { ProgramNode } from "../Analyzer/ast";
import { Lexer, TokenType, type Token } from "../Analyzer/lexer";
import { Parser } from "../Analyzer/parser";
import { SemanticAnalyzer } from "../Analyzer/semanticAnalyzer";

export type CompilePhase = "lexico" | "sintactico" | "semantico";

export interface CompileDiagnostic {
    phase: CompilePhase;
    message: string;
    line?: number;
    column?: number;
}

export interface CompileResult {
    ok: boolean;
    tokens: Token[];
    ast?: ProgramNode;
    errors: CompileDiagnostic[];
}

function parseLocation(message: string): { line?: number; column?: number; clean: string } {
    const match = message.match(/\[Línea\s+(\d+),\s*Col\s+(\d+)\]\s*/);

    if (!match) return { clean: message };

    return {
        line: Number(match[1]),
        column: Number(match[2]),
        clean: message.replace(match[0], ""),
    };
}

export function compileSource(source: string): CompileResult {
    const cleanSource = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
    const tokens = new Lexer(cleanSource).scanTokens();
    const lexerErrors = tokens.filter((token) => token.type === TokenType.ERROR);

    if (lexerErrors.length > 0) {
        return {
            ok: false,
            tokens,
            errors: lexerErrors.map((token) => ({
                phase: "lexico",
                message: String(token.literal ?? `Token inválido '${token.lexeme}'`),
                line: token.line,
                column: token.column,
            })),
        };
    }

    let ast: ProgramNode;

    try {
        ast = new Parser(tokens).parse();
    } catch (error) {
        const rawMessage = error instanceof Error ? error.message : String(error);
        const location = parseLocation(rawMessage);

        return {
            ok: false,
            tokens,
            errors: [{
                phase: "sintactico",
                message: location.clean,
                line: location.line,
                column: location.column,
            }],
        };
    }

    const analyzer = new SemanticAnalyzer();
    let semanticOk = false;

    try {
        semanticOk = analyzer.analyze(ast);
    } catch (error) {
        return {
            ok: false,
            tokens,
            ast,
            errors: [{
                phase: "semantico",
                message: error instanceof Error ? error.message : String(error),
            }],
        };
    }

    if (!semanticOk) {
        return {
            ok: false,
            tokens,
            ast,
            errors: analyzer.errors.map((semanticError) => ({
                phase: "semantico",
                message: semanticError.message,
                line: semanticError.line,
                column: semanticError.column,
            })),
        };
    }

    return { ok: true, tokens, ast, errors: [] };
}
