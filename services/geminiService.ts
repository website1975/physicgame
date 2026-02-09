
import { GoogleGenAI, Type } from "@google/genai";
import { PhysicsProblem } from "../types";

// The API key is obtained directly from process.env.API_KEY per SDK guidelines.
// Removed local getSafeApiKey and getSafeEnv functions to adhere to strict environment variable requirements.

const SYSTEM_PROMPT = `Bạn là chuyên gia soạn đề Vật lý. Nhiệm vụ: Trích xuất văn bản thành JSON mảng đối tượng.
QUY TẮC:
1. TN: 4 options, correctAnswer là 'A', 'B', 'C' hoặc 'D'.
2. DS: 4 options, correctAnswer là chuỗi 4 ký tự 'Đ' hoặc 'S' (VD: 'ĐSĐS').
3. TL: correctAnswer là đáp án ngắn.
4. Lời giải: Dùng $ $ cho công thức LaTeX.
KHÔNG trả về bất kỳ văn bản nào ngoài JSON.`;

const safeParseJSON = (text: string) => {
  try {
    let cleanText = text.trim();
    // Loại bỏ markdown code blocks nếu có
    cleanText = cleanText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("Dữ liệu AI trả về không phải JSON hợp lệ:", text);
    // Thử tìm mảng JSON trong chuỗi nếu AI trả về kèm văn bản giải thích
    const match = text.match(/\[\s*\{.*\}\s*\]/s);
    if (match) return JSON.parse(match[0]);
    throw new Error("Lỗi định dạng dữ liệu từ AI.");
  }
};

export const generateQuestionSet = async (topic: string, count: number): Promise<PhysicsProblem[]> => {
  // Initialize directly with process.env.API_KEY as mandated.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview', 
    contents: `Tạo ${count} câu hỏi chủ đề: ${topic}.`,
    config: {
      // Use systemInstruction for system-level prompting as per guidelines.
      systemInstruction: SYSTEM_PROMPT,
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

  // Directly access .text property from GenerateContentResponse.
  const data = safeParseJSON(response.text || '[]');
  return data.map((item: any) => ({
    ...item,
    id: Math.random().toString(36).substring(7),
    topic
  }));
};

export const parseQuestionsFromText = async (rawText: string): Promise<PhysicsProblem[]> => {
  // Initialize directly with process.env.API_KEY as mandated.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Trích xuất các câu hỏi từ văn bản này sang JSON: "${rawText}".`,
    config: {
      // Use systemInstruction for system-level prompting as per guidelines.
      systemInstruction: SYSTEM_PROMPT,
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

  // Directly access .text property from GenerateContentResponse.
  const data = safeParseJSON(response.text || '[]');
  return data.map((item: any) => ({
    ...item,
    id: Math.random().toString(36).substring(7),
    topic: "Trích xuất AI"
  }));
};
