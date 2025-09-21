/**
 * Rate limiting middleware for Discord bot
 * Prevents abuse and handles high traffic from 2000+ member servers
 */

class RateLimiter {
    constructor() {
        this.userLimits = new Map(); // userId -> { count, resetTime }
        this.globalLimits = new Map(); // action -> { count, resetTime }
        
        // Clean up expired entries every 5 minutes
        setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }

    /**
     * Check if user is rate limited for a specific action
     * @param {string} userId - Discord user ID
     * @param {string} action - Action type (verify, status, submit)
     * @param {object} limits - Rate limit configuration
     * @returns {object} - { allowed: boolean, resetTime?: number, remaining?: number }
     */
    checkUserLimit(userId, action, limits = {}) {
        const key = `${userId}:${action}`;
        const now = Date.now();
        
        // Default limits per action type
        const defaultLimits = {
            verify: { count: 5, windowMs: 60 * 1000 }, // 5 per minute
            submit: { count: 3, windowMs: 5 * 60 * 1000 }, // 3 per 5 minutes
            status: { count: 10, windowMs: 60 * 1000 } // 10 per minute
        };

        const limit = limits[action] || defaultLimits[action] || defaultLimits.verify;
        const userLimit = this.userLimits.get(key);

        if (!userLimit || now > userLimit.resetTime) {
            // Reset or create new limit
            this.userLimits.set(key, {
                count: 1,
                resetTime: now + limit.windowMs
            });
            return { 
                allowed: true, 
                remaining: limit.count - 1,
                resetTime: now + limit.windowMs
            };
        }

        if (userLimit.count >= limit.count) {
            return { 
                allowed: false, 
                resetTime: userLimit.resetTime,
                remaining: 0
            };
        }

        userLimit.count++;
        return { 
            allowed: true, 
            remaining: limit.count - userLimit.count,
            resetTime: userLimit.resetTime
        };
    }

    /**
     * Check global rate limits (e.g., OpenSea API calls)
     * @param {string} action - Global action type
     * @param {object} limits - Rate limit configuration
     * @returns {object} - { allowed: boolean, resetTime?: number }
     */
    checkGlobalLimit(action, limits = {}) {
        const now = Date.now();
        
        const defaultLimits = {
            opensea_request: { count: 100, windowMs: 60 * 1000 }, // 100 per minute
            role_assignment: { count: 50, windowMs: 60 * 1000 } // 50 per minute
        };

        const limit = limits[action] || defaultLimits[action] || defaultLimits.opensea_request;
        const globalLimit = this.globalLimits.get(action);

        if (!globalLimit || now > globalLimit.resetTime) {
            this.globalLimits.set(action, {
                count: 1,
                resetTime: now + limit.windowMs
            });
            return { allowed: true, resetTime: now + limit.windowMs };
        }

        if (globalLimit.count >= limit.count) {
            return { 
                allowed: false, 
                resetTime: globalLimit.resetTime 
            };
        }

        globalLimit.count++;
        return { allowed: true };
    }

    /**
     * Add a penalty for failed attempts
     * @param {string} userId - Discord user ID
     * @param {string} action - Action that failed
     * @param {number} penaltyMs - Penalty duration in milliseconds
     */
    addPenalty(userId, action, penaltyMs = 5 * 60 * 1000) {
        const key = `${userId}:${action}:penalty`;
        const now = Date.now();
        
        this.userLimits.set(key, {
            count: 999, // Effectively blocks
            resetTime: now + penaltyMs
        });
    }

    /**
     * Check if user has an active penalty
     * @param {string} userId - Discord user ID
     * @param {string} action - Action to check
     * @returns {boolean} - True if penalized
     */
    isPenalized(userId, action) {
        const key = `${userId}:${action}:penalty`;
        const penalty = this.userLimits.get(key);
        const now = Date.now();
        
        if (!penalty || now > penalty.resetTime) {
            if (penalty) this.userLimits.delete(key);
            return false;
        }
        
        return true;
    }

    /**
     * Clean up expired rate limit entries
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;

        // Clean user limits
        for (const [key, limit] of this.userLimits.entries()) {
            if (now > limit.resetTime) {
                this.userLimits.delete(key);
                cleaned++;
            }
        }

        // Clean global limits
        for (const [key, limit] of this.globalLimits.entries()) {
            if (now > limit.resetTime) {
                this.globalLimits.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`🧹 Rate limiter cleaned up ${cleaned} expired entries`);
        }
    }

    /**
     * Get current rate limit status for debugging
     * @returns {object} - Current state
     */
    getStatus() {
        return {
            activeUserLimits: this.userLimits.size,
            activeGlobalLimits: this.globalLimits.size,
            memoryUsage: process.memoryUsage()
        };
    }

    /**
     * Format time remaining for user messages
     * @param {number} resetTime - Unix timestamp
     * @returns {string} - Human readable time
     */
    static formatTimeRemaining(resetTime) {
        const remaining = Math.ceil((resetTime - Date.now()) / 1000);
        
        if (remaining < 60) {
            return `${remaining} second${remaining !== 1 ? 's' : ''}`;
        }
        
        const minutes = Math.ceil(remaining / 60);
        return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
}

// Create singleton instance
const rateLimiter = new RateLimiter();

/**
 * Express-style middleware for rate limiting
 * @param {string} action - Action type
 * @param {object} limits - Custom limits
 * @returns {function} - Middleware function
 */
function createRateLimitMiddleware(action, limits = {}) {
    return async (interaction, next) => {
        const userId = interaction.user.id;
        
        // Check for existing penalty
        if (rateLimiter.isPenalized(userId, action)) {
            const embed = {
                color: 0xff0000,
                title: '⏳ Rate Limited',
                description: 'You have been temporarily restricted due to too many failed attempts. Please try again later.',
                timestamp: new Date().toISOString()
            };
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [embed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
            return;
        }

        // Check user rate limit
        const userLimit = rateLimiter.checkUserLimit(userId, action, limits);
        
        if (!userLimit.allowed) {
            const timeRemaining = RateLimiter.formatTimeRemaining(userLimit.resetTime);
            const embed = {
                color: 0xff9900,
                title: '⏱️ Rate Limited',
                description: `You're doing that too often. Please wait ${timeRemaining} before trying again.`,
                fields: [
                    {
                        name: 'Remaining Uses',
                        value: `${userLimit.remaining || 0}`,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [embed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
            return;
        }

        // Add rate limit info to interaction for logging
        interaction.rateLimitInfo = {
            remaining: userLimit.remaining,
            resetTime: userLimit.resetTime
        };

        if (next) await next();
    };
}

module.exports = {
    RateLimiter,
    rateLimiter,
    createRateLimitMiddleware
}; 