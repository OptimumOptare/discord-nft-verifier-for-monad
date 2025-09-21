const fs = require('fs');
const path = require('path');

class VerificationDatabase {
    constructor() {
        this.dbPath = path.join(__dirname, 'verified_users.json');
        this.loadDatabase();
    }

    loadDatabase() {
        try {
            if (fs.existsSync(this.dbPath)) {
                const data = fs.readFileSync(this.dbPath, 'utf8');
                this.data = JSON.parse(data);
            } else {
                this.data = {};
            }
        } catch (error) {
            console.error('Error loading verification database:', error);
            this.data = {};
        }
    }

    saveDatabase() {
        try {
            fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving verification database:', error);
        }
    }

    /**
     * Save verification result to database
     * @param {string} userId - Discord user ID
     * @param {string} username - Discord username
     * @param {string} walletAddress - Verified wallet address
     * @param {Object} verificationResult - Full verification result object
     * @param {string} network - Network name (monad_testnet, arbitrum, berachain)
     */
    saveVerification(userId, username, walletAddress, verificationResult, network) {
        // Initialize user entry if doesn't exist
        if (!this.data[userId]) {
            this.data[userId] = {
                userId: userId,
                username: username,
                verifications: {},
                createdAt: new Date().toISOString()
            };
        }

        // Save this network's verification
        this.data[userId].verifications[network] = {
            walletAddress: walletAddress,
            verifiedAt: new Date().toISOString(),
            verificationResult: verificationResult,
            network: network
        };

        // Update username in case it changed
        this.data[userId].username = username;
        this.data[userId].lastUpdated = new Date().toISOString();

        this.saveDatabase();
        
        console.log(`✅ Saved ${network} verification for ${username} (${walletAddress})`);
        return this.data[userId].verifications[network];
    }

    /**
     * Save Monad verification (legacy method for compatibility)
     */
    saveMonadVerification(userId, username, walletAddress, verificationResult) {
        return this.saveVerification(userId, username, walletAddress, verificationResult, 'monad_testnet');
    }

    /**
     * Get verified user data by Discord user ID
     * @param {string} userId - Discord user ID
     * @returns {Object|null} User verification data or null if not found
     */
    getVerifiedUser(userId) {
        return this.data[userId] || null;
    }

    /**
     * Check if user has verified with Monad
     * @param {string} userId - Discord user ID
     * @returns {boolean} True if user has Monad verification
     */
    hasMonadVerification(userId) {
        const user = this.getVerifiedUser(userId);
        return user && user.verifications?.monad_testnet?.verificationResult?.verified;
    }

    /**
     * Check if user has verified on specific network
     * @param {string} userId - Discord user ID
     * @param {string} network - Network name (monad_testnet, arbitrum, berachain)
     * @returns {boolean} True if user has verification on that network
     */
    hasNetworkVerification(userId, network) {
        const user = this.getVerifiedUser(userId);
        return user && user.verifications?.[network]?.verificationResult?.verified;
    }

    /**
     * Get verified wallet address for user (from Monad verification)
     * @param {string} userId - Discord user ID
     * @returns {string|null} Wallet address or null if not found
     */
    getVerifiedWallet(userId) {
        const user = this.getVerifiedUser(userId);
        return user?.verifications?.monad_testnet?.walletAddress || null;
    }

    /**
     * Get wallet address for specific network
     * @param {string} userId - Discord user ID
     * @param {string} network - Network name
     * @returns {string|null} Wallet address or null if not found
     */
    getNetworkWallet(userId, network) {
        const user = this.getVerifiedUser(userId);
        return user?.verifications?.[network]?.walletAddress || null;
    }

    /**
     * Get all user's verifications
     * @param {string} userId - Discord user ID
     * @returns {Object} Object with network verifications
     */
    getUserVerifications(userId) {
        const user = this.getVerifiedUser(userId);
        return user?.verifications || {};
    }

    /**
     * Get all verified users (for admin purposes)
     * @returns {Object} All verification data
     */
    getAllVerifiedUsers() {
        return this.data;
    }

    /**
     * Remove user verification (for testing/reset)
     * @param {string} userId - Discord user ID
     * @returns {boolean} True if removed, false if not found
     */
    removeVerification(userId) {
        if (this.data[userId]) {
            delete this.data[userId];
            this.saveDatabase();
            return true;
        }
        return false;
    }

    /**
     * Get verification statistics
     * @returns {Object} Statistics about verifications
     */
    getStats() {
        const users = Object.values(this.data);
        let monadCount = 0;
        let arbitrumCount = 0;
        let beraCount = 0;
        let lastVerificationTime = 0;

        users.forEach(user => {
            if (user.verifications) {
                if (user.verifications.monad_testnet?.verificationResult?.verified) monadCount++;
                if (user.verifications.arbitrum?.verificationResult?.verified) arbitrumCount++;
                if (user.verifications.berachain?.verificationResult?.verified) beraCount++;
                
                // Find latest verification time
                Object.values(user.verifications).forEach(verification => {
                    const time = new Date(verification.verifiedAt).getTime();
                    if (time > lastVerificationTime) lastVerificationTime = time;
                });
            }
        });

        return {
            totalUsers: users.length,
            monadVerified: monadCount,
            arbitrumVerified: arbitrumCount,
            beraVerified: beraCount,
            lastVerification: lastVerificationTime > 0 ? lastVerificationTime : null
        };
    }
}

module.exports = VerificationDatabase; 