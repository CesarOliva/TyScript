import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface CodeEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    fileName?: string;
    highlightedLine?: number | null;
    toolbar?: ReactNode;
}

const LINE_HEIGHT = 20;
const PAD_TOP = 12;

export default function CodeEditor({
    value,
    onChange,
    placeholder = '',
    fileName = 'main.tys',
    highlightedLine = null,
    toolbar,
}: CodeEditorProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [caret, setCaret] = useState({ line: 1, col: 1 });
    const [scrollTop, setScrollTop] = useState(0);
    const [focused, setFocused] = useState(false);

    const lineCount = useMemo(() => value.split('\n').length, [value]);

    const updateCaret = useCallback((el: HTMLTextAreaElement) => {
        const pos = el.selectionStart ?? 0;
        const before = el.value.slice(0, pos);
        const line = before.split('\n').length;
        const col = pos - before.lastIndexOf('\n');
        setCaret({ line, col });
    }, []);

    const handleScroll = useCallback(
        (e: React.UIEvent<HTMLTextAreaElement>) => {
            setScrollTop(e.currentTarget.scrollTop);
            updateCaret(e.currentTarget);
        },
        [updateCaret],
    );

    const handleTab = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const el = e.currentTarget;
                const start = el.selectionStart;
                const end = el.selectionEnd;
                const next = value.slice(0, start) + '    ' + value.slice(end);
                onChange(next);
                requestAnimationFrame(() => {
                    el.selectionStart = el.selectionEnd = start + 4;
                    updateCaret(el);
                });
            }
        }, [value, onChange, updateCaret],
    );

    return (
        <div className="h-full flex flex-1 flex-col overflow-hidden rounded-lg border bg-[#0b0f16] transition-colors border-[#2b3850]">
            <div className="flex shrink-0 items-center justify-between border-b border-white/5 bg-white/2 px-3 py-1.5">
                <div className="flex items-center gap-2">
                    <span className="flex gap-1.5">
                        <i className="block h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                        <i className="block h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                        <i className="block h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                    </span>
                    <span className="ml-2 rounded-t-md border border-b-0 border-white/10 bg-[#0b0f16] px-3 py-1 font-mono text-xs text-gray-200">
                        {fileName}
                    </span>
                </div>
                <div className="flex items-center gap-1.5">{toolbar}</div>
            </div>

            <div className="flex min-h-0 flex-1">
                <div className="w-12 shrink-0 select-none overflow-hidden border-r border-white/5 bg-white/2 py-3">
                    <div style={{ transform: `translateY(${-scrollTop}px)` }}>
                        {Array.from({ length: lineCount }, (_, i) => {
                            const n = i + 1;
                            const active = n === caret.line;
                            const stepped = highlightedLine === n;
                            return (
                                <div
                                    key={n}
                                    style={{ height: LINE_HEIGHT, lineHeight: `${LINE_HEIGHT}px` }}
                                    className={`pr-3 text-right font-mono text-xs tabular-nums ${
                                        stepped ? 'font-bold text-amber-300' : active ? 'font-bold text-white' : 'text-[#3f4f6d]'
                                    }`}
                                >
                                    {stepped ? `▶${n}` : n}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="relative min-w-0 flex-1">
                    {highlightedLine !== null && highlightedLine >= 1 && highlightedLine <= lineCount && (
                        <div
                            aria-hidden
                            className="pointer-events-none absolute left-0 right-0 border-y border-amber-400/40 bg-amber-400/10"
                            style={{
                                top: PAD_TOP + (highlightedLine - 1) * LINE_HEIGHT - scrollTop,
                                height: LINE_HEIGHT,
                            }}
                        />
                    )}
                    <div
                        aria-hidden
                        className="pointer-events-none absolute left-0 right-0 border-y border-white/10 bg-white/5"
                        style={{
                        top: PAD_TOP + (caret.line - 1) * LINE_HEIGHT - scrollTop,
                        height: LINE_HEIGHT,
                        }}
                    />
                    <textarea
                        ref={textareaRef}
                        value={value}

                        onChange={(e) => {
                            onChange(e.target.value);
                            updateCaret(e.target);
                        }}
                        onSelect={(e) => updateCaret(e.currentTarget)}
                        onClick={(e) => updateCaret(e.currentTarget)}
                        onKeyUp={(e) => updateCaret(e.currentTarget)}
                        onKeyDown={handleTab}
                        onScroll={handleScroll}
                        onFocus={(e) => {
                            setFocused(true);
                            updateCaret(e.currentTarget);
                        }}
                        onBlur={() => setFocused(false)}

                        spellCheck={false}
                        autoCapitalize="off"
                        autoCorrect="off"
                        wrap="off"
                        placeholder={placeholder}
                        className="absolute inset-0 h-full w-full resize-none overflow-auto bg-transparent p-3 font-mono text-[13px] leading-5 text-[#e6e9ee] caret-blue-500 outline-none selection:bg-blue-600/40 selection:text-white placeholder:text-[#3f4f6d]"
                        style={{ whiteSpace: 'pre' }}
                    />
                </div>
            </div>

            <div className="flex shrink-0 items-center justify-between border-t border-white/5 bg-white/2 px-3 py-1 font-mono text-[11px] text-[#5b6b84]">
                <span>Ln {caret.line}, Col {caret.col}</span>
                <span>{lineCount} líneas · {value.length} carac. · UTF-8</span>
            </div>
        </div>
    );
}
