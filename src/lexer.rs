use std::fmt;

use crate::token::LiteralValue;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum TokenType {
    // Palabras reservadas
    Program,

    Int,
    Float,
    String,
    Boolean,
    Stack,
    Queue,

    If,
    Else,
    For,
    Do,
    While,
    
    Const,
    Print,
    Read,

    // Identificadores y literales
    Identifier,
    IntegerLiteral,
    FloatLiteral,
    StringLiteral,
    BooleanLiteral,

    // Operadores
    Assign,
    Plus,
    Minus,
    Multiply,
    Module,
    Divide,
    EqualEqual,
    NotEqual,
    LessThan,
    LessThanEqual,
    GreaterThan,
    GreaterThanEqual,
    And,
    Or,
    Not,

    // Delimitadores
    Semicolon,
    Comma,
    Dot,
    LeftParen,
    RightParen,
    LeftBrace,
    RightBrace,
    LeftBracket,
    RightBracket,

    // Especiales
    EOF,
    ERROR,
}

impl TokenType {
    pub fn as_str(&self) -> &'static str {
        match self {
            TokenType::Program => "program",

            TokenType::Int => "int",
            TokenType::Float => "float",
            TokenType::String => "string",
            TokenType::Boolean => "bool",
            TokenType::Stack => "stack",
            TokenType::Queue => "queue",

            TokenType::If => "if",
            TokenType::Else => "else",
            TokenType::For => "for",
            TokenType::Do => "do",
            TokenType::While => "while",

            TokenType::Const => "const",
            TokenType::Print => "print",
            TokenType::Read => "read",

            TokenType::Identifier => "identifier",
            TokenType::IntegerLiteral => "integerLiteral",
            TokenType::FloatLiteral => "floatLiteral",
            TokenType::StringLiteral => "stringLiteral",
            TokenType::BooleanLiteral => "booleanLiteral",

            TokenType::Assign => "assign",
            TokenType::Plus => "plus",
            TokenType::Minus => "minus",
            TokenType::Multiply => "multiply",
            TokenType::Module => "module",
            TokenType::Divide => "divide",
            TokenType::EqualEqual => "equalEqual",
            TokenType::NotEqual => "notEqual",
            TokenType::LessThan => "lessThan",
            TokenType::LessThanEqual => "lessThanEqual",
            TokenType::GreaterThan => "greaterThan",
            TokenType::GreaterThanEqual => "greaterThanEqual",
            TokenType::And => "and",
            TokenType::Or => "or",
            TokenType::Not => "not",

            TokenType::Semicolon => "semicolon",
            TokenType::Comma => "comma",
            TokenType::Dot => "dot",
            TokenType::LeftParen => "leftParen",
            TokenType::RightParen => "rightParen",
            TokenType::LeftBrace => "leftBrace",
            TokenType::RightBrace => "rightBrace",
            TokenType::LeftBracket => "leftBracket",
            TokenType::RightBracket => "rightBracket",

            TokenType::EOF => "EOF",
            TokenType::ERROR => "ERROR",
        }
    }
}

impl fmt::Display for TokenType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Token {
    pub token_type: TokenType,
    pub lexeme: String,
    pub literal: Option<LiteralValue>,
    pub line: usize,
    pub column: usize,
}

impl Token {
    pub fn new(
        token_type: TokenType,
        lexeme: impl Into<String>,
        literal: Option<LiteralValue>,
        line: usize,
        column: usize,
    ) -> Self {
        Self {
            token_type,
            lexeme: lexeme.into(),
            literal,
            line,
            column,
        }
    }
}

pub struct Lexer {
    source: Vec<char>,
    tokens: Vec<Token>,
    start: usize,
    current: usize,
    line: usize,
    column: usize,
    start_column: usize,
}

impl Lexer {
    pub fn new(source: &str) -> Self {
        Self {
            source: source.chars().collect(),
            tokens: Vec::new(),
            start: 0,
            current: 0,
            line: 1,
            column: 1,
            start_column: 1,
        }
    }

    fn get_keyword(lexeme: &str) -> Option<TokenType> {
        match lexeme {
            "program" => Some(TokenType::Program),

            "int" => Some(TokenType::Int),
            "float" => Some(TokenType::Float),
            "string" => Some(TokenType::String),
            "bool" => Some(TokenType::Boolean),
            "stack" => Some(TokenType::Stack),
            "queue" => Some(TokenType::Queue),

            "if" => Some(TokenType::If),
            "else" => Some(TokenType::Else),
            "for" => Some(TokenType::For),
            "do" => Some(TokenType::Do),
            "while" => Some(TokenType::While),

            "const" => Some(TokenType::Const),
            "print" => Some(TokenType::Print),
            "read" => Some(TokenType::Read),

            "true" | "false" => Some(TokenType::BooleanLiteral),

            _ => None,
        }
    }

    pub fn scan_tokens(&mut self) -> Vec<Token> {
        self.current = 0;
        self.line = 1;
        self.column = 1;
        self.tokens.clear();

        while !self.is_at_end() {
            self.start = self.current;
            self.start_column = self.column;
            self.scan_token();
        }

        self.tokens.push(Token::new(
            TokenType::EOF,
            "",
            None,
            self.line,
            self.column,
        ));

        std::mem::take(&mut self.tokens)
    }

    fn scan_token(&mut self) {
        let c = self.advance();

        match c {
            // Espacios y saltos de línea
            ' ' | '\r' | '\t' => {}

            '\n' => {
                self.line += 1;
                self.column = 1;
            }

            // Delimitadores
            '(' => self.add_token(TokenType::LeftParen, None),
            ')' => self.add_token(TokenType::RightParen, None),
            '{' => self.add_token(TokenType::LeftBrace, None),
            '}' => self.add_token(TokenType::RightBrace, None),
            '[' => self.add_token(TokenType::LeftBracket, None),
            ']' => self.add_token(TokenType::RightBracket, None),
            ';' => self.add_token(TokenType::Semicolon, None),
            ',' => self.add_token(TokenType::Comma, None),
            '.' => self.add_token(TokenType::Dot, None),

            // Operadores
            '+' => self.add_token(TokenType::Plus, None),
            '-' => self.add_token(TokenType::Minus, None),
            '*' => self.add_token(TokenType::Multiply, None),
            '%' => self.add_token(TokenType::Module, None),

            '=' => {
                let token_type = if self.match_char('=') {
                    TokenType::EqualEqual
                } else {
                    TokenType::Assign
                };

                self.add_token(token_type, None);
            }
            '!' => {
                let token_type = if self.match_char('=') {
                    TokenType::NotEqual
                } else {
                    TokenType::Not
                };

                self.add_token(token_type, None);
            }
            '<' => {
                let token_type = if self.match_char('=') {
                    TokenType::LessThanEqual
                } else {
                    TokenType::LessThan
                };

                self.add_token(token_type, None);
            }
            '>' => {
                let token_type = if self.match_char('=') {
                    TokenType::GreaterThanEqual
                } else {
                    TokenType::GreaterThan
                };

                self.add_token(token_type, None);
            }
            '&' => {
                if self.match_char('&') {
                    self.add_token(TokenType::And, None);
                } else {
                    self.add_error_token("Unrecognized character: '&'");
                };
            }
            '|' => {
                if self.match_char('|') {
                    self.add_token(TokenType::Or, None)
                } else {
                    self.add_error_token("Unrecognized character: '|'")
                };
            }

            '/' => {
                if self.match_char('/') {
                    while self.peek() != '\n' && !self.is_at_end() {
                        self.advance();
                    }
                } else {
                    self.add_token(TokenType::Divide, None)
                };
            }

            // Cadenas
            '"' => self.string_literal(),

            // Literales e Identificadores
            _ => {
                if c.is_ascii_digit() {
                    self.number_literal();
                } else if is_alpha(c) {
                    self.identifier();
                } else {
                    self.add_error_token(&format!("Unrecognized character: '{}'", c));
                }
            }
        }
    }

    fn advance(&mut self) -> char {
        let c = self.source[self.current];
        self.current += 1;
        self.column += 1;

        c
    }

    fn match_char(&mut self, expected: char) -> bool {
        if self.is_at_end() || self.source[self.current] != expected {
            return false;
        }

        self.current += 1;
        self.column += 1;

        true
    }

    fn peek(&self) -> char {
        if self.is_at_end() {
            '\0'
        } else {
            self.source[self.current]
        }
    }

    fn peek_next(&self) -> char {
        if self.current + 1 >= self.source.len() {
            '\0'
        } else {
            self.source[self.current + 1]
        }
    }

    fn is_at_end(&self) -> bool {
        self.current >= self.source.len()
    }

    fn string_literal(&mut self) {
        while self.peek() != '"' && !self.is_at_end() {
            if self.peek() == '\n' {
                self.line += 1;
                self.column = 1;
            }

            self.advance();
        }

        if self.is_at_end() {
            self.add_error_token("Unterminated string");
            return;
        }

        self.advance();

        let value: String = self.source[self.start + 1..self.current - 1]
            .iter()
            .collect();

        self.add_token(
            TokenType::StringLiteral,
            Some(LiteralValue::String(value)),
        );
    }

    fn number_literal(&mut self) {
        while self.peek().is_ascii_digit() {
            self.advance();
        }

        if self.peek() == '.' && self.peek_next().is_ascii_digit() {
            self.advance();

            while self.peek().is_ascii_digit() {
                self.advance();
            }

            let text: String = self.source[self.start..self.current].iter().collect();
            // Max 20 digits
            let value: f64 = text.parse().unwrap_or(0.0);
            self.add_token(TokenType::FloatLiteral, Some(LiteralValue::Float(value)));
            return;
        }

        let text: String = self.source[self.start..self.current].iter().collect();
        // Max 20 digits
        let value: i64 = text.parse().unwrap_or(0);
        self.add_token(TokenType::IntegerLiteral, Some(LiteralValue::Integer(value)));
    }

    fn identifier(&mut self) {
        while is_alpha_numeric(self.peek()) {
            self.advance();
        }

        let text: String = self.source[self.start..self.current].iter().collect();

        if let Some(token_type) = Self::get_keyword(&text) {
            let literal = if token_type == TokenType::BooleanLiteral {
                Some(LiteralValue::Boolean(text == "true"))
            } else {
                None
            };

            self.add_token(token_type, literal)
        } else {
            self.add_token(TokenType::Identifier, None);
        }
    }

    fn add_token(&mut self, token_type: TokenType, literal: Option<LiteralValue>) {
        let text: String = self.source[self.start..self.current].iter().collect();

        self.tokens.push(Token::new(
            token_type,
            text,
            literal,
            self.line,
            self.start_column,
        ))
    }

    fn add_error_token(&mut self, message: &str) {
        let text: String = self.source[self.start..self.current].iter().collect();

        self.tokens.push(Token::new(
            TokenType::ERROR,
            text,
            Some(LiteralValue::String(message.to_string())),
            self.line,
            self.start_column,
        ))
    }

}

fn is_alpha(c: char) -> bool {
    c.is_ascii_alphabetic() || c == '_'
}

fn is_alpha_numeric(c: char) -> bool {
    is_alpha(c) || c.is_ascii_digit()
}