import { describe, expect, it } from 'vitest';
import { CommandLineBuffer } from './commandLineBuffer';

describe('CommandLineBuffer', () => {
  it('records a simple command on Enter', () => {
    const buf = new CommandLineBuffer();
    const { forward, completed } = buf.process('ls -la\r');
    expect(forward).toBe('ls -la\r');
    expect(completed).toHaveLength(1);
    expect(completed[0]?.line).toBe('ls -la');
  });

  it('does not pollute buffer with left arrow escape sequence', () => {
    const buf = new CommandLineBuffer();
    buf.process('echo');
    const { completed } = buf.process('\x1b[D\x1b[Dhi\r');
    expect(completed[0]?.line).toBe('echio');
    expect(completed[0]?.line).not.toMatch(/[\[]/);
  });

  it('inserts at cursor after moving left', () => {
    const buf = new CommandLineBuffer();
    buf.process('abcd');
    const { completed } = buf.process('\x1b[D\x1b[DX\r');
    expect(completed[0]?.line).toBe('abXd');
  });

  it('handles backspace at cursor position', () => {
    const buf = new CommandLineBuffer();
    buf.process('abcd');
    const { completed } = buf.process('\x1b[D\x7f\r');
    expect(completed[0]?.line).toBe('abd');
  });

  it('handles delete key at cursor', () => {
    const buf = new CommandLineBuffer();
    buf.process('abcd');
    const { completed } = buf.process('\x1b[D\x1b[3~\r');
    expect(completed[0]?.line).toBe('acd');
  });

  it('handles home/end and ctrl+a/ctrl+e', () => {
    const buf = new CommandLineBuffer();
    buf.process('abcd');
    let result = buf.process('\x01insert-\x05-tail\r');
    expect(result.completed[0]?.line).toBe('insert-abcd-tail');

    const buf2 = new CommandLineBuffer();
    buf2.process('abcd');
    result = buf2.process('\x1b[Hstart-\x1b[F-end\r');
    expect(result.completed[0]?.line).toBe('start-abcd-end');
  });

  it('records bracketed paste as one line', () => {
    const buf = new CommandLineBuffer();
    const pasted = '\x1b[200~docker ps -a\x1b[201~';
    const { forward, completed } = buf.process(`${pasted}\r`);
    expect(forward).toBe(`${pasted}\r`);
    expect(completed[0]?.line).toBe('docker ps -a');
  });

  it('inserts pasted text at cursor position', () => {
    const buf = new CommandLineBuffer();
    buf.process('ec');
    const { completed } = buf.process('\x1b[200~ho\x1b[201~\r');
    expect(completed[0]?.line).toBe('echo');
  });

  it('uses client lineOnEnter when local buffer is empty', () => {
    const buf = new CommandLineBuffer();
    buf.process('\x1b[A');
    const { completed } = buf.process('\r', { lineOnEnter: 'pwd' });
    expect(completed[0]?.line).toBe('pwd');
  });

  it('prefers local buffer over lineOnEnter', () => {
    const buf = new CommandLineBuffer();
    const { completed } = buf.process('ls\r', { lineOnEnter: 'pwd' });
    expect(completed[0]?.line).toBe('ls');
  });

  it('handles multi-line paste as multiple commands', () => {
    const buf = new CommandLineBuffer();
    const paste = '\x1b[200~ls\npwd\x1b[201~';
    const first = buf.process(paste);
    expect(first.completed.map((c) => c.line)).toEqual(['ls']);

    const second = buf.process('\r');
    expect(second.completed[0]?.line).toBe('pwd');
  });

  it('preserves incomplete escape sequences across chunks', () => {
    const buf = new CommandLineBuffer();
    buf.process('abc');
    buf.process('\x1b[');
    const { completed } = buf.process('D\r');
    expect(completed[0]?.line).toBe('abc');
  });
});
