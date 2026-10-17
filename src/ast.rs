use crate::token::LiteralValue;

#[derive(Debug, Clone, PartialEq)]
pub enum ASTNode {
    Program(ProgramNode),
    Statement(StatementNode),
    Expression(ExpressionNode)
}

#[derive(Debug, Clone, PartialEq)]
pub struct ProgramNode {
    pub name: String,
    pub body: Vec<StatementNode>
}

#[derive(Debug, Clone, PartialEq)]
pub enum StatementNode {
    VariableDeclaration {
        var_type: String,
        name: String,
        initializer: Option<ExpressionNode>
    },
    ConstantDeclaration {
        var_type: String,
        name: String,
        value: ExpressionNode
    },
    IfStatement(IfStatementNode),
    ForStatement {
        initializer: Option<Box<StatementNode>>,
        condition: Option<ExpressionNode>,
        update: Option<ForUpdate>,
        body: Vec<StatementNode>
    },
    DoWhileStatement {
        body: Vec<StatementNode>,
        condition: ExpressionNode
    },
    WhileStatement {
        condition: ExpressionNode,
        body: Vec<StatementNode>
    },
    PrintStatement {
        expression: ExpressionNode
    },
    ReadStatement {
        target: String
    },
    Assignment {
        target: String,
        index: Option<ExpressionNode>,
        value: ExpressionNode
    },
    ExpressionStatement {
        expression: ExpressionNode
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct IfStatementNode {
    pub condition: ExpressionNode,
    pub then_branch: Vec<StatementNode>,
    pub else_branch: Option<ElseBranch>
}

#[derive(Debug, Clone, PartialEq)]
pub enum ElseBranch {
    Block(Vec<StatementNode>),
    If(Box<IfStatementNode>)
}

#[derive(Debug, Clone, PartialEq)]
pub enum ForUpdate {
    Expression(ExpressionNode),
    Statement(Box<StatementNode>)
}

#[derive(Debug, Clone, PartialEq)]
pub enum ExpressionNode {
    Binary {
        left: Box<ExpressionNode>,
        operator: String,
        right: Box<ExpressionNode>
    },
    Unary {
        operator: String,
        argument: Box<ExpressionNode>
    },
    Literal {
        value: Option<LiteralValue>,
        raw: String
    },
    Identifier {
        name: String,
    },
    MethodCall {
        object: String,
        method: String,
        args: Vec<ExpressionNode>
    },
    ArrayLiteral {
        elements: Vec<ExpressionNode>
    },
    IndexAccess {
        array: Box<ExpressionNode>,
        index: Box<ExpressionNode>
    }
}