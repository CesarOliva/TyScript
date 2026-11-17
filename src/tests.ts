import { Lexer } from './lexer';
import { Parser } from './parser';
import { SemanticAnalyzer } from './semanticAnalyzer';
import { IntermediateGenerator } from './intermediateGenerator';
import { findBrokenJumps } from './ir';
import { formatQuads, quadTable } from './irFormatter';
import { optimize } from './optimizer';

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

function runIntermediateTest(testName: string, source: string) {
  console.log(`==================================================`);
  console.log(` IR TEST: ${testName}`);
  console.log(`==================================================`);

  const lexer = new Lexer(source);
  const tokens = lexer.scanTokens();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const analyzer = new SemanticAnalyzer();
  const isValid = analyzer.analyze(ast);

  if (!isValid) {
    console.log("❌ ANÁLISIS FALLÓ: se aborta la generación de IR.");
    console.table(analyzer.errors);
    console.log("\n");
    return;
  }

  const quads = new IntermediateGenerator().generate(ast);
  const broken = findBrokenJumps(quads);

  console.log(formatQuads(quads));
  console.table(quadTable(quads));

  if (broken.length > 0) {
    console.log("❌ SALTOS ROTOS (etiquetas inexistentes):", broken);
  } else {
    console.log("✅ IR VÁLIDO: todas las etiquetas referenciadas existen.");
  }
  console.log("\n");
}

// ---------------------------------------------------------------------------
// FASE 2: Optimizador (bloques básicos + pases locales)
// ---------------------------------------------------------------------------

function runOptimizerTest(testName: string, source: string, expectReductionHint?: string) {
  console.log(`==================================================`);
  console.log(` OPT TEST: ${testName}`);
  console.log(`==================================================`);

  const lexer = new Lexer(source);
  const tokens = lexer.scanTokens();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const analyzer = new SemanticAnalyzer();
  const isValid = analyzer.analyze(ast);

  if (!isValid) {
    console.log("❌ ANÁLISIS FALLÓ: el optimizador no se ejecuta.");
    console.table(analyzer.errors);
    console.log("\n");
    return;
  }

  const original = new IntermediateGenerator().generate(ast);
  const result = optimize(original);
  const broken = findBrokenJumps(result.optimizedQuads);

  console.log(`Cuádruples: ${original.length} → ${result.optimizedQuads.length} (eliminados: ${result.removedCount})`);

  console.log("Bloques básicos:");
  console.table(result.blocks.map((b) => ({
    bloque: b.id,
    rango: `${b.start}..${b.end - 1}`,
    predecesores: `[${b.predecessors.join(", ")}]`,
    sucesores: `[${b.successors.join(", ")}]`,
  })));

  console.log("Log de pases:");
  const byPass = new Map<string, number>();
  for (const entry of result.passesLog) {
    if (entry.changed > 0) byPass.set(entry.pass, (byPass.get(entry.pass) ?? 0) + entry.changed);
  }
  if (byPass.size > 0) {
    console.table([...byPass].map(([pass, total]) => ({ pase: pass, cambios: total })));
  } else {
    console.log("(ningún pase aplicó cambios)");
  }

  console.log("Cuádruples optimizados:");
  console.log(formatQuads(result.optimizedQuads));
  console.table(quadTable(result.optimizedQuads));

  const validJumps = broken.length === 0;
  const noGrowth = result.optimizedQuads.length <= original.length;
  const reduced = result.optimizedQuads.length < original.length;

  if (!validJumps) {
    console.log("❌ SALTOS ROTOS en el IR optimizado:", broken);
  } else if (!noGrowth) {
    console.log("❌ El optimizador AUMENTÓ el número de cuádruples.");
  } else if (expectReductionHint && !reduced) {
    console.log(`❌ Se esperaba reducción (${expectReductionHint}) pero el tamaño no cambió.`);
  } else {
    console.log("✅ OPTIMIZACIÓN OK: saltos válidos y tamaño no crece.");
  }
  console.log("\n");
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

// -----------------------------------------------------------------------------
// FASE 1: Programas de prueba para el generador de código intermedio
// -----------------------------------------------------------------------------

const factorialCode = `
program Factorial {
  int n = 5;
  int factorial = 1;
  for (int i = 1; i <= n; i = i + 1) {
    factorial = factorial * i;
  }
  print(factorial);
}
`;

const fibonacciCode = `
program Fibonacci {
  int a = 0;
  int b = 1;
  int i = 0;
  while (i < 8) {
    int temp = a + b;
    a = b;
    b = temp;
    i = i + 1;
  }
  print(a);
}
`;

const doWhileCode = `
program CuentaRegresiva {
  int n = 3;
  do {
    print(n);
    n = n - 1;
  } while (n > 0);
  print("Fin");
}
`;

const ifElseCode = `
program ifElse {
  int x = 10;
  if (x > 5) {
    if (x % 2 == 0) {
      print("Par mayor a 5");
    } else {
      print("Impar mayor a 5");
    }
  } else {
    print("Menor o igual a 5");
  }
}
`;

const estructurasCode = `
program Estructuras {
  stack<int> pila;
  queue<string> cola;
  pila.push(1);
  pila.push(2);
  int tope = pila.peek();
  print(tope);
  int undo = pila.pop();
  print(undo);
  cola.enqueue("a");
  cola.enqueue("b");
  print(cola.front());
  string salida = cola.dequeue();
  print(salida);
  print(cola.size());
  print(pila.isEmpty());
}
`;

const arreglosCode = `
program Arreglos {
  int[] numeros = [10, 20, 30];
  numeros[0] = 100;
  print(numeros[0]);
  print(numeros[2]);
  int i = 1;
  print(numeros[i]);
}
`;

const logicocode = `
program Logico {
  bool activo = true;
  int x = 4;
  if (activo && x > 0) {
    print("OK and");
  }
  if (!activo || x == 0) {
    print("OK or");
  }
  print(-x);
}
`;

const readCode = `
program Lectura {
  int edad;
  read(edad);
  if (edad >= 18) {
    print("Mayor de edad");
  }
}
`;

runIntermediateTest("IR Factorial (for)", factorialCode);
runIntermediateTest("IR Fibonacci (while)", fibonacciCode);
runIntermediateTest("IR CuentaRegresiva (do-while)", doWhileCode);
runIntermediateTest("IR if/else anidados", ifElseCode);
runIntermediateTest("IR stack y queue", estructurasCode);
runIntermediateTest("IR arreglos e índices", arreglosCode);
runIntermediateTest("IR operadores lógicos y unarios", logicocode);
runIntermediateTest("IR read", readCode);

// -----------------------------------------------------------------------------
// FASE 2: Programas de prueba para el optimizador
// -----------------------------------------------------------------------------

const plegadoCode = `
program Plegado {
  int x = 2 + 3 * 4;
  print(x);
}
`;

const algebraicoCode = `
program Algebraico {
  int x = 7;
  int y = x + 0;
  int z = 1 * x;
  int w = 0 * x;
  bool b = true && false;
  bool c = true || b;
  print(y);
  print(z);
  print(w);
  print(b);
  print(c);
}
`;

const enCadenaCode = `
program EnCadena {
  const int K = 10;
  int a = K;
  int b = a;
  int c = b + 0;
  print(c);
}
`;

const subexpresionesCode = `
program Subexpresiones {
  int a = 3;
  int b = 4;
  int r1 = a + b;
  int r2 = a + b;
  int r3 = b + a;
  int r4 = a * b;
  print(r1 + r2 + r3 + r4);
}
`;

const codigoMuertoCode = `
program CodigoMuerto {
  int x = 5;
  int unused = x * 2 + 1;
  print(x);
}
`;

const bucleOptimizadoCode = `
program Bucle {
  int suma = 0;
  for (int i = 0; i < 10; i = i + 1) {
    suma = suma + i * 1;
  }
  print(suma);
}
`;

runOptimizerTest("OPT plegado de constantes (x = 2 + 3*4)", plegadoCode, "x debe quedar en una sola asignación");
runOptimizerTest("OPT simplificación algebraica", algebraicoCode, "x+0, x*1, x*0 y bools constantes");
runOptimizerTest("OPT propagación de constantes/copias", enCadenaCode, "la constante debe propagarse");
runOptimizerTest("OPT CSE local (a+b repetido)", subexpresionesCode, "subexpresiones repetidas");
runOptimizerTest("OPT código muerto", codigoMuertoCode, "asignaciones a temporales no usados");
runOptimizerTest("OPT bucle con for", bucleOptimizadoCode, "i*1 dentro del bucle");