const axios = require('axios');

// Simple Berachain NFT Verifier
class BeraVerifier {
    constructor() {
        this.apiKey = process.env.ALCHEMY_API_KEY === 'your_alchemy_api_key_here' || !process.env.ALCHEMY_API_KEY 
            ? 'oZOAGENSu4JJteMg2gTut' 
            : process.env.ALCHEMY_API_KEY;
        this.baseUrl = `https://berachain-mainnet.g.alchemy.com/v2/${this.apiKey}`;
        this.requiredCollection = process.env.BERACHAIN_NFT_COLLECTION;
        this.minNftCount = parseInt(process.env.BERACHAIN_MIN_NFT_COUNT) || 1;
        
        console.log('🔗 Berachain NFT Verifier initialized');
        console.log('📍 Network: Berachain Mainnet');
        console.log('🎨 Required Collection:', this.requiredCollection || 'Any collection');
        console.log('📊 Min NFTs Required:', this.minNftCount);
    }

    async getNFTsForOwner(walletAddress) {
        try {
            const url = `${this.baseUrl}/getNFTsForOwner`;
            const response = await axios.get(url, {
                params: {
                    owner: walletAddress,
                    withMetadata: true,
                    pageSize: 100,
                    ...(this.requiredCollection && { 
                        contractAddresses: [this.requiredCollection] 
                    })
                }
            });

            return response.data;
        } catch (error) {
            console.error('Error fetching NFTs from Berachain:', error.message);
            throw new Error(`Failed to fetch NFTs: ${error.message}`);
        }
    }

    async verifyNFTOwnership(walletAddress) {
        try {
            console.log(`🔍 Verifying NFTs on Berachain for: ${walletAddress}`);
            
            const nftData = await this.getNFTsForOwner(walletAddress);
            const ownedNFTs = nftData.ownedNfts || [];
            
            const result = {
                verified: false,
                network: 'berachain',
                walletAddress: walletAddress,
                totalNFTs: nftData.totalCount || 0,
                ownedNFTs: ownedNFTs.length,
                requiredCollection: this.requiredCollection,
                minRequired: this.minNftCount,
                details: {},
                timestamp: new Date().toISOString()
            };

            // If no specific collection required, just check total count
            if (!this.requiredCollection) {
                result.verified = result.ownedNFTs >= this.minNftCount;
                result.details.message = `Wallet owns ${result.ownedNFTs} NFTs (required: ${this.minNftCount})`;
                return result;
            }

            // Check ownership of specific collection
            const collectionNFTs = ownedNFTs.filter(nft => 
                nft.contract.address.toLowerCase() === this.requiredCollection.toLowerCase()
            );

            result.verified = collectionNFTs.length >= this.minNftCount;
            result.collectionNFTs = collectionNFTs.length;
            
            if (collectionNFTs.length > 0) {
                result.details.collectionName = 'Super Schizos (Gen 2)';
                result.details.collectionSymbol = collectionNFTs[0].contract.symbol || '';
                result.details.ownedTokens = collectionNFTs.map(nft => ({
                    tokenId: nft.tokenId,
                    name: nft.name || `#${nft.tokenId}`,
                    image: nft.image?.cachedUrl || nft.image?.originalUrl
                }));
            } else if (this.requiredCollection) {
                // Set collection name even when no NFTs found
                result.details.collectionName = 'Super Schizos (Gen 2)';
                result.details.collectionSymbol = '';
            }

            result.details.message = result.verified 
                ? `✅ Owns ${collectionNFTs.length} NFTs from required collection`
                : `❌ Owns ${collectionNFTs.length} NFTs from required collection (need ${this.minNftCount})`;

            return result;

        } catch (error) {
            console.error('Berachain NFT verification failed:', error.message);
            return {
                verified: false,
                error: error.message,
                network: 'berachain',
                walletAddress: walletAddress,
                totalNFTs: 0,
                timestamp: new Date().toISOString()
            };
        }
    }

    formatDiscordEmbed(result) {
        const embed = {
            title: result.verified ? '✅ NFT Verification Successful!' : '❌ NFT Verification Failed',
            color: result.verified ? 0x8B4513 : 0xff0000, // Bear brown or red
            fields: [
                {
                    name: 'Network',
                    value: '🐻 Berachain Mainnet',
                    inline: true
                },
                {
                    name: 'Wallet Address',
                    value: `\`${result.walletAddress}\``,
                    inline: false
                }
            ],
            timestamp: result.timestamp
        };

        if (result.verified) {
            embed.description = '🎉 Wallet meets NFT ownership requirements on Berachain!';
            
            embed.fields.push({
                name: 'Total NFTs Found',
                value: `${result.totalNFTs || 0}`,
                inline: true
            });

            if (result.requiredCollection && result.details?.collectionName) {
                embed.fields.push({
                    name: 'Collection',
                    value: `${result.details.collectionName} (${result.details.collectionSymbol})`,
                    inline: true
                });
                embed.fields.push({
                    name: 'Owned from Collection',
                    value: `${result.collectionNFTs}`,
                    inline: true
                });
            }
        } else {
            embed.description = result.error || result.details?.message || 'Wallet does not meet NFT ownership requirements.';
            
            if (result.requiredCollection) {
                embed.fields.push({
                    name: 'Required Collection',
                    value: `\`${result.requiredCollection}\``,
                    inline: false
                });
            }
            
            if (result.minRequired) {
                embed.fields.push({
                    name: 'Required NFTs',
                    value: `${result.minRequired}`,
                    inline: true
                });
            }

            if (result.totalNFTs !== undefined) {
                embed.fields.push({
                    name: 'Total NFTs Found',
                    value: `${result.totalNFTs || 0}`,
                    inline: true
                });
            }
        }

        return embed;
    }

    getConfig() {
        return {
            network: 'berachain',
            networkName: 'Berachain Mainnet',
            apiEndpoint: this.baseUrl,
            requiredCollection: this.requiredCollection,
            minNftCount: this.minNftCount,
            hasApiKey: !!this.apiKey,
            roleId: process.env.BERACHAIN_ROLE_ID
        };
    }
}

module.exports = BeraVerifier; 