export interface SymbolEntry {
    name: string;
    type: string;
    kind: 'variable' | 'constant';
    scope: number;
    mutable: boolean;
}

export class SymbolTable {
    private scopes: Map<string, SymbolEntry>[] = [new Map()];
    private currentScope = 0;

    enterScope(): void {
        this.currentScope++;
        this.scopes.push(new Map());
    }

    exitScope(): void {
        if (this.currentScope > 0 ) {
            this.scopes.pop();
            this.currentScope--;
        }
    }

    insert(entry: SymbolEntry): boolean {
        const currentMap = this.scopes[this.currentScope];
        if (currentMap.has(entry.name)) {
            return false;
        }

        currentMap.set(entry.name, entry);
        return true;
    }

    lookup(name: string): SymbolEntry | undefined {
        // Desde ambito local a global
        for(let i = this.scopes.length - 1; i>=0;i--){
            const symbol = this.scopes[i].get(name);
            if (symbol) {
                return symbol;
            }
        }
        // Variable no declarada
        return undefined;
    }

    getCurrentScopeLevel(): number {
        return this.currentScope;
    }

    getAllSymbols(): SymbolEntry[] {
        return this.scopes.flatMap((scope) => [...scope.values()]);
    }
}