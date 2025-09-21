const http = require('http');

class HealthServer {
    constructor(port = process.env.PORT || 3000) {
        this.port = port;
        this.server = null;
        this.isReady = false;
        this.verificationDB = null;
    }

    setDatabase(verificationDB) {
        this.verificationDB = verificationDB;
    }

    setReady(ready = true) {
        this.isReady = ready;
    }

    start() {
        this.server = http.createServer(async (req, res) => {
            // Set CORS headers
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }

            if (req.url === '/health' || req.url === '/') {
                try {
                    const health = {
                        status: this.isReady ? 'ok' : 'starting',
                        timestamp: new Date().toISOString(),
                        uptime: process.uptime(),
                        memory: process.memoryUsage(),
                        bot: {
                            ready: this.isReady,
                            pid: process.pid,
                            nodeVersion: process.version
                        }
                    };

                    // Add database health if available
                    if (this.verificationDB) {
                        try {
                            const dbHealth = await this.verificationDB.healthCheck();
                            health.database = dbHealth;
                        } catch (error) {
                            health.database = { status: 'error', error: error.message };
                        }
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(health, null, 2));
                } catch (error) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        status: 'error', 
                        error: error.message,
                        timestamp: new Date().toISOString()
                    }));
                }
            } else if (req.url === '/stats' && this.verificationDB) {
                try {
                    const stats = await this.verificationDB.getStats();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        status: 'ok',
                        stats: stats,
                        timestamp: new Date().toISOString()
                    }, null, 2));
                } catch (error) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        status: 'error',
                        error: error.message,
                        timestamp: new Date().toISOString()
                    }));
                }
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'not_found',
                    message: 'Available endpoints: /health, /stats',
                    timestamp: new Date().toISOString()
                }));
            }
        });

        this.server.listen(this.port, '0.0.0.0', () => {
            console.log(`🩺 Health server running on http://0.0.0.0:${this.port}`);
            console.log(`   📊 Health check: http://0.0.0.0:${this.port}/health`);
            console.log(`   📈 Stats: http://0.0.0.0:${this.port}/stats`);
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('🛑 SIGTERM received, shutting down health server...');
            if (this.server) {
                this.server.close(() => {
                    console.log('✅ Health server shut down');
                });
            }
        });

        process.on('SIGINT', () => {
            console.log('🛑 SIGINT received, shutting down health server...');
            if (this.server) {
                this.server.close(() => {
                    console.log('✅ Health server shut down');
                    process.exit(0);
                });
            }
        });
    }

    stop() {
        if (this.server) {
            this.server.close();
        }
    }
}

module.exports = HealthServer; 