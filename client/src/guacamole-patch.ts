/**
 * Work around guacamole-common-js v1.5.0 SessionRecording bug:
 * parseBlob(recordingBlob, ...) is called without recordingBlob = source.
 * Route Blob sources through the Tunnel code path instead.
 */

/** Client→server opcodes that must not be replayed into the display client. */
const CLIENT_TO_SERVER_OPCODES = new Set(['mouse', 'key', 'nop', 'get', 'put']);

function imageSourceIsEmpty(image: CanvasImageSource | null | undefined): boolean {
  if (!image) return true;
  if ('width' in image && 'height' in image) {
    return !image.width || !image.height;
  }
  return false;
}

/** Skip drawImage/copy on 0×0 canvases — common during RDP resize in recordings. */
function patchGuacamoleLayer(Guacamole: any): void {
  if (!Guacamole?.Layer || Guacamole._layerDrawImagePatched) return;

  const OriginalLayer = Guacamole.Layer;
  Guacamole.Layer = function Layer(width: number, height: number) {
    OriginalLayer.apply(this, arguments as unknown as [number, number]);

    const origDrawImage = this.drawImage;
    this.drawImage = function drawImageSafe(x: number, y: number, image: CanvasImageSource) {
      if (imageSourceIsEmpty(image)) return;
      origDrawImage.call(this, x, y, image);
    };

    const origCopy = this.copy;
    this.copy = function copySafe(
      srcLayer: any,
      srcx: number,
      srcy: number,
      srcw: number,
      srch: number,
      x: number,
      y: number
    ) {
      const srcCanvas = srcLayer?.getCanvas?.();
      if (!srcCanvas || srcCanvas.width === 0 || srcCanvas.height === 0) return;
      origCopy.call(this, srcLayer, srcx, srcy, srcw, srch, x, y);
    };
  };
  Guacamole.Layer.prototype = OriginalLayer.prototype;
  Guacamole._layerDrawImagePatched = true;
}

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

function feedBlobToTunnel(
  Guacamole: any,
  blob: Blob,
  tunnel: GuacamoleTunnel,
  isAborted: () => boolean
): void {
  const parser = new Guacamole.Parser();
  parser.oninstruction = (opcode: string, args: string[]) => {
    if (CLIENT_TO_SERVER_OPCODES.has(opcode)) return;
    tunnel.oninstruction?.(opcode, args);
  };

  const BLOCK = 262144;
  let offset = 0;
  const reader = new FileReader();

  const finish = (closed: boolean) => {
    if (isAborted()) return;
    if (closed) {
      tunnel.onstatechange?.(Guacamole.Tunnel.State.CLOSED);
    }
  };

  const readNext = () => {
    if (isAborted()) return;

    if (offset >= blob.size) {
      finish(true);
      return;
    }

    const block = blob.slice(offset, offset + BLOCK);
    offset += block.size;

    reader.onload = () => {
      if (isAborted()) return;
      try {
        parser.receive(reader.result as string);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        tunnel.onerror?.({ message });
        finish(true);
        return;
      }
      readNext();
    };

    reader.onerror = () => {
      if (isAborted()) return;
      tunnel.onerror?.({ message: 'Failed to read recording blob' });
      finish(true);
    };

    reader.readAsText(block);
  };

  readNext();
}

export type SessionRecordingHandle = {
  recording: any;
  /** Call after onload/onerror/onprogress handlers are attached. */
  start: () => void;
  abort: () => void;
};

/** Create a SessionRecording from a Blob without the v1.5.0 parseBlob bug. */
export function createSessionRecording(blob: Blob, refreshInterval?: number): SessionRecordingHandle {
  const Guacamole = (window as any).Guacamole;
  const tunnel = createBlobTunnel();
  const recording = new Guacamole.SessionRecording(tunnel, refreshInterval);

  let aborted = false;
  const isAborted = () => aborted;

  const display = recording.getDisplay();
  if (display) {
    display.scale(1);
  }

  const originalAbort = recording.abort?.bind(recording);
  recording.abort = () => {
    aborted = true;
    originalAbort?.();
  };

  return {
    recording,
    start: () => {
      if (!aborted) {
        feedBlobToTunnel(Guacamole, blob, tunnel, isAborted);
      }
    },
    abort: () => recording.abort(),
  };
}

export function applyGuacamolePatch(): void {
  const Guacamole = (window as any).Guacamole;
  if (!Guacamole?.SessionRecording) return;

  patchGuacamoleLayer(Guacamole);

  if (Guacamole._sessionRecordingPatched) return;

  const Original = Guacamole.SessionRecording;

  const Patched = function SessionRecording(
    source: unknown,
    refreshInterval?: number
  ) {
    if (source instanceof Blob) {
      const handle = createSessionRecording(source, refreshInterval);
      queueMicrotask(() => handle.start());
      return handle.recording;
    }
    return new Original(source, refreshInterval);
  };

  Patched._Frame = Original._Frame;
  Patched._PlaybackTunnel = Original._PlaybackTunnel;

  Guacamole.SessionRecording = Patched;
  Guacamole._sessionRecordingPatched = true;
  Guacamole.createSessionRecording = createSessionRecording;
}
