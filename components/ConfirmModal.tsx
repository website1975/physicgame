
import React from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "Xác nhận",
  cancelText = "Hủy",
  isDestructive = false
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onCancel}></div>
      <div className="bg-white rounded-[3rem] p-10 shadow-2xl max-w-md w-full relative z-10 border-4 border-slate-100 animate-in zoom-in duration-200">
        <div className="text-4xl mb-6 text-center">
          {isDestructive ? '⚠️' : '❓'}
        </div>
        <h3 className="text-2xl font-black text-slate-800 uppercase italic mb-4 text-center leading-tight">
          {title}
        </h3>
        <p className="text-slate-500 font-bold text-center mb-10 leading-relaxed">
          {message}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={onCancel}
            className="py-4 bg-slate-100 text-slate-500 font-black rounded-2xl uppercase italic hover:bg-slate-200 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`py-4 text-white font-black rounded-2xl uppercase italic shadow-lg transition-all active:scale-95 ${
              isDestructive ? 'bg-red-600 hover:bg-red-500 shadow-red-500/20' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
