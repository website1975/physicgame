
import React, { useEffect, useState, useMemo } from 'react';

interface LatexRendererProps {
  content: string;
  className?: string;
}

const LatexRenderer: React.FC<LatexRendererProps> = ({ content, className }) => {
  const [isKatexReady, setIsKatexReady] = useState(!!(window as any).katex);

  // Theo dõi sự sẵn sàng của thư viện KaTeX
  useEffect(() => {
    if (isKatexReady) return;
    
    const interval = setInterval(() => {
      if ((window as any).katex) {
        setIsKatexReady(true);
        clearInterval(interval);
      }
    }, 100);
    
    return () => clearInterval(interval);
  }, [isKatexReady]);

  const renderedHTML = useMemo(() => {
    if (!content) return "";
    const katex = (window as any).katex;
    
    // Nếu chưa có thư viện, trả về văn bản thô (có xử lý xuống dòng)
    if (!katex || !isKatexReady) {
      return content.replace(/\n/g, '<br/>');
    }

    try {
      let processed = content;
      
      // 1. Xử lý công thức Block $$...$$
      processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (match, formula) => {
        try {
          return `<div class="katex-display-wrapper my-2 flex justify-center">${katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false })}</div>`;
        } catch (e) {
          return match;
        }
      });

      // 2. Xử lý công thức Inline $...$
      processed = processed.replace(/\$([\s\S]+?)\$/g, (match, formula) => {
        try {
          return `<span class="katex-inline-wrapper px-0.5">${katex.renderToString(formula.trim(), { displayMode: false, throwOnError: false })}</span>`;
        } catch (e) {
          return match;
        }
      });

      // 3. Xử lý xuống dòng cho phần văn bản còn lại
      // Lưu ý: Chỉ replace \n ở những nơi không nằm trong tag HTML vừa tạo
      // Để đơn giản và an toàn, ta chỉ replace \n bình thường
      return processed.replace(/\n/g, '<br/>');
    } catch (err) {
      console.error("Lỗi render LaTeX:", err);
      return content.replace(/\n/g, '<br/>');
    }
  }, [content, isKatexReady]);

  return (
    <div 
      className={`latex-renderer-container ${className || ''}`}
      dangerouslySetInnerHTML={{ __html: renderedHTML }}
    />
  );
};

export default React.memo(LatexRenderer);
