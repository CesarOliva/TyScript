use std::env;
use std::fs;
use std::io::Read;
use std::process;

use tyscript::lexer::Lexer;
use tyscript::parser::Parser;

fn main() {
    let args: Vec<String> = env::args().collect();

    let source = if args.len() > 1 {
        match fs::read_to_string(&args[1]) {
            Ok(content) => content,
            Err(err) => {
                eprintln!("Error reading file '{}': {}", args[1], err);
                process::exit(1);
            }
        }
    } else {
        let mut buffer = String::new();
        if let Err(err) = std::io::stdin().read_to_string(&mut buffer) {
            eprintln!("Error reading from stdin: {}", err);
            process::exit(1);
        }
        buffer
    };

    let mut lexer = Lexer::new(&source);
    let tokens = lexer.scan_tokens();

    let mut parser = Parser::new(tokens);

    match parser.parse() {
        Ok(program) => println!("{:#?}", program),
        Err(err) => {
            eprintln!("{}", err);
            process::exit(1);
        }
    }
}
