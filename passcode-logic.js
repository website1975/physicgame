/**
 * Shared logic for generating and verifying game passcodes.
 * This file can be included in external HTML games.
 */

const PasscodeLogic = {
    /**
     * Generates a passcode in the format LV{level}-{salt}{checksum}
     * @param {number} level - The level achieved in the game
     * @returns {string} The generated passcode
     */
    generate: function(level) {
        // Generate a 4-character random salt
        const salt = Math.random().toString(36).substring(2, 6).toUpperCase();
        
        // Simple checksum logic matching the app's verification
        let checksum = 0;
        for (let i = 0; i < salt.length; i++) {
            checksum += salt.charCodeAt(i);
        }
        
        // Checksum character (A-Z)
        const checkChar = String.fromCharCode(65 + (checksum % 26));
        
        // Format: LV[Level]-[Salt][CheckChar]
        return `LV${level}-${salt}${checkChar}`;
    },

    /**
     * Verifies if a passcode is valid and returns the level
     * @param {string} code - The passcode to verify
     * @returns {{valid: boolean, level: number}}
     */
    verify: function(code) {
        try {
            const cleanCode = code.trim().toUpperCase();
            const parts = cleanCode.split('-');
            
            if (parts.length !== 2) return { valid: false, level: 0 };

            const levelPart = parts[0];
            const securePart = parts[1];

            if (!levelPart.startsWith('LV') || securePart.length < 2) return { valid: false, level: 0 };

            const level = parseInt(levelPart.replace('LV', ''), 10);
            const salt = securePart.slice(0, -1);
            const providedCheckChar = securePart.slice(-1);

            let checksum = 0;
            for (let i = 0; i < salt.length; i++) {
                checksum += salt.charCodeAt(i);
            }
            
            const correctCheckChar = String.fromCharCode(65 + (checksum % 26));

            if (providedCheckChar === correctCheckChar) {
                return { valid: true, level: isNaN(level) ? 0 : level };
            }
            
            return { valid: false, level: 0 };
        } catch (e) {
            return { valid: false, level: 0 };
        }
    }
};

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PasscodeLogic;
} else {
    window.PasscodeLogic = PasscodeLogic;
}
