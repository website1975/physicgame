
import { GoogleGenAI, Type } from "@google/genai";
import { PhysicsProblem, Difficulty, QuestionType, InteractiveMechanic, DisplayChallenge } from "../types";

// Đoạn code bạn yêu cầu để Vercel nhận diện key chính xác
export const getSafeEnv = (key: string): string | undefined => {
  try {
    const fromProcess = (process.env as any)[key] || (process.env as any)[`VITE_${key}`];
    if (fromProcess) return fromProcess;
    const fromMeta = (import.meta as any).env[key] || (import.meta as any).env[`VITE_${key}`];
    if (fromMeta) return fromMeta;
  } catch (e) {}
  return undefined;
};

const getSafeApiKey = (): string => getSafeEnv('API_KEY') || "";

const SYSTEM_PROMPT = `Bạn là chuyên gia soạn đề Vật lý theo chương trình GDPT 2018. 
Nhiệm vụ: Phân tích văn bản thô và trích xuất thành danh sách câu hỏi chuẩn format JSON.

QUY TẮC TRÍCH XUẤT:
1. Loại Trắc nghiệm (type: 'TN'): 
   - 'options' chứa 4 chuỗi A, B, C, D.
   - 'correctAnswer' CHỈ là 1 ký tự: 'A', 'B', 'C' hoặc 'D'.

2. Loại Đúng/Sai (type: 'DS'): 
   - 'options' chứa đúng 4 chuỗi ý a, b, c, d.
   - 'correctAnswer' là chuỗi 4 ký tự 'Đ' hoặc 'S'. Ví dụ: 'ĐSĐS'.

3. Loại Trả lời ngắn (type: 'TL'): 
   - 'correctAnswer' là giá trị số hoặc cụm từ.

4. Lời giải (explanation): BẮT BUỘC có lời giải chi tiết, dùng $ ... $ cho LaTeX.`;

/**
 * Hàm hỗ trợ parse JSON an toàn, loại bỏ các ký tự Markdown nếu AI trả về nhầm
 */
const safeParseJSON = (text: string) => {
  try {
    let cleanText = text.trim();
    if (cleanText.includes('```')) {
      cleanText = cleanText.replace(/```json|```/g, '').trim();
    }
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("Lỗi parse JSON từ AI:", text);
    throw new Error("Định dạng dữ liệu từ AI không hợp lệ.");
  }
};

export const generateQuestionSet = async (topic: string, count: number): Promise<PhysicsProblem[]> => {
  const apiKey = getSafeApiKey();
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Hãy tạo một bộ gồm ${count} câu hỏi đa dạng về chủ đề: ${topic}. 
    ${SYSTEM_PROMPT}
    Trả về JSON mảng đối tượng.`,
    config: {
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 10000 },
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            content: { type: Type.STRING },
            type: { type: Type.STRING, enum: ['TN', 'DS', 'TL'] },
            difficulty: { type: Type.STRING, enum: ['Dễ', 'Trung bình', 'Khó'] },
            challenge: { type: Type.STRING, enum: ['Mặc định', 'Ghi nhớ nhanh', 'Sắp xếp từ', 'Màn sương mờ'] },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctAnswer: { type: Type.STRING },
            explanation: { type: Type.STRING },
            timeLimit: { type: Type.NUMBER },
            mechanic: { type: Type.STRING, enum: ['Pháo xạ kích', 'Nước dâng cao', 'Vũ trụ phiêu lưu', 'Nấm lùn phiêu lưu', 'Lật ô bí mật'] }
          },
          required: ["title", "content", "type", "correctAnswer", "explanation", "difficulty", "challenge"]
        }
      }
    }
  });

  const data = safeParseJSON(response.text || '[]');
  return data.map((item: any) => ({
    ...item,
    id: Math.random().toString(36).substring(7),
    topic
  }));
};

export const parseQuestionsFromText = async (rawText: string): Promise<PhysicsProblem[]> => {
  const apiKey = getSafeApiKey();
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Trích xuất câu hỏi từ văn bản: "${rawText}"
    ${SYSTEM_PROMPT}`,
    config: {
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 15000 },
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            content: { type: Type.STRING },
            type: { type: Type.STRING, enum: ['TN', 'DS', 'TL'] },
            difficulty: { type: Type.STRING, enum: ['Dễ', 'Trung bình', 'Khó'] },
            challenge: { type: Type.STRING, enum: ['Mặc định', 'Ghi nhớ nhanh', 'Sắp xếp từ', 'Màn sương mờ'] },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctAnswer: { type: Type.STRING },
            explanation: { type: Type.STRING },
            timeLimit: { type: Type.NUMBER },
            mechanic: { type: Type.STRING, enum: ['Pháo xạ kích', 'Nước dâng cao', 'Vũ trụ phiêu lưu', 'Nấm lùn phiêu lưu', 'Lật ô bí mật'] }
          },
          required: ["title", "content", "type", "correctAnswer", "explanation", "difficulty", "challenge"]
        }
      }
    }
  });

  const data = safeParseJSON(response.text || '[]');
  return data.map((item: any) => ({
    ...item,
    id: Math.random().toString(36).substring(7),
    topic: "Trích xuất AI"
  }));
};
