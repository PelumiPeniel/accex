import { useEffect, useRef, useState } from "react";

export default function SignaturePad({ onChange, height = 140 }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = height * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f1e3d";
  }, [height]);

  function pos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  }

  function start(e) {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasInk.current = true;
    setEmpty(false);
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    if (hasInk.current) onChange?.(canvasRef.current.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    setEmpty(true);
    onChange?.(null);
  }

  return (
    <div>
      <div style={{ border: "1.5px dashed var(--border)", borderRadius: "var(--radius-sm)", background: "#fff", position: "relative" }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height, display: "block", cursor: "crosshair", touchAction: "none" }}
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
        {empty && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-500)", fontSize: 13, pointerEvents: "none" }}>
            Sign here
          </div>
        )}
      </div>
      <div className="flex-between mt-8">
        <span className="text-sm muted">Draw your signature above.</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={clear}>Clear</button>
      </div>
    </div>
  );
}
