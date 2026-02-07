
import React, { useRef, useEffect, useState, useCallback } from 'react';

interface WhiteboardProps {
  isTeacher: boolean;
  channel: any;
  roomCode: string;
}

// Helper functions for audio encoding/decoding (Standard PCM 16kHz)
function encodeAudio(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decodeAudio(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const Whiteboard: React.FC<WhiteboardProps> = ({ isTeacher, channel, roomCode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(3);
  const [showStatus, setShowStatus] = useState(false);
  
  // Audio states
  const [isMicOn, setIsMicOn] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const ASPECT_RATIO = 16 / 9;

  // --- AUDIO LOGIC ---

  // Initialize Audio for Student (Receiver)
  useEffect(() => {
    if (!isTeacher) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    return () => {
      audioContextRef.current?.close();
    };
  }, [isTeacher]);

  const startVoiceBroadcast = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const source = audioCtx.createMediaStreamSource(stream);
      const scriptProcessor = audioCtx.createScriptProcessor(4096, 1, 1);
      
      scriptProcessor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const l = inputData.length;
        const int16 = new Int16Array(l);
        for (let i = 0; i < l; i++) {
          int16[i] = inputData[i] * 32768;
        }
        const base64Audio = encodeAudio(new Uint8Array(int16.buffer));
        
        if (channel) {
          channel.send({
            type: 'broadcast',
            event: 'voice_stream',
            payload: { data: base64Audio }
          });
        }
      };

      source.connect(scriptProcessor);
      scriptProcessor.connect(audioCtx.destination);
      processorRef.current = scriptProcessor;
      setIsMicOn(true);
    } catch (err) {
      console.error("Không thể truy cập Microphone:", err);
      alert("Vui lòng cấp quyền Microphone để giảng bài!");
    }
  };

  const stopVoiceBroadcast = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    processorRef.current?.disconnect();
    setIsMicOn(false);
  };

  const handleVoiceData = useCallback(async (payload: any) => {
    if (isTeacher || !audioContextRef.current) return;
    
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') await ctx.resume();

    const audioBuffer = await decodeAudioData(
      decodeAudio(payload.data),
      ctx,
      16000,
      1
    );

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    
    const currentTime = ctx.currentTime;
    if (nextStartTimeRef.current < currentTime) {
      nextStartTimeRef.current = currentTime;
    }
    
    source.start(nextStartTimeRef.current);
    nextStartTimeRef.current += audioBuffer.duration;
  }, [isTeacher]);

  // --- DRAWING LOGIC ---

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

    if (channel) {
      const handleDraw = ({ payload }: any) => drawRemote(payload);
      const handleClear = () => clearLocal();
      const handleVoice = ({ payload }: any) => handleVoiceData(payload);

      channel.on('broadcast', { event: 'draw_stroke' }, handleDraw);
      channel.on('broadcast', { event: 'clear_canvas' }, handleClear);
      channel.on('broadcast', { event: 'voice_stream' }, handleVoice);
    }
    return () => observer.disconnect();
  }, [channel, handleVoiceData]);

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
          
          <div className="flex items-center gap-3">
             <button 
                onClick={isMicOn ? stopVoiceBroadcast : startVoiceBroadcast} 
                className={`flex items-center gap-2 px-5 py-2 rounded-xl font-black text-[9px] uppercase transition-all border ${isMicOn ? 'bg-emerald-600 text-white border-emerald-500 animate-pulse' : 'bg-slate-700 text-slate-300 border-white/10 hover:bg-slate-600'}`}
             >
                <span className="text-sm">{isMicOn ? '🎤 Mic Đang Bật' : '🎙️ Bật Mic Giảng Bài'}</span>
             </button>
             <button onClick={handleClear} className="px-5 py-2 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-xl font-black text-[9px] uppercase transition-all border border-red-500/20">Xoá Bảng</button>
          </div>
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
              <div className={`absolute inset-0 rounded-full animate-ping opacity-20 ${isMicOn ? 'bg-emerald-500' : 'bg-blue-500'}`} />
              <div className={`relative w-3 h-3 rounded-full border-2 border-white shadow-lg ${isMicOn ? 'bg-emerald-500 shadow-emerald-500/50' : 'bg-blue-500 shadow-blue-500/50'}`} />
           </div>
           
           <div className={`transition-all duration-300 overflow-hidden flex items-center ${showStatus || isMicOn ? 'max-w-xs opacity-100 translate-x-0' : 'max-w-0 opacity-0 -translate-x-4'}`}>
              <div className="bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 shadow-2xl whitespace-nowrap">
                 <span className="text-white text-[10px] font-black uppercase tracking-widest italic">
                    {isTeacher ? (isMicOn ? 'ĐANG PHÁT GIỌNG NÓI TRỰC TIẾP...' : 'LIVE BOARD: GIÁO VIÊN') : 'CHẾ ĐỘ: THEO DÕI BÀI GIẢNG & VOICE'}
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
