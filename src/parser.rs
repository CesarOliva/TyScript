use crate::ast::{
    ElseBranch, ExpressionNode, ForUpdate, IfStatementNode, ProgramNode, StatementNode
};
use crate::lexer::{Token, TokenType};

pub struct Parser {
    tokens: Vec<Token>,
    current: usize
}

impl Parser {
    pub fn new(tokens: Vec<Token>) -> Self {
        Self { tokens, current: 0 }
    }

    pub fn parse(&mut self) -> Result<ProgramNode, String> {
        self.program()
    }

    // program ::= "program" IDENTIFIER "{" statementList "}" EOF
    fn program(&mut self) -> Result<ProgramNode, String> {
        self.consume(
            TokenType::Program,
            "Expected the reserved word 'program'."            
        )?;

        let name = self.consume(
            TokenType::Identifier, "Expected the program name."
        )?.lexeme.clone();

        self.consume(
            TokenType::LeftBrace,
            "Expected '{' after the program name.",
        )?;

        let mut body = Vec::new();

        while !self.check(TokenType::RightBrace) && !self.is_at_end() {
            body.push(self.statement()?);
        }

        self.consume(
            TokenType::RightBrace,
            "Expected '}' at the end of the program."
        )?;

        self.consume(
            TokenType::EOF,
            "Expected the end of the file."
        )?;

        Ok(ProgramNode {
            name,
            body
        })
    }

    // statement ::= variableDeclaration | constantDeclaration | ifStatement | forStatement ...
    fn statement(&mut self) -> Result<StatementNode, String> {
        if self.match_types(&[
            TokenType::Int,
            TokenType::Float,
            TokenType::String,
            TokenType::Boolean,
            TokenType::Queue,
            TokenType::Stack
        ]) {
            return self.variable_declaration();
        }

        if self.match_types(&[TokenType::Const]) {
            return self.constant_declaration();
        }

        if self.match_types(&[TokenType::If]) {
            return self.if_statement();
        }

        if self.match_types(&[TokenType::For]) {
            return self.for_statement();
        }

        if self.match_types(&[TokenType::While]) {
            return self.while_statement();
        }

        if self.match_types(&[TokenType::Do]) {
            return self.do_while_statement();
        }

        if self.match_types(&[TokenType::Print]) {
            return self.print_statement();
        }

        if self.match_types(&[TokenType::Read]) {
            return self.read_statement();
        }

        if self.check(TokenType::Identifier) 
            && (self.peek_next_type() == Some(TokenType::Assign)
            || self.peek_next_type() == Some(TokenType::LeftBracket)) 
        {
            return self.assignment_statement();
        }

        self.expression_statement()
    }

    // variableDeclaration ::= dataType IDENTIFIER [ "=" expression ] ";"
    fn variable_declaration(&mut self) -> Result<StatementNode, String> {
        let type_token = self.previous().clone();
        let mut full_type = type_token.lexeme.clone();

        // Arrays
        if self.match_types(&[TokenType::LeftBracket]) {
            self.consume(
                TokenType::RightBracket,
                "Expected ']' in the array type declaration.",
            )?;
            full_type = format!("{}[]", type_token.lexeme);
        }

        // Queues, Stacks
        if type_token.token_type == TokenType::Stack || type_token.token_type == TokenType::Queue {
            self.consume(
                TokenType:: LessThan,
                "Expected '<' after the struct type declaration."
            )?;

            let inner_type = self.consume_any(
                &[
                    TokenType::Int,
                    TokenType::Float,
                    TokenType::String,
                    TokenType::Boolean
                ],
                "Expected a primitive type inside '< >'."
            )?;

            self.consume(
                TokenType::GreaterThan,
                "Expected '>' to close the parameterized type.",
            )?;

            full_type = format!("{}<{}>", type_token.lexeme, inner_type.lexeme)
        }

        let name = self.consume(
            TokenType::Identifier, 
            "Expected the variable name."
        )?.lexeme.clone();

        let mut initializer = None;

        if self.match_types(&[TokenType::Assign]) {
            initializer = Some(self.expression()?);
        }

        self.consume(TokenType::Semicolon, "Expected ';' after the declaration.")?;

        Ok(StatementNode::VariableDeclaration {
            var_type: full_type,
            name,
            initializer,
        })
    }

    // constantDeclaration ::= "const" dataType IDENTIFIER "=" expression ";"
    fn constant_declaration(&mut self) -> Result<StatementNode, String> {
        let type_token = self.consume_any(
            &[
                TokenType::Int,
                TokenType::Float,
                TokenType::String,
                TokenType::Boolean
            ],
            "Expected the data type after 'const'."
        )?;
        
        let name = self.consume(
            TokenType::Identifier,
            "Expected the constant name."
        )?.lexeme.clone();

        self.consume(
            TokenType::Assign,
            "Expected '=' in the constant declaration."
        )?;

        let value = self.expression()?;

        self.consume(
            TokenType::Semicolon,
            "Expected ';' at the end of the constant."
        )?;

        Ok(StatementNode::ConstantDeclaration {
            var_type: type_token.lexeme,
            name,
            value
        })
    }

    // ifStatement ::= "if" "(" expression ")" block [ "else" ( ifStatement | block ) ]
    fn if_statement(&mut self) -> Result<StatementNode, String> {
        Ok(StatementNode::IfStatement(self.if_statement_node()?))
    }

    fn if_statement_node(&mut self) -> Result<IfStatementNode, String> {
        self.consume(
            TokenType::LeftParen, 
            "Expected '(' after 'if'."
        )?;

        let condition = self.expression()?;

        self.consume(
            TokenType::RightParen,
            "Expected ')' after the condition."
        )?;

        let then_branch = self.block()?;
        let mut else_branch = None;

        if self.match_types(&[TokenType::Else]) {
            if self.match_types(&[TokenType::If]) {
                let if_node = self.if_statement_node()?;
                else_branch = Some(ElseBranch::If(Box::new(if_node)));
            } else {
                let block_nodes = self.block()?;
                else_branch = Some(ElseBranch::Block(block_nodes));
            }
        }

        Ok(IfStatementNode {
            condition,
            then_branch,
            else_branch
        })
    }

    // forStatement ::= "for" "(" forInit ";" expression ";" forUpdate ")" block
    fn for_statement(&mut self) -> Result<StatementNode, String> {
        self.consume(
            TokenType::LeftParen,
            "Expected '(' after 'for'."
        )?;

        let mut init = None;
        if !self.match_types(&[TokenType::Semicolon]) {
            if self.match_types(&[
                TokenType::Int,
                TokenType::Float,
                TokenType::String,
                TokenType::Boolean,
            ]) {
                init = Some(Box::new(self.variable_declaration()?));
            } else {
                init = Some(Box::new(self.assignment_statement()?));
            }
        }

        let mut condition = None;

        if !self.check(TokenType::Semicolon) {
            condition = Some(self.expression()?);
        }

        self.consume(
            TokenType::Semicolon,
            "Expected ';' after the 'for' condition."
        )?;

        let mut update = None;

        if !self.check(TokenType::RightParen) {
            if self.check(TokenType::Identifier)
                && self.peek_next_type() == Some(TokenType::Assign)
            {
                let target = self.advance().lexeme.clone();

                self.advance();

                let val = self.expression()?;

                let assign_node = StatementNode::Assignment {
                    target,
                    index: None,
                    value: val
                };

                update = Some(ForUpdate::Statement(Box::new(assign_node)));
            } else {
                let expr = self.expression()?;
                update = Some(ForUpdate::Expression(expr))
            }
        }

        self.consume(
            TokenType::RightParen,
            "Expected ')' after the 'for' parameters.",
        )?;

        let body = self.block()?;

        Ok(StatementNode::ForStatement {
            initializer: init,
            condition,
            update,
            body
        })
    }

    // whileStatement ::= "while" "(" expression ")" block
    fn while_statement(&mut self) -> Result<StatementNode, String> {
        self.consume(
            TokenType::LeftParen,
            "Expected '(' after 'while'"
        )?;

        let condition = self.expression()?;

        self.consume(
            TokenType::RightParen,
            "Expected ')' after the condition.",
        )?;

        let body = self.block()?;

        Ok(StatementNode::WhileStatement {
            condition,
            body
        })
    }

    // doWhileStatement ::= "do" block "while" "(" expression ")" ";"
    fn do_while_statement(&mut self) -> Result<StatementNode, String> {
        let body = self.block()?;

        self.consume(
            TokenType::While,
            "Expected 'while' after the 'do' block."
        )?;

        self.consume(
            TokenType::LeftParen, 
            "Expected '(' after 'while'."
        )?;

        let condition = self.expression()?;

        self.consume(
            TokenType::RightParen,
            "Expected ')' after the condition."
        )?;

        self.consume(
            TokenType::Semicolon,
            "Expected ';' at the end of the 'do-while'."
        )?;

        Ok(StatementNode::DoWhileStatement {
            body,
            condition
        })
    }

    // printStatement ::= "print" "(" expression ")" ";"
    fn print_statement(&mut self) -> Result<StatementNode, String> {
        self.consume(
            TokenType::LeftParen, 
            "Expected '(' after 'print'."
        )?;

        let expression = self.expression()?;

        self.consume(
            TokenType::RightParen,
            "Expected ')' after the expression."
        )?;

        self.consume(
            TokenType::Semicolon,
            "Expected ';' at the end of print"
        )?;

        Ok(StatementNode::PrintStatement {
            expression
        })
    }

    // readStatement ::= "read" "(" target ")" ";"    
    fn read_statement(&mut self) -> Result<StatementNode, String> {
        self.consume(
            TokenType::LeftParen, 
            "Expected '(' after 'read'."
        )?;

        let target = self.consume(
            TokenType::Identifier,
            "Expected a variable in 'read'."
        )?
        .lexeme
        .clone();

        self.consume(
            TokenType::RightParen,
            "Expected ')' after the variable."
        )?;

        self.consume(
            TokenType::Semicolon,
            "Expected ';' after read."
        )?;

        Ok(StatementNode::ReadStatement {
            target
        })
    }

    fn assignment_statement(&mut self) -> Result<StatementNode, String> {
        let target = self.consume(
            TokenType::Identifier,
            "Expected the identifier."
        )?
        .lexeme
        .clone();

        let mut index = None;

        // Array
        if self.match_types(&[TokenType::LeftBracket]) {
            index = Some(self.expression()?);

            self.consume(
                TokenType::RightBracket,
                "Expected ']' after the array index."
            )?;
        }

        self.consume(
            TokenType::Assign,
            "Expected '=' in the assignment."
        )?;

        let value = self.expression()?;

        self.consume(
            TokenType::Semicolon,
            "Expected ';' at the end of the assignment.",
        )?;

        Ok(StatementNode::Assignment {
            target,
            index,
            value
        })
    }

    fn block(&mut self) -> Result<Vec<StatementNode>, String> {
        self.consume(
            TokenType::LeftBrace,
            "Expected '{' at the start of the block."
        )?;

        let mut statements = Vec::new();

        while !self.check(TokenType::RightBrace) && !self.is_at_end() {
            statements.push(self.statement()?);
        }

        self.consume(
            TokenType::RightBrace,
            "Expected '}' to close the block."
        )?;

        Ok(statements)
    }

    fn expression_statement(&mut self) -> Result<StatementNode, String> {
        let expression = self.expression()?;

        self.consume(
            TokenType::Semicolon,
            "Expected ';' at the end of the expression.",            
        )?;

        Ok(StatementNode::ExpressionStatement {
            expression
        })
    }

    fn expression(&mut self) -> Result<ExpressionNode, String> {
        self.logical_or()
    }

    fn logical_or(&mut self) -> Result<ExpressionNode, String> {
        let mut expr = self.logical_and()?;

        while self.match_types(&[TokenType::Or]) {
            let operator = self.previous().lexeme.clone();
            let right = self.logical_and()?;

            expr = ExpressionNode::Binary {
                left: Box::new(expr),
                operator,
                right: Box::new(right)
            };
        }

        Ok(expr)
    }

    fn logical_and(&mut self) -> Result<ExpressionNode, String> {
        let mut expr = self.equality()?;

        while self.match_types(&[TokenType::And]) {
            let operator = self.previous().lexeme.clone();
            let right = self.equality()?;

            expr = ExpressionNode::Binary {
                left: Box::new(expr),
                operator,
                right: Box::new(right)
            };
        }

        Ok(expr)
    }

    fn equality(&mut self) -> Result<ExpressionNode, String> {
        let mut expr = self.relational()?;

        while self.match_types(&[TokenType::EqualEqual, TokenType::NotEqual]) {
            let operator = self.previous().lexeme.clone();
            let right = self.relational()?;

            expr = ExpressionNode::Binary {
                left: Box::new(expr),
                operator,
                right: Box::new(right)
            }
        }

        Ok(expr)
    }

    fn relational(&mut self) -> Result<ExpressionNode, String> {
        let mut expr = self.additive()?;

        while self.match_types(&[
            TokenType::LessThan,
            TokenType::LessThanEqual,
            TokenType::GreaterThan,
            TokenType::GreaterThanEqual,
        ]) {
            let operator = self.previous().lexeme.clone();
            let right = self.additive()?;

            expr = ExpressionNode::Binary {
                left: Box::new(expr),
                operator,
                right: Box::new(right)
            };
        }

        Ok(expr)
    }

    fn additive(&mut self) -> Result<ExpressionNode, String> {
        let mut expr = self.multiplicative()?;

        while self.match_types(&[TokenType::Plus, TokenType::Minus]) {
            let operator = self.previous().lexeme.clone();
            let right = self.multiplicative()?;

            expr = ExpressionNode::Binary {
                left: Box::new(expr),
                operator,
                right: Box::new(right)
            }
        }

        Ok(expr)
    }

    fn multiplicative(&mut self) -> Result<ExpressionNode, String> {
        let mut expr = self.unary()?;

        while self.match_types(&[TokenType::Multiply, TokenType::Divide, TokenType::Module]) {
            let operator = self.previous().lexeme.clone();
            let right = self.unary()?;

            expr = ExpressionNode::Binary {
                left: Box::new(expr),
                operator,
                right: Box::new(right)
            }
        }

        Ok(expr)
    }

    fn unary(&mut self) -> Result<ExpressionNode, String> {
        if self.match_types(&[TokenType::Not, TokenType::Minus]) {
            let operator = self.previous().lexeme.clone();
            let argument = self.unary()?;

            return Ok(ExpressionNode::Unary {
                operator,
                argument: Box::new(argument)
            })
        }

        self.primary()
    }

    fn primary(&mut self) -> Result<ExpressionNode, String> {
        // Array Literals
        if self.match_types(&[TokenType::LeftBracket]) {
            let mut elements = Vec::new();
            if !self.check(TokenType::RightBracket) {
                loop {
                    elements.push(self.expression()?);
                    if !self.match_types(&[TokenType::Comma]) {
                        break
                    }
                }
            }

            self.consume(
                TokenType::RightBracket,
                "Expected ']' to close the array literal.",
            )?;
    
            return Ok(ExpressionNode::ArrayLiteral {
                elements
            });
        }

        // Primitive literals
        if self.match_types(&[
            TokenType::IntegerLiteral,
            TokenType::FloatLiteral,
            TokenType::StringLiteral,
            TokenType::BooleanLiteral,
        ]) {
            let token = self.previous();

            let value = token
                .literal
                .clone()
                .ok_or_else(|| "Internal error: literal without value.".to_string())?;

            return Ok(ExpressionNode::Literal {
                value: Some(value),
                raw: token.lexeme.clone()
            });
        }

        // Identificadores, Metodos y acceso por indice
        if self.match_types(&[TokenType::Identifier]) {
            let name = self.previous().lexeme.clone();
            let mut expr = ExpressionNode::Identifier { name: name.clone() };

            // Acceso por indice
            if self.match_types(&[TokenType::LeftBracket]) {
                let index = self.expression()?;
                self.consume(
                    TokenType::RightBracket,
                    "Expected ']' after the index."
                )?;

                expr = ExpressionNode::IndexAccess {
                    array: Box::new(expr),
                    index: Box::new(index),
                };
            }

            // Llamadas a metodos
            if self.match_types(&[TokenType::Dot]) {
                let method = self.consume(
                    TokenType::Identifier,
                    "Expected the method name after '.'."
                )?.lexeme.clone();

                self.consume(
                    TokenType::LeftParen,
                    "Expected '(' after the method name."
                )?;

                let mut args = Vec::new();

                if !self.check(TokenType::RightParen) {
                    loop {
                        args.push(self.expression()?);

                        if !self.match_types(&[TokenType::Comma]) {
                            break;
                        }
                    }
                }

                self.consume(
                    TokenType::RightParen,
                    "Expected ')' after the method arguments."
                )?;

                return Ok(ExpressionNode::MethodCall {
                    object: name,
                    method,
                    args
                });
            }

            return Ok(expr);
        }

        let peek = self.peek();

        Err(format!(
            "[Line {}, Col {}] Syntax error: invalid expression near '{}'",
            peek.line, peek.column, peek.lexeme
        ))
    }

    // Métodos Auxiliares
    fn match_types(&mut self, types: &[TokenType]) -> bool {
        for token_type in types {
            if self.check(token_type.clone()) {
                self.advance();
                return true;
            }
        }

        false
    }

    fn consume(&mut self, token_type: TokenType, message: &str) -> Result<&Token, String> {
        if self.check(token_type) {
            Ok(self.advance())
        } else {
            let peek = self.peek();

            Err(format!(
                "[Line {}, Col {}] Syntax error: {} (found '{}').",
                peek.line, peek.column, message, peek.lexeme
            ))
        }
    }

    fn consume_any(&mut self, types: &[TokenType], message: &str) -> Result<Token, String> {
        for token_type in types {
            if self.check(token_type.clone()) {
                return Ok(self.advance().clone());
            }
        }

        let peek = self.peek();

        Err(format!(
            "[Line {}, Col {}] Syntax error: {}.",
            peek.line, peek.column, message
        ))
    }

    fn check(&self, token_type: TokenType) -> bool {
        if self.is_at_end() {
            token_type == TokenType::EOF
        } else {
            self.peek().token_type == token_type
        }
    }

    fn advance(&mut self) -> &Token {
        if !self.is_at_end() {
            self.current += 1;
        }

        self.previous()
    }

    fn is_at_end(&self) -> bool {
        self.peek().token_type == TokenType::EOF
    }

    fn peek(&self) -> &Token {
        &self.tokens[self.current]
    }

    fn peek_next_type(&self) -> Option<TokenType> {
        if self.current + 1 >= self.tokens.len() {
            None
        } else {
            Some(self.tokens[self.current + 1].token_type.clone())
        }
    }

    fn previous(&self) -> &Token {
        &self.tokens[self.current -1]
    }
}