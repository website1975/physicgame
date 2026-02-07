
import React, { useRef, useEffect, useState } from 'react';

interface WhiteboardProps {
  isTeacher: boolean;
  channel: any;
  roomCode: string;
}

const Whiteboard: React.FC<WhiteboardProps> = ({ isTeacher, channel, roomCode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(3);
  const [showStatus, setShowStatus] = useState(false);
  
  const ASPECT_RATIO = 16 / 9;

  const getCanvasCoords = (e: React.PointerEvent | PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const parentRect = container.getBoundingClientRect();
    if (parentRect.width === 0 || parentRect.height === 0) return;

    let targetWidth = parentRect.width;
    let targetHeight = targetWidth / ASPECT_RATIO;

    if (targetHeight > parentRect.height) {
      targetHeight = parentRect.height;
      targetWidth = targetHeight * ASPECT_RATIO;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) tempCtx.drawImage(canvas, 0, 0);

    canvas.style.width = `${targetWidth}px`;
    canvas.style.height = `${targetHeight}px`;
    canvas.width = 1920; 
    canvas.height = 1080; 
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize * 2;
      contextRef.current = ctx;
      ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
    }
  };

  useEffect(() => {
    resizeCanvas();
    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(resizeCanvas);
    });
    if (containerRef.current) observer.observe(containerRef.current);

    if (!isTeacher && channel) {
      const handleDraw = ({ payload }: any) => drawRemote(payload);
      const handleClear = () => clearLocal();
      channel.on('broadcast', { event: 'draw_stroke' }, handleDraw);
      channel.on('broadcast', { event: 'clear_canvas' }, handleClear);
    }
    return () => observer.disconnect();
  }, [isTeacher, channel]);

  useEffect(() => {
    if (contextRef.current) {
      contextRef.current.strokeStyle = color;
      contextRef.current.lineWidth = brushSize * 2;
    }
  }, [color, brushSize]);

  const drawRemote = (data: any) => {
    const ctx = contextRef.current;
    if (!ctx || !canvasRef.current) return;
    const prevColor = ctx.strokeStyle;
    const prevWidth = ctx.lineWidth;
    ctx.beginPath();
    ctx.strokeStyle = data.color;
    ctx.lineWidth = data.size * 2;
    ctx.moveTo(data.x0 * canvasRef.current.width, data.y0 * canvasRef.current.height);
    ctx.lineTo(data.x1 * canvasRef.current.width, data.y1 * canvasRef.current.height);
    ctx.stroke();
    ctx.strokeStyle = prevColor;
    ctx.lineWidth = prevWidth;
  };

  const clearLocal = () => {
    const ctx = contextRef.current;
    if (!ctx || !canvasRef.current) return;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  };

  const handleClear = () => {
    clearLocal();
    if (isTeacher && channel) channel.send({ type: 'broadcast', event: 'clear_canvas' });
  };

  const lastPos = useRef({ x: 0, y: 0 });
  const startDrawing = (e: React.PointerEvent) => {
    if (!isTeacher) return;
    const coords = getCanvasCoords(e);
    lastPos.current = coords;
    setIsDrawing(true);
  };

  const draw = (e: React.PointerEvent) => {
    if (!isDrawing || !isTeacher || !contextRef.current || !canvasRef.current) return;
    const coords = getCanvasCoords(e);
    const ctx = contextRef.current;
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'draw_stroke',
        payload: {
          x0: lastPos.current.x / canvasRef.current.width,
          y0: lastPos.current.y / canvasRef.current.height,
          x1: coords.x / canvasRef.current.width,
          y1: coords.y / canvasRef.current.height,
          color,
          size: brushSize
        }
      });
    }
    lastPos.current = coords;
  };

  return (
    <div className="relative w-full h-full bg-slate-900 rounded-[2.5rem] overflow-hidden border-4 border-slate-800 shadow-2xl flex flex-col group/whiteboard">
      {/* TOOLBAR */}
      {isTeacher && (
        <div className="z-20 w-full flex flex-wrap items-center justify-between gap-4 bg-slate-800/80 backdrop-blur-md px-6 py-3 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex gap-1.5">
              {['#ffffff', '#ef4444', '#3b82f6', '#fbbf24', '#10b981'].map(c => (
                <button key={c} onClick={() => setColor(c)} className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-40 hover:opacity-100'}`} style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="flex items-center gap-3 ml-4">
               <input type="range" min="1" max="15" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="w-24 accent-blue-500 cursor-pointer" />
               <span className="text-white font-black text-[10px] w-4 opacity-50">{brushSize}</span>
            </div>
          </div>
          <button onClick={handleClear} className="px-5 py-2 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-xl font-black text-[9px] uppercase transition-all border border-red-500/20">Xoá Bảng</button>
        </div>
      )}

      {/* VÙNG VẼ */}
      <div ref={containerRef} className="relative flex-1 bg-slate-950 flex items-center justify-center overflow-hidden">
        <canvas
          ref={canvasRef}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={() => setIsDrawing(false)}
          onPointerOut={() => setIsDrawing(false)}
          className={`bg-slate-900 shadow-2xl touch-none ${isTeacher ? 'cursor-crosshair' : 'cursor-default'}`}
        />
        
        {/* ĐÈN TÍN HIỆU LIVE - TINH GỌN Ở GÓC */}
        <div 
          onMouseEnter={() => setShowStatus(true)}
          onMouseLeave={() => setShowStatus(false)}
          className="absolute top-4 left-4 z-50 flex items-center gap-3 cursor-help pointer-events-auto"
        >
           <div className="relative flex items-center justify-center w-8 h-8">
              <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-20" />
              <div className="relative w-3 h-3 bg-blue-500 rounded-full border-2 border-white shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
           </div>
           
           <div className={`transition-all duration-300 overflow-hidden flex items-center ${showStatus ? 'max-w-xs opacity-100 translate-x-0' : 'max-w-0 opacity-0 -translate-x-4'}`}>
              <div className="bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 shadow-2xl whitespace-nowrap">
                 <span className="text-white text-[10px] font-black uppercase tracking-widest italic">
                    {isTeacher ? 'LIVE BOARD: GIÁO VIÊN' : 'CHẾ ĐỘ: THEO DÕI BÀI GIẢNG'}
                 </span>
              </div>
           </div>
        </div>

        {/* KHUNG VIỀN AN TOÀN SIÊU MẢNH */}
        {isTeacher && (
           <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-30">
              <div className="w-full h-full border border-dashed border-white/10" style={{ aspectRatio: '16/9' }} />
           </div>
        )}
      </div>
    </div>
  );
};

export default Whiteboard;
