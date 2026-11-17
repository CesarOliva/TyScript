# Explicación — `src/flowGraph.ts`

Este módulo implementa la primera mitad de la **Fase 2** del plan (`documentation/5-Compilador.md`): el análisis del **grafo de flujo de control** sobre el código intermedio. Su función principal es dividir la lista lineal de cuádruples en **bloques básicos** y conectarlos con aristas (`predecessors` / `successors`), el mapa que el optimizador y el generador de código usan para trabajar "localmente" y para detectar código inalcanzable.

### 1. El bloque básico (`BasicBlock`)

Un bloque básico es una secuencia máxima de cuádruples que se ejecutan **siempre de corrido**:
si la primera instrucción del bloque se ejecuta, todas las demás se ejecutan en orden sin saltos intermedios. Cada bloque se describe con:
* **`id`**: número secuencial del bloque (el bloque 0 es la entrada del programa).
* **`start` / `end`**: rango de índices de cuádruples (start inclusivo, end exclusivo).
* **`predecessors`** y **`successors`**: listas de ids de bloques que llegan a él / a los que él llega (las aristas del grafo).

El resultado completo (`FlowGraph`) incluye además **`targetBlocks`**, un mapa"nombre de etiqueta → id del bloque donde vive esa etiqueta", útil para resolver saltos.

### 2. Cálculo de líderes

Un **líder** es la primera instrucción de un bloque. La regla clásica de tres casos (difiere apenas de la teoría porque aquí la etiqueta ya es un cuádruple propio):

1. La **primera instrucción** del programa siempre es líder.
2. Todo cuádruple **`label`** es líder (marca el inicio de su propio bloque).
3. El cuádruple **inmediatamente después** de un salto (`goto` o `if_false`) también es líder, porque puede ejecutarse por *fallthrough* tras el salto condicional o tras un bloque terminado.

Además, para cada salto se resuelve su **destino**: en `goto` la etiqueta vive en `arg1`, pero en `if_false` la condición está en `arg1` y la etiqueta destino en `arg2` (convenio definido por `QuadGenerator` en `src/ir.ts`). Confundir ambos casos rompería el grafo.

### 3. Construcción de los bloques

Con el conjunto de índices de líderes ordenado, cada bloque toma el rango `[start, siguiente líder)`. Ninguna instrucción queda fuera de un bloque.

### 4. Aristas del grafo

Se decide mirando la **última** instrucción de cada bloque:

* **`goto`** → una sola arista hacia el bloque que contiene la etiqueta destino (resuelta con `blockOfLabel`, que localiza a qué bloque pertenece el índice de la etiqueta).
* **`if_false`** → dos aristas: hacia el bloque destino y hacia el bloque siguiente (*fallthrough*: si la condición es verdadera, la ejecución continúa en el siguiente bloque).
* **Cualquier otra** (incluido terminar en una asignación, `print`, etc.) → una sola arista de fallthrough hacia el bloque siguiente, si existe.

Cada arista se registra como `successor` en el bloque origen y como `predecessor` en el bloque destino, manteniendo las dos direcciones siempre sincronizadas.

### 5. `targetBlocks`

Recorriendo el índice de etiquetas (`indexByLabel`), se determina en qué bloque cae cada `label` y se guarda la correspondencia. Esto permite que otros módulos (el optimizador, el generador de JS) conviertan "saltar a `L3`" en "continuar en el bloque X" sin re-hacer el análisis.

### 6. Por qué importa

* Los **pases locales** del optimizador (propagación, CSE) se ejecutan *por bloque*: el bloque es la frontera de seguridad, ya que dentro de él el flujo es lineal y el valor de una variable se conoce sin ambigüedad hasta su próxima asignación.
* La detección de **código inalcanzable** (BFS desde el bloque 0) solo es posible con aristas confiables.