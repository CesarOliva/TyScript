import { useEffect, useRef, useState } from 'react';

interface TerminalPanelProps {
  lines: string[];
  waitingForInput: boolean;
  onSubmit: (value: string) => void;
  onClear: () => void;
}

export default function TerminalPanel({ lines, waitingForInput, onSubmit, onClear }: TerminalPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ y: number; height: number } | null>(null);
  const [height, setHeight] = useState(208);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
    if (waitingForInput) inputRef.current?.focus();
  }, [lines, waitingForInput]);

  return (
    <section className="relative shrink-0 flex flex-col overflow-hidden rounded-lg border border-[#2b3850] bg-[#0b0f16]" style={{ height }} aria-label="Terminal">
      <div
        role="separator"
        aria-label="Ajustar altura de la terminal"
        aria-orientation="horizontal"
        aria-valuemin={136}
        aria-valuemax={480}
        aria-valuenow={height}
        tabIndex={0}
        className="absolute inset-x-0 top-0 z-10 h-1.5 cursor-row-resize touch-none hover:bg-blue-500/50 focus-visible:bg-blue-500/70"
        onPointerDown={(event) => {
          dragStart.current = { y: event.clientY, height };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!dragStart.current) return;
          setHeight(Math.max(136, Math.min(480, dragStart.current.height + dragStart.current.y - event.clientY)));
        }}
        onPointerUp={() => { dragStart.current = null; }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp') setHeight((value) => Math.min(480, value + 16));
          if (event.key === 'ArrowDown') setHeight((value) => Math.max(136, value - 16));
        }}
      />
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
