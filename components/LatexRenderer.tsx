
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
      // Tách nội dung thành các phần: text, inline math ($...$), block math ($$...$$)
      // Sử dụng regex để tìm tất cả các công thức toán học
      const parts: { type: 'text' | 'math', content: string, displayMode?: boolean }[] = [];
      let lastIndex = 0;
      
      // Regex tìm cả $$...$$ và $...$
      // Chú ý: Tìm $$...$$ trước để tránh bị $...$ bắt nhầm
      const mathRegex = /(\$\$[\s\S]+?\$\$|\$[\s\S]+?\$)/g;
      let match;
      
      while ((match = mathRegex.exec(content)) !== null) {
        // Thêm phần văn bản trước công thức
        if (match.index > lastIndex) {
          parts.push({ type: 'text', content: content.substring(lastIndex, match.index) });
        }
        
        const rawMath = match[0];
        if (rawMath.startsWith('$$')) {
          parts.push({ 
            type: 'math', 
            content: rawMath.substring(2, rawMath.length - 2).trim(), 
            displayMode: true 
          });
        } else {
          parts.push({ 
            type: 'math', 
            content: rawMath.substring(1, rawMath.length - 1).trim(), 
            displayMode: false 
          });
        }
        
        lastIndex = mathRegex.lastIndex;
      }
      
      // Thêm phần văn bản còn lại sau công thức cuối cùng
      if (lastIndex < content.length) {
        parts.push({ type: 'text', content: content.substring(lastIndex) });
      }

      // Render từng phần
      return parts.map(part => {
        if (part.type === 'math') {
          try {
            const rendered = katex.renderToString(part.content, {
              displayMode: part.displayMode,
              throwOnError: false,
              trust: true,
              strict: false
            });
            
            if (part.displayMode) {
              return `<div class="katex-display-wrapper my-2 flex justify-center overflow-x-auto no-scrollbar">${rendered}</div>`;
            } else {
              return `<span class="katex-inline-wrapper px-0.5">${rendered}</span>`;
            }
          } catch (e) {
            console.error("KaTeX render error for:", part.content, e);
            return part.displayMode ? `$$${part.content}$$` : `$${part.content}$`;
          }
        } else {
          // Chỉ replace \n bằng <br/> cho phần văn bản thuần túy
          return part.content.replace(/\n/g, '<br/>');
        }
      }).join('');

    } catch (err) {
      console.error("Lỗi render LaTeX tổng quát:", err);
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
