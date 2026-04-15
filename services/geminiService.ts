
import { GoogleGenAI, Type } from "@google/genai";
import { PhysicsProblem } from "../types";

const SYSTEM_PROMPT = `Bạn là chuyên gia soạn đề Vật lý. Nhiệm vụ: Trích xuất hoặc tạo câu hỏi thành JSON mảng đối tượng.
Mỗi đối tượng câu hỏi PHẢI có các trường sau:
- title: Tiêu đề ngắn gọn (VD: "Câu 1", "Bài tập Động lực học")
- content: Nội dung chi tiết của câu hỏi (Dùng LaTeX $ $ cho công thức)
- type: Loại câu hỏi ('TN' cho Trắc nghiệm, 'DS' cho Đúng/Sai, 'TL' cho Trả lời ngắn)
- difficulty: Độ khó ('Dễ', 'Trung bình', 'Khó')
- options: Mảng 4 chuỗi đáp án (chỉ dành cho 'TN' và 'DS', 'TL' để mảng trống)
- correctAnswer: Đáp án đúng ('A'/'B'/'C'/'D' cho 'TN'; chuỗi 4 ký tự 'Đ'/'S' cho 'DS'; chuỗi văn bản cho 'TL')
- explanation: Lời giải chi tiết (Dùng LaTeX $ $ cho công thức)

QUY TẮC:
1. TN: 4 options, correctAnswer là 'A', 'B', 'C' hoặc 'D'.
2. DS: 4 options (mệnh đề), correctAnswer là chuỗi 4 ký tự 'Đ' hoặc 'S' (VD: 'ĐSĐS').
3. TL: correctAnswer là đáp án ngắn (số hoặc biểu thức đơn giản).
4. Lời giải: Giải thích ngắn gọn, dễ hiểu.
KHÔNG trả về bất kỳ văn bản nào ngoài JSON.`;

const safeParseJSON = (text: string) => {
  try {
    let cleanText = text.trim();
    cleanText = cleanText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("Dữ liệu AI trả về không phải JSON hợp lệ:", text);
    const match = text.match(/\[\s*\{.*\}\s*\]/s);
    if (match) return JSON.parse(match[0]);
    throw new Error("Lỗi định dạng dữ liệu từ AI.");
  }
};

export const generateQuestionSet = async (topic: string, count: number, apiKey?: string): Promise<PhysicsProblem[]> => {
  const key = apiKey || process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!key) throw new Error("Thiếu Gemini API Key.");
  
  const ai = new GoogleGenAI({ apiKey: key });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview', 
    contents: `Tạo ${count} câu hỏi chủ đề: ${topic}.`,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
    }
  });

  const data = safeParseJSON(response.text || '[]');
  return data.map((item: any) => ({
    ...item,
    id: Math.random().toString(36).substring(7),
    content: item.content || item.question || item.text || item.cau_hoi || '',
    title: item.title || item.cau || item.label || `Câu hỏi AI`,
    topic
  }));
};

export const generateMatchByKeywords = async (quantities: string[], formulas: string[], apiKey?: string): Promise<PhysicsProblem[]> => {
  const key = apiKey || process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!key) throw new Error("Thiếu Gemini API Key.");

  const ai = new GoogleGenAI({ apiKey: key });
  const prompt = `Tạo bộ đề ôn tập gồm 5 câu hỏi Vật lý. 
  Yêu cầu sử dụng các đại lượng: ${quantities.join(', ')}. 
  Và áp dụng các công thức liên quan đến: ${formulas.join(', ')}.
  Độ khó: Phân bổ từ Dễ đến Khó. 
  Các câu hỏi phải có tính ứng dụng thực tế.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
    }
  });

  const data = safeParseJSON(response.text || '[]');
  return data.map((item: any) => ({
    ...item,
    id: Math.random().toString(36).substring(7),
    content: item.content || item.question || item.text || item.cau_hoi || '',
    title: item.title || item.cau || item.label || `Câu hỏi AI`,
    topic: "Ôn tập theo từ khóa"
  }));
};

export const parseQuestionsFromText = async (rawText: string, apiKey?: string): Promise<PhysicsProblem[]> => {
  const key = apiKey || process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!key) throw new Error("Thiếu Gemini API Key. Vui lòng nhập key trong phần AI.");

  const ai = new GoogleGenAI({ apiKey: key });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Trích xuất các câu hỏi từ văn bản này sang JSON: "${rawText}".`,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
    }
  });

  const data = safeParseJSON(response.text || '[]');
  return data.map((item: any) => ({
    ...item,
    id: Math.random().toString(36).substring(7),
    content: item.content || item.question || item.text || item.cau_hoi || '',
    title: item.title || item.cau || item.label || `Câu hỏi AI`,
    topic: "Trích xuất AI"
  }));
};
