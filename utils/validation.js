/**
 * Validation utilities for the Discord wallet verification bot
 */

/**
 * Validates if a string is a valid Ethereum wallet address
 * @param {string} address - The address to validate
 * @returns {boolean} - True if valid Ethereum address
 */
function isValidEthereumAddress(address) {
    if (typeof address !== 'string') return false;
    
    // Check if it starts with 0x and has 40 hexadecimal characters after
    const ethereumRegex = /^0x[a-fA-F0-9]{40}$/;
    return ethereumRegex.test(address);
}

/**
 * Validates if a Discord ID is in the correct format
 * @param {string} id - The Discord ID to validate
 * @returns {boolean} - True if valid Discord ID format
 */
function isValidDiscordId(id) {
    if (typeof id !== 'string') return false;
    
    // Discord IDs are 17-19 digit numbers
    const discordIdRegex = /^\d{17,19}$/;
    return discordIdRegex.test(id);
}

/**
 * Validates if a verification code follows the expected format
 * @param {string} code - The verification code to validate
 * @param {string} prefix - The expected prefix (default: 'Schizo')
 * @returns {boolean} - True if valid verification code format
 */
function isValidVerificationCode(code, prefix = 'Schizo') {
    if (typeof code !== 'string') return false;
    
    // Format: Prefix-ALPHANUMERIC (e.g., Schizo-XYZV45u9483)
    const codeRegex = new RegExp(`^${prefix}-[A-Z0-9]{8,12}$`);
    return codeRegex.test(code);
}

/**
 * Sanitizes user input to prevent potential issues
 * @param {string} input - The input to sanitize
 * @returns {string} - Sanitized input
 */
function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    
    return input
        .trim()
        .replace(/[<>\"']/g, '') // Remove potentially dangerous characters
        .substring(0, 100); // Limit length
}

/**
 * Checks if a URL is a valid OpenSea profile URL
 * @param {string} url - The URL to validate
 * @returns {boolean} - True if valid OpenSea profile URL
 */
function isValidOpenSeaUrl(url) {
    if (typeof url !== 'string') return false;
    
    try {
        const urlObj = new URL(url);
        return urlObj.hostname === 'opensea.io' && 
               urlObj.pathname.match(/^\/0x[a-fA-F0-9]{40}$/);
    } catch {
        return false;
    }
}

/**
 * Validates environment configuration
 * @param {object} config - Configuration object
 * @returns {object} - Validation result with isValid and errors
 */
function validateConfig(config) {
    const errors = [];
    
    if (!config.DISCORD_TOKEN) {
        errors.push('DISCORD_TOKEN is required');
    }
    
    if (!config.CLIENT_ID) {
        errors.push('CLIENT_ID is required');
    } else if (!isValidDiscordId(config.CLIENT_ID)) {
        errors.push('CLIENT_ID must be a valid Discord ID');
    }
    
    if (!config.GUILD_ID) {
        errors.push('GUILD_ID is required');
    } else if (!isValidDiscordId(config.GUILD_ID)) {
        errors.push('GUILD_ID must be a valid Discord ID');
    }
    
    if (!config.VERIFIED_ROLE_ID) {
        errors.push('VERIFIED_ROLE_ID is required');
    } else if (!isValidDiscordId(config.VERIFIED_ROLE_ID)) {
        errors.push('VERIFIED_ROLE_ID must be a valid Discord ID');
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

module.exports = {
    isValidEthereumAddress,
    isValidDiscordId,
    isValidVerificationCode,
    sanitizeInput,
    isValidOpenSeaUrl,
    validateConfig
}; 