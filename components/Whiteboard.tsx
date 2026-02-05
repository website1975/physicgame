
import React, { useRef, useEffect, useState, useCallback } from 'react';

interface WhiteboardProps {
  isTeacher: boolean;
  channel: any;
  roomCode: string;
}

const Whiteboard: React.FC<WhiteboardProps> = ({ isTeacher, channel, roomCode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(3);

  // Hiệu ứng 1: Chỉ chạy khi mount hoặc resize cửa sổ (Tránh xóa canvas khi đổi màu)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      
      // Lưu nội dung cũ trước khi resize nếu cần (tùy chọn)
      // Trong trường hợp này, ta ưu tiên việc không resize liên tục
      const rect = parent.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          contextRef.current = ctx;
        }
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Lắng nghe lệnh vẽ từ GV (dành cho HS)
    if (!isTeacher && channel) {
      channel.on('broadcast', { event: 'draw_stroke' }, ({ payload }: any) => {
        drawRemote(payload);
      }).on('broadcast', { event: 'clear_canvas' }, () => {
        clearLocal();
      });
    }

    return () => window.removeEventListener('resize', resizeCanvas);
  }, [isTeacher, channel]);

  // Cập nhật thuộc tính ngữ cảnh vẽ khi màu hoặc kích thước thay đổi mà KHÔNG resize canvas
  useEffect(() => {
    if (contextRef.current) {
      contextRef.current.strokeStyle = color;
      contextRef.current.lineWidth = brushSize;
    }
  }, [color, brushSize]);

  const drawRemote = (data: any) => {
    const ctx = contextRef.current;
    if (!ctx || !canvasRef.current) return;
    
    // Lưu trạng thái hiện tại
    const prevColor = ctx.strokeStyle;
    const prevWidth = ctx.lineWidth;

    ctx.beginPath();
    ctx.strokeStyle = data.color;
    ctx.lineWidth = data.size;
    ctx.moveTo(data.x0 * canvasRef.current.width, data.y0 * canvasRef.current.height);
    ctx.lineTo(data.x1 * canvasRef.current.width, data.y1 * canvasRef.current.height);
    ctx.stroke();
    ctx.closePath();

    // Khôi phục trạng thái cho GV vẽ tiếp
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
    if (isTeacher && channel) {
      channel.send({ type: 'broadcast', event: 'clear_canvas' });
    }
  };

  const lastPos = useRef({ x: 0, y: 0 });

  const startDrawing = (e: React.PointerEvent) => {
    if (!isTeacher || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    lastPos.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setIsDrawing(true);
  };

  const draw = (e: React.PointerEvent) => {
    if (!isDrawing || !isTeacher || !contextRef.current || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ctx = contextRef.current;
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.closePath();

    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'draw_stroke',
        payload: {
          x0: lastPos.current.x / canvasRef.current.width,
          y0: lastPos.current.y / canvasRef.current.height,
          x1: x / canvasRef.current.width,
          y1: y / canvasRef.current.height,
          color,
          size: brushSize
        }
      });
    }

    lastPos.current = { x, y };
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  return (
    <div className="relative w-full h-full bg-slate-900 rounded-[3rem] overflow-hidden border-8 border-slate-800 shadow-2xl">
      <canvas
        ref={canvasRef}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerOut={stopDrawing}
        className={`w-full h-full touch-none ${isTeacher ? 'cursor-crosshair' : 'cursor-default'}`}
      />
      
      <div className="absolute top-6 left-6 pointer-events-none">
        <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10">
          <span className="text-white/50 text-[10px] font-black uppercase tracking-widest">
            {isTeacher ? 'Chế độ: Bảng vẽ giáo viên' : 'Chế độ: Đang theo dõi bài giảng'}
          </span>
        </div>
      </div>

      {isTeacher && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-slate-800/80 backdrop-blur-xl p-4 rounded-[2rem] border-2 border-white/10 shadow-2xl">
          <div className="flex gap-2">
            {['#ffffff', '#ef4444', '#3b82f6', '#fbbf24', '#10b981'].map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-10 h-10 rounded-full border-4 transition-all ${color === c ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-50 hover:opacity-100'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="h-8 w-px bg-white/10 mx-2" />
          <div className="flex items-center gap-3">
             <input 
              type="range" min="1" max="15" 
              value={brushSize} 
              onChange={(e) => setBrushSize(parseInt(e.target.value))}
              className="w-24 accent-blue-500 cursor-pointer"
             />
             <span className="text-white font-black text-xs w-4">{brushSize}</span>
          </div>
          <button 
            onClick={handleClear}
            className="ml-4 px-6 py-2 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-xl font-black text-[10px] uppercase transition-all"
          >
            Xoá bảng
          </button>
        </div>
      )}
    </div>
  );
};

export default Whiteboard;
