import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import 'xterm/css/xterm.css';

export interface ReplayFrame {
  time: number;
  type: 'i' | 'o';
  data: string;
}

interface Props {
  frames: ReplayFrame[];
  currentIndex: number;
  cols?: number;
  rows?: number;
}

export const SshReplayTerminal: React.FC<Props> = ({
  frames,
  currentIndex,
  cols = 80,
  rows = 24,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cols,
      rows,
      convertEol: true,
      disableStdin: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
      theme: {
        background: '#0F172A',
        foreground: '#F8FAFC',
        cursor: '#06B6D4',
        selectionBackground: '#334155',
      },
    });

    term.open(containerRef.current);
    termRef.current = term;

    return () => {
      term.dispose();
      termRef.current = null;
    };
  }, [cols, rows]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    term.reset();
    let output = '';
    for (let i = 0; i < currentIndex && i < frames.length; i++) {
      if (frames[i]?.type === 'o') {
        output += frames[i].data;
      }
    }
    if (output) {
      term.write(output);
    }
  }, [currentIndex, frames]);

  return (
    <div
      ref={containerRef}
      className="replay-terminal w-full h-full min-h-[400px] rounded-lg overflow-hidden border border-white/[0.06]"
    />
  );
};
