import { Lexer } from './lexer';
import { Parser } from './parser';
import { SemanticAnalyzer } from './semanticAnalyzer';

function runSemanticTest(testName: string, source: string) {
  console.log(`==================================================`);
  console.log(` RUNNING TEST: ${testName}`);
  console.log(`==================================================`);

  // 1. Fase Léxica
  const lexer = new Lexer(source);
  const tokens = lexer.scanTokens();

  // 2. Fase Sintáctica
  const parser = new Parser(tokens);
  const ast = parser.parse();

  // 3. Fase Semántica
  const analyzer = new SemanticAnalyzer();
  const isValid = analyzer.analyze(ast);

  if (isValid) {
    console.log("✅ ANÁLISIS SEMÁNTICO EXITOSO: El programa cumple todas las reglas semánticas.\n");
  } else {
    console.log("❌ ERRORES SEMÁNTICOS DETECTADOS:");
    console.table(analyzer.errors);
    console.log("\n");
  }
}

// -----------------------------------------------------------------------------
// CASO 1: Programa Válido (Integra variables, constantes, asignaciones, for, if y stack)
// -----------------------------------------------------------------------------
const validCode = `
program TestValido {
  const int LIMIT = 5;
  int count = 0;
  string msg = "Iteracion:";
  stack<int> numeros;
  numeros.push(5);

  for (int i = 0; i < LIMIT; i = i + 1) {
    print(msg);
    print(i);
  }

  if (count == 0) {
    print("Conteo inicializado correctamente");
  }
}
`;

// -----------------------------------------------------------------------------
// CASO 2: Errores Semánticos Acumulados
// -----------------------------------------------------------------------------
const invalidCode = `
program TestErrores {
  const int MAX = 100;
  int x = 10;

  // Error 1: Variable no declarada ('y')
  y = 20;

  // Error 2: Modificación de constante ('MAX')
  MAX = 200;

  // Error 3: Condición no booleana en 'if' ('x' es tipo int)
  if (x) {
    print("Error");
  }

  // Error 4: Incompatibilidad de tipos en asignación
  x = "Hola Mundo";

  // Error 5: Modificación con 'read()' hacia una constante
  read(MAX);
}
`;

// -----------------------------------------------------------------------------
// CASO 3: Error de Uso de Variables Fuera de Ámbito (Scope Check)
// -----------------------------------------------------------------------------
const outOfScopeCode = `
program TestScope {
  if (true) {
    int temp = 42;
  }
  // Error: 'temp' fue declarada en el bloque del 'if' y no existe en el ámbito global
  print(temp);
}
`;

// Ejecutar el conjunto de pruebas
runSemanticTest("Caso 1: Código Semánticamente Válido", validCode);
runSemanticTest("Caso 2: Múltiples Errores Semánticos", invalidCode);
runSemanticTest("Caso 3: Variable Fuera de Ámbito (Scope Error)", outOfScopeCode);