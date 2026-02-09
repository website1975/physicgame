
import { GoogleGenAI, Type } from "@google/genai";
import { PhysicsProblem, Difficulty, QuestionType, InteractiveMechanic, DisplayChallenge } from "../types";

// Helper logic for cross-environment variable support (Vercel/Vite/Browser)
const getSafeApiKey = (): string => {
  try {
    const key = process.env.API_KEY || (process.env as any).VITE_API_KEY;
    if (key) return key;
    
    // Check import.meta for Vite-based environments if process.env fails
    const metaEnv = (import.meta as any).env;
    if (metaEnv) {
      return metaEnv.VITE_API_KEY || metaEnv.API_KEY;
    }
  } catch (e) {}
  return "";
};

const SYSTEM_PROMPT = `Bạn là chuyên gia soạn đề Vật lý theo chương trình GDPT 2018. 
Nhiệm vụ: Phân tích văn bản thô và trích xuất thành danh sách câu hỏi chuẩn format.

QUY TẮC TRÍCH XUẤT:
1. Loại Trắc nghiệm (type: 'TN'): 
   - Nhận diện câu hỏi có 4 lựa chọn A, B, C, D.
   - 'options' phải chứa 4 chuỗi văn bản tương ứng A, B, C, D (không kèm chữ cái đầu).
   - 'correctAnswer' CHỈ là 1 ký tự: 'A', 'B', 'C' hoặc 'D'.

2. Loại Đúng/Sai (type: 'DS'): 
   - Nhận diện câu hỏi có 4 ý mệnh đề a), b), c), d).
   - 'options' phải chứa đúng 4 chuỗi văn bản của 4 ý a, b, c, d.
   - 'correctAnswer' PHẢI là chuỗi 4 ký tự 'Đ' hoặc 'S'. Ví dụ: 'ĐSĐS'. 
   - Nếu văn bản không ghi rõ Đúng/Sai, hãy dùng kiến thức Vật lý để xác định đáp án chính xác.

3. Loại Trả lời ngắn (type: 'TL'): 
   - Trích xuất nội dung câu hỏi yêu cầu tính toán số hoặc điền từ.
   - 'correctAnswer' là giá trị số hoặc cụm từ đáp án.

4. Lời giải chi tiết (explanation): 
   - BẮT BUỘC trích xuất hoặc tự soạn lời giải chi tiết cho từng bước giải. 
   - Sử dụng ký hiệu $ ... $ cho công thức LaTeX.

5. Hình ảnh: Nếu câu hỏi có nhắc đến "Hình vẽ", "Đồ thị", hãy ghi chú vào 'content'.`;

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
    topic
  }));
};

export const parseQuestionsFromText = async (rawText: string): Promise<PhysicsProblem[]> => {
  const apiKey = getSafeApiKey();
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Yêu cầu: Trích xuất chính xác các câu hỏi từ văn bản sau, phân loại rõ TN (A,B,C,D), DS (a,b,c,d) và TL.
    Văn bản: "${rawText}"
    
    ${SYSTEM_PROMPT}`,
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
    topic: "Trích xuất AI"
  }));
};
