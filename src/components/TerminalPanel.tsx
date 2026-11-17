import { useEffect, useRef } from 'react';

interface TerminalPanelProps {
  lines: string[];
  waitingForInput: boolean;
  onSubmit: (value: string) => void;
  onClear: () => void;
}

export default function TerminalPanel({ lines, waitingForInput, onSubmit, onClear }: TerminalPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
    if (waitingForInput) inputRef.current?.focus();
  }, [lines, waitingForInput]);

  return (
    <section className="shrink-0 h-52 flex flex-col overflow-hidden rounded-lg border border-[#2b3850] bg-[#0b0f16]" aria-label="Terminal">
      <header className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <span className="font-mono text-xs text-[#aeb9ca]">Terminal</span>
        <button className="text-xs text-[#8b96a8] hover:text-white" onClick={onClear}>Limpiar</button>
      </header>
      <div className="flex-1 overflow-auto p-3 font-mono text-xs leading-5" aria-live="polite">
        {lines.length === 0 && !waitingForInput && <p className="text-[#5b6b84]">La salida del programa aparecerá aquí.</p>}
        {lines.map((line, index) => <div key={`${index}-${line}`} className="whitespace-pre-wrap break-words text-[#d8e0ec]">{line}</div>)}
        {waitingForInput && (
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const input = inputRef.current;
              if (!input) return;
              onSubmit(input.value);
              input.value = '';
            }}
          >
            <span className="text-amber-300">read&gt;</span>
            <input ref={inputRef} className="min-w-0 flex-1 bg-transparent text-white outline-none" aria-label="Valor para read" autoComplete="off" />
          </form>
        )}
        <div ref={endRef} />
      </div>
    </section>
  );
}
