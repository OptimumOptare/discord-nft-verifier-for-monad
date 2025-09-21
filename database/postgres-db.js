const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

class PostgreSQLDatabase {
    constructor() {
        // Database connection configuration
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        // Fallback to JSON for development
        this.useJSON = !process.env.DATABASE_URL && !process.env.POSTGRES_URL;
        
        if (this.useJSON) {
            console.log('📄 Using JSON database (development mode)');
            this.jsonDbPath = path.join(__dirname, 'verified_users.json');
            this.loadJSONDatabase();
        } else {
            console.log('🐘 Using PostgreSQL database (production mode)');
            this.initializeDatabase();
        }
    }

    // Initialize PostgreSQL tables
    async initializeDatabase() {
        try {
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS verified_users (
                    user_id VARCHAR(32) PRIMARY KEY,
                    username VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS user_verifications (
                    id SERIAL PRIMARY KEY,
                    user_id VARCHAR(32) REFERENCES verified_users(user_id) ON DELETE CASCADE,
                    network VARCHAR(50) NOT NULL,
                    wallet_address VARCHAR(100) NOT NULL,
                    verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    verification_result JSONB NOT NULL,
                    UNIQUE(user_id, network)
                )
            `);

            console.log('✅ PostgreSQL database initialized');
        } catch (error) {
            console.error('❌ Error initializing PostgreSQL database:', error);
            // Fallback to JSON if database connection fails
            this.useJSON = true;
            this.loadJSONDatabase();
        }
    }

    // JSON Database methods (fallback)
    loadJSONDatabase() {
        try {
            if (fs.existsSync(this.jsonDbPath)) {
                const data = fs.readFileSync(this.jsonDbPath, 'utf8');
                this.jsonData = JSON.parse(data);
            } else {
                this.jsonData = {};
            }
        } catch (error) {
            console.error('Error loading JSON database:', error);
            this.jsonData = {};
        }
    }

    saveJSONDatabase() {
        try {
            fs.writeFileSync(this.jsonDbPath, JSON.stringify(this.jsonData, null, 2));
        } catch (error) {
            console.error('Error saving JSON database:', error);
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
    async saveVerification(userId, username, walletAddress, verificationResult, network) {
        if (this.useJSON) {
            return this.saveVerificationJSON(userId, username, walletAddress, verificationResult, network);
        }

        try {
            // Upsert user
            await this.pool.query(`
                INSERT INTO verified_users (user_id, username, last_updated)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id) 
                DO UPDATE SET username = $2, last_updated = CURRENT_TIMESTAMP
            `, [userId, username]);

            // Upsert verification
            await this.pool.query(`
                INSERT INTO user_verifications (user_id, network, wallet_address, verification_result)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (user_id, network)
                DO UPDATE SET 
                    wallet_address = $3,
                    verification_result = $4,
                    verified_at = CURRENT_TIMESTAMP
            `, [userId, network, walletAddress, JSON.stringify(verificationResult)]);

            console.log(`✅ Saved ${network} verification for ${username} (${walletAddress})`);
            return { walletAddress, verifiedAt: new Date().toISOString(), verificationResult, network };
        } catch (error) {
            console.error('Error saving verification to PostgreSQL:', error);
            // Fallback to JSON
            return this.saveVerificationJSON(userId, username, walletAddress, verificationResult, network);
        }
    }

    saveVerificationJSON(userId, username, walletAddress, verificationResult, network) {
        // Initialize user entry if doesn't exist
        if (!this.jsonData[userId]) {
            this.jsonData[userId] = {
                userId: userId,
                username: username,
                verifications: {},
                createdAt: new Date().toISOString()
            };
        }

        // Save this network's verification
        this.jsonData[userId].verifications[network] = {
            walletAddress: walletAddress,
            verifiedAt: new Date().toISOString(),
            verificationResult: verificationResult,
            network: network
        };

        // Update username in case it changed
        this.jsonData[userId].username = username;
        this.jsonData[userId].lastUpdated = new Date().toISOString();

        this.saveJSONDatabase();
        
        console.log(`✅ Saved ${network} verification for ${username} (${walletAddress})`);
        return this.jsonData[userId].verifications[network];
    }

    /**
     * Save Monad verification (legacy method for compatibility)
     */
    async saveMonadVerification(userId, username, walletAddress, verificationResult) {
        return this.saveVerification(userId, username, walletAddress, verificationResult, 'monad_testnet');
    }

    /**
     * Get verified user data by Discord user ID
     * @param {string} userId - Discord user ID
     * @returns {Object|null} User verification data or null if not found
     */
    async getVerifiedUser(userId) {
        if (this.useJSON) {
            return this.jsonData[userId] || null;
        }

        try {
            const userResult = await this.pool.query(
                'SELECT * FROM verified_users WHERE user_id = $1',
                [userId]
            );

            if (userResult.rows.length === 0) return null;

            const verificationsResult = await this.pool.query(
                'SELECT * FROM user_verifications WHERE user_id = $1',
                [userId]
            );

            const user = userResult.rows[0];
            const verifications = {};

            verificationsResult.rows.forEach(row => {
                verifications[row.network] = {
                    walletAddress: row.wallet_address,
                    verifiedAt: row.verified_at.toISOString(),
                    verificationResult: row.verification_result,
                    network: row.network
                };
            });

            return {
                userId: user.user_id,
                username: user.username,
                verifications: verifications,
                createdAt: user.created_at.toISOString(),
                lastUpdated: user.last_updated.toISOString()
            };
        } catch (error) {
            console.error('Error getting verified user from PostgreSQL:', error);
            return null;
        }
    }

    /**
     * Check if user has verified with Monad
     * @param {string} userId - Discord user ID
     * @returns {boolean} True if user has Monad verification
     */
    async hasMonadVerification(userId) {
        const user = await this.getVerifiedUser(userId);
        return user && user.verifications?.monad_testnet?.verificationResult?.verified;
    }

    /**
     * Check if user has verified on specific network
     * @param {string} userId - Discord user ID
     * @param {string} network - Network name (monad_testnet, arbitrum, berachain)
     * @returns {boolean} True if user has verification on that network
     */
    async hasNetworkVerification(userId, network) {
        const user = await this.getVerifiedUser(userId);
        return user && user.verifications?.[network]?.verificationResult?.verified;
    }

    /**
     * Get verified wallet address for user (from Monad verification)
     * @param {string} userId - Discord user ID
     * @returns {string|null} Wallet address or null if not found
     */
    async getVerifiedWallet(userId) {
        const user = await this.getVerifiedUser(userId);
        return user?.verifications?.monad_testnet?.walletAddress || null;
    }

    /**
     * Get wallet address for specific network
     * @param {string} userId - Discord user ID
     * @param {string} network - Network name
     * @returns {string|null} Wallet address or null if not found
     */
    async getNetworkWallet(userId, network) {
        const user = await this.getVerifiedUser(userId);
        return user?.verifications?.[network]?.walletAddress || null;
    }

    /**
     * Get all user's verifications
     * @param {string} userId - Discord user ID
     * @returns {Object} Object with network verifications
     */
    async getUserVerifications(userId) {
        const user = await this.getVerifiedUser(userId);
        return user?.verifications || {};
    }

    /**
     * Get all verified users (for admin purposes)
     * @returns {Object} All verification data
     */
    async getAllVerifiedUsers() {
        if (this.useJSON) {
            return this.jsonData;
        }

        try {
            const users = await this.pool.query('SELECT user_id FROM verified_users');
            const allUsers = {};

            for (const userRow of users.rows) {
                const userData = await this.getVerifiedUser(userRow.user_id);
                if (userData) {
                    allUsers[userRow.user_id] = userData;
                }
            }

            return allUsers;
        } catch (error) {
            console.error('Error getting all verified users from PostgreSQL:', error);
            return {};
        }
    }

    /**
     * Remove user verification (for testing/reset)
     * @param {string} userId - Discord user ID
     * @returns {boolean} True if removed, false if not found
     */
    async removeVerification(userId) {
        if (this.useJSON) {
            if (this.jsonData[userId]) {
                delete this.jsonData[userId];
                this.saveJSONDatabase();
                return true;
            }
            return false;
        }

        try {
            const result = await this.pool.query(
                'DELETE FROM verified_users WHERE user_id = $1',
                [userId]
            );
            return result.rowCount > 0;
        } catch (error) {
            console.error('Error removing verification from PostgreSQL:', error);
            return false;
        }
    }

    /**
     * Get verification statistics
     * @returns {Object} Statistics about verifications
     */
    async getStats() {
        if (this.useJSON) {
            return this.getStatsJSON();
        }

        try {
            const totalUsersResult = await this.pool.query('SELECT COUNT(*) FROM verified_users');
            const totalUsers = parseInt(totalUsersResult.rows[0].count);

            const monadResult = await this.pool.query(`
                SELECT COUNT(*) FROM user_verifications 
                WHERE network = 'monad_testnet' AND verification_result->>'verified' = 'true'
            `);
            const monadCount = parseInt(monadResult.rows[0].count);

            const arbitrumResult = await this.pool.query(`
                SELECT COUNT(*) FROM user_verifications 
                WHERE network = 'arbitrum' AND verification_result->>'verified' = 'true'
            `);
            const arbitrumCount = parseInt(arbitrumResult.rows[0].count);

            const beraResult = await this.pool.query(`
                SELECT COUNT(*) FROM user_verifications 
                WHERE network = 'berachain' AND verification_result->>'verified' = 'true'
            `);
            const beraCount = parseInt(beraResult.rows[0].count);

            const lastVerificationResult = await this.pool.query(`
                SELECT MAX(verified_at) as last_verification FROM user_verifications
            `);
            const lastVerification = lastVerificationResult.rows[0].last_verification;

            return {
                totalUsers: totalUsers,
                monadVerified: monadCount,
                arbitrumVerified: arbitrumCount,
                beraVerified: beraCount,
                lastVerification: lastVerification ? new Date(lastVerification).getTime() : null
            };
        } catch (error) {
            console.error('Error getting stats from PostgreSQL:', error);
            return this.getStatsJSON();
        }
    }

    getStatsJSON() {
        const users = Object.values(this.jsonData);
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

    // Health check method
    async healthCheck() {
        if (this.useJSON) {
            return { status: 'ok', database: 'json' };
        }

        try {
            await this.pool.query('SELECT 1');
            return { status: 'ok', database: 'postgresql' };
        } catch (error) {
            return { status: 'error', database: 'postgresql', error: error.message };
        }
    }

    // Graceful shutdown
    async close() {
        if (!this.useJSON && this.pool) {
            await this.pool.end();
        }
    }
}

module.exports = PostgreSQLDatabase; 