
import { GoogleGenAI, Type } from "@google/genai";
import { PhysicsProblem, Difficulty, QuestionType, InteractiveMechanic, DisplayChallenge } from "../types";

const SYSTEM_PROMPT = `Bạn là chuyên gia soạn đề Vật lý theo chương trình GDPT 2018. 
Quy tắc định dạng đáp án (correctAnswer) BẮT BUỘC:
1. Loại Trắc nghiệm (type: 'TN'): correctAnswer chỉ là 1 ký tự viết hoa 'A', 'B', 'C' hoặc 'D'.
2. Loại Đúng/Sai (type: 'DS'): correctAnswer PHẢI là chuỗi đúng 4 ký tự viết tắt của Đúng (Đ) và Sai (S). Ví dụ: 'ĐSĐĐ', 'SSSS', 'ĐĐSS'. Tuyệt đối không viết thêm chữ hay ký tự khác.
3. Loại Trả lời ngắn (type: 'TL'): correctAnswer là số hoặc cụm từ ngắn gọn.`;

export const generateQuestionSet = async (topic: string, count: number): Promise<PhysicsProblem[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Hãy tạo một bộ gồm ${count} câu hỏi đa dạng về chủ đề: ${topic}. 
    ${SYSTEM_PROMPT}
    Đối với 'TL', gán ngẫu nhiên một 'mechanic'. Gán 'challenge' ngẫu nhiên.
    Yêu cầu trả về JSON mảng đối tượng.`,
    config: {
      responseMimeType: "application/json",
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
            options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Nếu là DS, mảng này chứa đúng 4 phát biểu cho các ý a, b, c, d" },
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

  const data = JSON.parse(response.text || '[]');
  return data.map((item: any) => ({
    ...item,
    id: Math.random().toString(36).substring(7),
    topic
  }));
};

export const parseQuestionsFromText = async (rawText: string): Promise<PhysicsProblem[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Phân tích văn bản và trích xuất câu hỏi: "${rawText}".
    ${SYSTEM_PROMPT}
    Trả về mảng JSON chuẩn.`,
    config: {
      responseMimeType: "application/json",
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

  const data = JSON.parse(response.text || '[]');
  return data.map((item: any) => ({
    ...item,
    id: Math.random().toString(36).substring(7),
    topic: "Nhập từ văn bản"
  }));
};
