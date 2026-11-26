import { useEffect, useRef, type PointerEvent } from "react";

// Sign with a finger or the mouse. Reports a PNG data URL (or null once cleared).
export function SignaturePad({ onChange, clearLabel }: { onChange: (png: string | null) => void; clearLabel: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    const c = canvas.current!;
    // Sharp lines on high-density screens.
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1f1c18";
  }, []);

  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  function down(e: PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = e.currentTarget.getContext("2d")!;
    const [x, y] = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
  }

  function move(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d")!;
    const [x, y] = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    dirty.current = true;
  }

  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    if (dirty.current) onChange(export_());
  }

  // A small copy for storage: 600 px wide is plenty for a signature.
  function export_() {
    const c = canvas.current!;
    const out = document.createElement("canvas");
    out.width = 600;
    out.height = Math.round((600 * c.height) / c.width);
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(c, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  }

  function clear() {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    dirty.current = false;
    onChange(null);
  }

  return (
    <div className="signature">
      <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Signature" />
      <button type="button" className="link" onClick={clear}>
        {clearLabel}
      </button>
    </div>
  );
}
