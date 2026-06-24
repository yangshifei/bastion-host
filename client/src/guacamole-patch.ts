/**
 * Work around guacamole-common-js v1.5.0 SessionRecording bug:
 * parseBlob(recordingBlob, ...) is called without recordingBlob = source.
 * Route Blob sources through the Tunnel code path instead.
 */

/** Client→server opcodes that must not be replayed into the display client. */
const CLIENT_TO_SERVER_OPCODES = new Set(['mouse', 'key', 'nop', 'get', 'put']);

type GuacamoleTunnel = {
  oninstruction: ((opcode: string, args: string[]) => void) | null;
  onerror: ((status: { message: string }) => void) | null;
  onstatechange: ((state: number) => void) | null;
  connect: (data?: string) => void;
  disconnect: () => void;
  sendMessage: (...args: unknown[]) => void;
};

function createBlobTunnel(): GuacamoleTunnel {
  return {
    oninstruction: null,
    onerror: null,
    onstatechange: null,
    connect: () => {},
    disconnect: () => {},
    sendMessage: () => {},
  };
}

function feedBlobToTunnel(Guacamole: any, blob: Blob, tunnel: GuacamoleTunnel): void {
  const parser = new Guacamole.Parser();
  parser.oninstruction = (opcode: string, args: string[]) => {
    if (CLIENT_TO_SERVER_OPCODES.has(opcode)) return;
    tunnel.oninstruction?.(opcode, args);
  };

  const BLOCK = 262144;
  let offset = 0;
  const reader = new FileReader();

  const readNext = () => {
    if (offset >= blob.size) {
      tunnel.onstatechange?.(Guacamole.Tunnel.State.CLOSED);
      return;
    }

    const block = blob.slice(offset, offset + BLOCK);
    offset += block.size;

    reader.onload = () => {
      try {
        parser.receive(reader.result as string);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        tunnel.onerror?.({ message });
        return;
      }
      readNext();
    };

    reader.onerror = () => {
      tunnel.onerror?.({ message: 'Failed to read recording blob' });
    };

    reader.readAsText(block);
  };

  readNext();
}

export function applyGuacamolePatch(): void {
  const Guacamole = (window as any).Guacamole;
  if (!Guacamole?.SessionRecording || Guacamole._sessionRecordingPatched) return;

  const Original = Guacamole.SessionRecording;

  const Patched = function SessionRecording(
    source: unknown,
    refreshInterval?: number
  ) {
    if (source instanceof Blob) {
      const tunnel = createBlobTunnel();
      const recording = new Original(tunnel, refreshInterval);
      feedBlobToTunnel(Guacamole, source, tunnel);
      return recording;
    }
    return new Original(source, refreshInterval);
  };

  // Original constructor references Guacamole.SessionRecording._PlaybackTunnel / _Frame
  Patched._Frame = Original._Frame;
  Patched._PlaybackTunnel = Original._PlaybackTunnel;

  Guacamole.SessionRecording = Patched;
  Guacamole._sessionRecordingPatched = true;
}
