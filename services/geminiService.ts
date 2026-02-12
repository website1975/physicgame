
import { GoogleGenAI, Type } from "@google/genai";
import { PhysicsProblem } from "../types";

const SYSTEM_PROMPT = `Bạn là chuyên gia soạn đề Vật lý. Nhiệm vụ: Trích xuất văn bản thành JSON mảng đối tượng.
QUY TẮC:
1. TN: 4 options, correctAnswer là 'A', 'B', 'C' hoặc 'D'.
2. DS: 4 options, correctAnswer là chuỗi 4 ký tự 'Đ' hoặc 'S' (VD: 'ĐSĐS').
3. TL: correctAnswer là đáp án ngắn (số hoặc biểu thức đơn giản).
4. Lời giải: Dùng $ $ cho công thức LaTeX. Giải thích ngắn gọn, dễ hiểu.
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

export const generateQuestionSet = async (topic: string, count: number): Promise<PhysicsProblem[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview', 
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
    topic
  }));
};

export const generateMatchByKeywords = async (quantities: string[], formulas: string[]): Promise<PhysicsProblem[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Tạo bộ đề ôn tập gồm 5 câu hỏi Vật lý. 
  Yêu cầu sử dụng các đại lượng: ${quantities.join(', ')}. 
  Và áp dụng các công thức liên quan đến: ${formulas.join(', ')}.
  Độ khó: Phân bổ từ Dễ đến Khó. 
  Các câu hỏi phải có tính ứng dụng thực tế.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
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
    topic: "Ôn tập theo từ khóa"
  }));
};

export const parseQuestionsFromText = async (rawText: string): Promise<PhysicsProblem[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
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
    topic: "Trích xuất AI"
  }));
};
