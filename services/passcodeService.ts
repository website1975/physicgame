
export function verifyPasscode(inputCode: string) {
  try {
    // Chuẩn hóa input: bỏ khoảng trắng và chuyển sang in hoa
    const code = inputCode.trim().toUpperCase();
    const parts = code.split('-');
    
    if (parts.length !== 2) return { valid: false };

    const levelPart = parts[0]; // "LV1"
    const securePart = parts[1]; // "UIV8O" (hoặc UIV80)

    if (!levelPart.startsWith('LV') || securePart.length < 2) return { valid: false };

    const levelStr = levelPart.replace('LV', '');
    const level = parseInt(levelStr, 10);
    const salt = securePart.slice(0, -1);
    const providedCheckChar = securePart.slice(-1);

    // Thuật toán Checksum giống hệt trong Game
    let checksum = 0;
    for (let i = 0; i < salt.length; i++) {
        checksum += salt.charCodeAt(i);
    }
    
    const correctCheckChar = String.fromCharCode(65 + (checksum % 26));

    if (providedCheckChar === correctCheckChar) {
        return { valid: true, level: isNaN(level) ? 0 : level };
    }
    
    return { valid: false };
  } catch (e) {
    return { valid: false };
  }
}

export function calculatePointsForLevel(level: number): number {
  if (level <= 1) return 20;
  if (level === 2) return 40;
  if (level === 3) return 60;
  if (level === 4) return 80;
  return 100; // LV5 trở lên
}
