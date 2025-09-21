const axios = require('axios');

// Simple Monad NFT Verifier (converted to CommonJS)
class MonadNFTVerifier {
    constructor() {
        // Use your provided API key or fall back to env variable
        this.apiKey = process.env.ALCHEMY_API_KEY === 'your_alchemy_api_key_here' || !process.env.ALCHEMY_API_KEY 
            ? 'oZOAGENSu4JJteMg2gTut' 
            : process.env.ALCHEMY_API_KEY;
        this.baseUrl = `https://monad-testnet.g.alchemy.com/v2/${this.apiKey}`;
        this.requiredCollection = process.env.REQUIRED_NFT_COLLECTION; // Single collection address
        this.minNftCount = parseInt(process.env.MIN_NFT_COUNT) || 1;
        
        console.log('🔗 Monad NFT Verifier initialized');
        console.log('📍 Network: Monad Testnet');
        console.log('🎨 Required Collection:', this.requiredCollection || 'Any collection');
        console.log('📊 Min NFTs Required:', this.minNftCount);
        
        // Log staking contracts
        const stakingContracts = this.getStakingContracts();
        if (stakingContracts.length > 0) {
            console.log('🏦 Staking Contracts:', stakingContracts.length);
            stakingContracts.forEach((contract, index) => {
                console.log(`   ${index + 1}. ${contract}`);
            });
        } else {
            console.log('🏦 Staking Support: Disabled (no contracts configured)');
        }
    }

    async getNFTsForOwner(walletAddress) {
        try {
            const url = `${this.baseUrl}/getNFTsForOwner`;
            const response = await axios.get(url, {
                params: {
                    owner: walletAddress,
                    withMetadata: true,
                    pageSize: 100,
                    // Filter by specific collection if set
                    ...(this.requiredCollection && { 
                        contractAddresses: [this.requiredCollection] 
                    })
                }
            });

            return response.data;
        } catch (error) {
            console.error('Error fetching NFTs from Monad:', error.message);
            throw new Error(`Failed to fetch NFTs: ${error.message}`);
        }
    }

    async verifyNFTOwnership(walletAddress) {
        try {
            console.log(`🔍 Verifying NFTs on Monad for: ${walletAddress}`);
            
            const nftData = await this.getNFTsForOwner(walletAddress);
            const ownedNFTs = nftData.ownedNfts || [];
            
            const result = {
                verified: false,
                network: 'monad_testnet',
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
                result.details.collectionName = collectionNFTs[0].contract.name || 'Unknown Collection';
                result.details.collectionSymbol = collectionNFTs[0].contract.symbol || '';
                result.details.ownedTokens = collectionNFTs.map(nft => ({
                    tokenId: nft.tokenId,
                    name: nft.name || `#${nft.tokenId}`,
                    image: nft.image?.cachedUrl || nft.image?.originalUrl
                }));
            }

            result.details.message = result.verified 
                ? `✅ Owns ${collectionNFTs.length} NFTs from required collection`
                : `❌ Owns ${collectionNFTs.length} NFTs from required collection (need ${this.minNftCount})`;

            return result;

        } catch (error) {
            console.error('NFT verification failed:', error.message);
            return {
                verified: false,
                error: error.message,
                network: 'monad_testnet',
                walletAddress: walletAddress,
                totalNFTs: 0,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get all configured staking contracts
     * @returns {string[]} Array of staking contract addresses
     */
    getStakingContracts() {
        const contracts = [];
        
        // Support multiple staking contracts via environment variables
        if (process.env.STAKING_CONTRACT_ADDRESS) {
            contracts.push(process.env.STAKING_CONTRACT_ADDRESS);
        }
        
        if (process.env.STAKING_CONTRACT_ADDRESS_2) {
            contracts.push(process.env.STAKING_CONTRACT_ADDRESS_2);
        }
        
        // Filter out empty/invalid addresses
        return contracts.filter(addr => addr && addr.length === 42 && addr.startsWith('0x'));
    }

    /**
     * Check if wallet has staked NFTs by directly querying the contract state
     * @param {string} walletAddress - Wallet to check
     * @param {string} stakingContractAddress - Staking contract address
     * @returns {Promise<Object>} Staking verification result
     */
    async checkStakedNFTsDirectly(walletAddress, stakingContractAddress) {
        try {
            console.log(`🏦 Checking staked NFTs directly from contract for: ${walletAddress}`);
            console.log(`📦 Staking contract: ${stakingContractAddress}`);
            
            // Correct function signatures calculated with keccak256
            // nftStakeCount(address) -> keccak256("nftStakeCount(address)")[:4]
            const nftStakeCountSig = '0xde276f94';
            
            // getStakedTokenIds(address) -> keccak256("getStakedTokenIds(address)")[:4]  
            const getStakedTokenIdsSig = '0x7047bc52';
            
            console.log(`🔧 Testing contract and function signatures...`);
            
            // First, test if contract exists by checking bytecode
            const contractCheck = await axios.post(this.baseUrl, {
                jsonrpc: "2.0",
                method: "eth_getCode",
                params: [stakingContractAddress, "latest"],
                id: 0
            });
            
            if (!contractCheck.data || !contractCheck.data.result || contractCheck.data.result === '0x') {
                throw new Error(`Contract not found at address ${stakingContractAddress}`);
            }
            console.log(`✅ Contract exists at ${stakingContractAddress}`);
            
            // Encode the wallet address (pad to 32 bytes)
            const paddedAddress = walletAddress.slice(2).padStart(64, '0');
            console.log(`🔧 Encoded address: 0x${paddedAddress}`);
            
            let stakedCount = 0;
            let lastError = null;
            
            // Try multiple function signatures
            for (const [funcName, signature] of Object.entries({
                'nftStakeCount(address)': nftStakeCountSig,
                'totalNFTStakeCount()': '0x18a9a40c'  // Correct signature for totalNFTStakeCount()
            })) {
                try {
                    const callData = funcName.includes('address') 
                        ? signature + paddedAddress 
                        : signature; // No params for totalNFTStakeCount
                    
                    console.log(`🔧 Trying ${funcName} with signature ${signature}`);
                    console.log(`🔧 Call data: ${callData}`);
                    
                    const response = await axios.post(this.baseUrl, {
                        jsonrpc: "2.0",
                        method: "eth_call",
                        params: [{
                            to: stakingContractAddress,
                            data: callData
                        }, "latest"],
                        id: 1
                    });

                    console.log(`🔧 Response for ${funcName}:`, JSON.stringify(response.data, null, 2));

                    if (response.data && response.data.result && response.data.result !== '0x') {
                        if (funcName.includes('totalNFTStakeCount')) {
                            const totalStaked = parseInt(response.data.result, 16);
                            console.log(`📊 Total NFTs staked in contract: ${totalStaked}`);
                            // This doesn't tell us about this specific user, but confirms staking works
                        } else {
                            stakedCount = parseInt(response.data.result, 16);
                            console.log(`✅ Found staked count for user: ${stakedCount}`);
                            break;
                        }
                    } else if (response.data && response.data.error) {
                        console.log(`❌ Error calling ${funcName}:`, response.data.error);
                        lastError = response.data.error;
                    }
                } catch (funcError) {
                    console.log(`❌ Exception calling ${funcName}:`, funcError.message);
                    lastError = funcError;
                }
            }
            
            console.log(`📊 Final staked count: ${stakedCount}`);

            // If user has staked NFTs, get the token IDs
            let stakedTokenIds = [];
            if (stakedCount > 0) {
                try {
                    const tokenIdsCall = await axios.post(this.baseUrl, {
                        jsonrpc: "2.0",
                        method: "eth_call",
                        params: [{
                            to: stakingContractAddress,
                            data: getStakedTokenIdsSig + paddedAddress
                        }, "latest"],
                        id: 2
                    });

                    if (tokenIdsCall.data && tokenIdsCall.data.result && tokenIdsCall.data.result !== '0x') {
                        // Parse the returned array of token IDs
                        const result = tokenIdsCall.data.result;
                        // Remove '0x' and parse the dynamic array
                        // Format: [offset][length][data1][data2]...
                        const hex = result.slice(2);
                        
                        if (hex.length >= 128) { // At least offset + length
                            const lengthHex = hex.slice(64, 128); // Second 32 bytes is length
                            const arrayLength = parseInt(lengthHex, 16);
                            
                            if (arrayLength > 0 && arrayLength <= 1000) { // Sanity check
                                for (let i = 0; i < arrayLength; i++) {
                                    const tokenIdHex = hex.slice(128 + (i * 64), 128 + ((i + 1) * 64));
                                    if (tokenIdHex.length === 64) {
                                        const tokenId = parseInt(tokenIdHex, 16);
                                        if (tokenId > 0) {
                                            stakedTokenIds.push(tokenId);
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (tokenError) {
                    console.log('⚠️ Could not fetch staked token IDs, but count is available');
                }
            }

            const result = {
                hasStakedNFTs: stakedCount > 0,
                stakedCount: stakedCount,
                stakedTokenIds: stakedTokenIds,
                walletAddress: walletAddress,
                stakingContract: stakingContractAddress,
                verificationMethod: 'direct_contract_call'
            };

            if (result.hasStakedNFTs) {
                console.log(`✅ Found ${stakedCount} staked NFTs`);
                if (stakedTokenIds.length > 0) {
                    console.log(`   Token IDs: ${stakedTokenIds.slice(0, 5).join(', ')}${stakedTokenIds.length > 5 ? '...' : ''}`);
                }
            } else {
                console.log('❌ No staked NFTs found in contract');
            }

            return result;
            
        } catch (error) {
            console.error('Error checking staked NFTs directly:', error.message);
            return {
                hasStakedNFTs: false,
                error: error.message,
                walletAddress: walletAddress,
                stakingContract: stakingContractAddress,
                verificationMethod: 'direct_contract_call_failed'
            };
        }
    }

    /**
     * Enhanced NFT verification that includes staking contract checks
     * @param {string} walletAddress - Wallet to verify
     * @param {Object} options - Verification options
     * @returns {Promise<Object>} Enhanced verification result
     */
    async verifyNFTOwnershipWithStaking(walletAddress, options = {}) {
        try {
            console.log(`🔍 Enhanced NFT verification for: ${walletAddress}`);
            
            // First, try standard NFT ownership check
            const standardResult = await this.verifyNFTOwnership(walletAddress);
            
            // If standard verification passes, return it
            if (standardResult.verified) {
                standardResult.verificationMethod = 'direct_ownership';
                return standardResult;
            }

            // If standard verification fails and staking contracts are configured, check staking
            const stakingContracts = this.getStakingContracts();
            if (stakingContracts.length > 0) {
                console.log(`🏦 Standard verification failed, checking ${stakingContracts.length} staking contract(s)...`);
                
                let totalStakedCount = 0;
                let allStakedTokenIds = [];
                let stakingResults = [];
                
                // Check all staking contracts
                for (const contractAddress of stakingContracts) {
                    console.log(`🏦 Checking staking contract: ${contractAddress}`);
                    const stakingResult = await this.checkStakedNFTsDirectly(
                        walletAddress, 
                        contractAddress
                    );
                    
                    stakingResults.push(stakingResult);
                    
                    if (stakingResult.hasStakedNFTs) {
                        totalStakedCount += stakingResult.stakedCount;
                        allStakedTokenIds = allStakedTokenIds.concat(stakingResult.stakedTokenIds);
                    }
                }

                if (totalStakedCount > 0) {
                    // Check if total staked count meets minimum requirements
                    const meetsRequirement = totalStakedCount >= this.minNftCount;
                    
                    if (meetsRequirement) {
                        return {
                            verified: true,
                            verificationMethod: 'staking_direct_query_multi',
                            network: 'monad_testnet',
                            walletAddress: walletAddress,
                            stakedNFTCount: totalStakedCount,
                            totalNFTs: totalStakedCount, // Add this field for Discord embed display
                            stakedTokenIds: allStakedTokenIds.slice(0, 10), // Show first 10
                            totalStakedTokenIds: allStakedTokenIds.length,
                            stakingContracts: stakingContracts,
                            stakingContractsChecked: stakingContracts.length,
                            minRequired: this.minNftCount,
                            details: {
                                message: `✅ Verified through staked NFTs (${totalStakedCount} NFTs staked across ${stakingContracts.length} contract(s), ${this.minNftCount} required)`,
                                stakingDetails: stakingResults
                            },
                            timestamp: new Date().toISOString()
                        };
                    } else {
                        // Has staked NFTs but not enough
                        return {
                            verified: false,
                            verificationMethod: 'staking_insufficient_multi',
                            network: 'monad_testnet',
                            walletAddress: walletAddress,
                            stakedNFTCount: totalStakedCount,
                            totalNFTs: totalStakedCount, // Add this field for Discord embed display
                            stakingContractsChecked: stakingContracts.length,
                            minRequired: this.minNftCount,
                            details: {
                                message: `❌ Insufficient staked NFTs (${totalStakedCount} staked across ${stakingContracts.length} contract(s), ${this.minNftCount} required)`,
                                stakingDetails: stakingResults
                            },
                            timestamp: new Date().toISOString()
                        };
                    }
                }
            }

            // If both methods fail, return the standard result with additional info
            standardResult.verificationMethod = 'failed_both';
            standardResult.stakingContractsChecked = stakingContracts.length;
            if (stakingContracts.length > 0) {
                standardResult.details.stakingInfo = `No staked NFTs found in ${stakingContracts.length} staking contract(s)`;
            }
            
            return standardResult;
            
        } catch (error) {
            console.error('Enhanced NFT verification failed:', error.message);
            return {
                verified: false,
                error: error.message,
                network: 'monad_testnet',
                walletAddress: walletAddress,
                verificationMethod: 'error',
                timestamp: new Date().toISOString()
            };
        }
    }

    formatDiscordEmbed(result) {
        const embed = {
            title: result.verified ? '✅ NFT Verification Successful!' : '❌ NFT Verification Failed',
            color: result.verified ? 0x00ff00 : 0xff0000,
            fields: [
                {
                    name: 'Network',
                    value: '🟣 Monad Testnet',
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

        // Add verification method info
        if (result.verificationMethod) {
            const methodEmojis = {
                'direct_ownership': '👛',
                'staking_direct_query': '🏦',
                'staking_insufficient': '⚠️',
                'failed_both': '❌',
                'error': '⚠️'
            };
            
            const methodNames = {
                'direct_ownership': 'Direct NFT Ownership',
                'staking_direct_query': 'Staked NFTs Verification',
                'staking_direct_query_multi': 'Staked NFTs Verification (Multi-Contract)',
                'staking_insufficient': 'Insufficient Staked NFTs',
                'staking_insufficient_multi': 'Insufficient Staked NFTs (Multi-Contract)',
                'failed_both': 'Both Methods Failed',
                'error': 'Verification Error'
            };

            embed.fields.push({
                name: 'Verification Method',
                value: `${methodEmojis[result.verificationMethod] || '🔍'} ${methodNames[result.verificationMethod] || result.verificationMethod}`,
                inline: true
            });
        }

        if (result.verified) {
            if (result.verificationMethod === 'staking_direct_query' || result.verificationMethod === 'staking_direct_query_multi') {
                // Staking-based verification
                embed.description = '🏦 Verified through staked NFTs! Your staked NFTs count towards verification.';
                
                embed.fields.push({
                    name: 'Staked NFTs',
                    value: `${result.stakedNFTCount}`,
                    inline: true
                });

                embed.fields.push({
                    name: 'Required',
                    value: `${result.minRequired}`,
                    inline: true
                });

                if (result.stakedTokenIds && result.stakedTokenIds.length > 0) {
                    const tokenDisplay = result.stakedTokenIds.length <= 5 
                        ? result.stakedTokenIds.join(', ')
                        : `${result.stakedTokenIds.slice(0, 5).join(', ')}... (+${result.totalStakedTokenIds - 5} more)`;
                    
                    embed.fields.push({
                        name: 'Staked Token IDs',
                        value: `${tokenDisplay}`,
                        inline: false
                    });
                }

                // Handle both single and multi-contract staking displays
                if (result.verificationMethod === 'staking_direct_query_multi' && result.stakingContracts) {
                    embed.fields.push({
                        name: 'Staking Contracts',
                        value: `${result.stakingContractsChecked} contract(s) checked`,
                        inline: false
                    });
                } else if (result.stakingContract) {
                    embed.fields.push({
                        name: 'Staking Contract',
                        value: `\`${result.stakingContract}\``,
                        inline: false
                    });
                }
            } else {
                // Direct ownership verification
                embed.description = '🎉 Wallet meets NFT ownership requirements!';
                
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
            }
        } else {
            embed.description = result.error || result.details?.message || 'Wallet does not meet NFT ownership requirements.';
            
            // Add staking info for failed verifications
            if (result.verificationMethod === 'staking_insufficient' || result.verificationMethod === 'staking_insufficient_multi') {
                embed.fields.push({
                    name: 'Staked NFTs Found',
                    value: `${result.stakedNFTCount}`,
                    inline: true
                });
                embed.fields.push({
                    name: 'Required',
                    value: `${result.minRequired}`,
                    inline: true
                });
            } else if (result.stakingContractChecked) {
                embed.fields.push({
                    name: 'Staking Check',
                    value: result.details?.stakingInfo || 'Staking contract checked but no staked NFTs found',
                    inline: false
                });
            }
            
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

    /**
     * Check for verification transaction in recent blocks using standard JSON-RPC
     * @param {string} fromAddress - Sender wallet address
     * @param {string} toAddress - Receiver wallet address  
     * @param {string} exactAmount - Exact amount in Wei to look for
     * @returns {Boolean} True if transaction found
     */
    async checkVerificationTransaction(fromAddress, toAddress, exactAmount) {
        try {
            console.log(`🔍 Checking for transaction: ${fromAddress} -> ${toAddress}`);
            console.log(`💰 Looking for amount: ${exactAmount} Wei`);
            
            // Get latest block number
            const latestBlockResponse = await axios.post(this.baseUrl, {
                jsonrpc: "2.0",
                method: "eth_blockNumber",
                params: [],
                id: 1
            });

            const latestBlockHex = latestBlockResponse.data.result;
            const latestBlock = parseInt(latestBlockHex, 16);
            console.log(`📊 Latest block: ${latestBlock}`);

            // Check last 1000 blocks for transactions (Monad: 200ms blocks = ~3.3 minutes)
            const blocksToCheck = 1000;
            const startBlock = Math.max(0, latestBlock - blocksToCheck);

            for (let blockNum = latestBlock; blockNum >= startBlock; blockNum--) {
                const blockHex = '0x' + blockNum.toString(16);
                
                // Get block with transactions
                const blockResponse = await axios.post(this.baseUrl, {
                    jsonrpc: "2.0",
                    method: "eth_getBlockByNumber",
                    params: [blockHex, true], // true = include full transaction objects
                    id: 1
                });

                const block = blockResponse.data.result;
                if (!block || !block.transactions) continue;

                // Check each transaction in the block
                for (const tx of block.transactions) {
                    if (tx.to && tx.from && 
                        tx.to.toLowerCase() === toAddress.toLowerCase() && 
                        tx.from.toLowerCase() === fromAddress.toLowerCase()) {
                        
                        const txValue = tx.value ? parseInt(tx.value, 16).toString() : '0';
                        console.log(`🔎 Found transaction: ${txValue} Wei (looking for: ${exactAmount} Wei)`);
                        
                        if (txValue === exactAmount) {
                            console.log('✅ Verification transaction found!');
                            console.log(`   Block: ${blockNum}, Hash: ${tx.hash}`);
                            return true;
                        }
                    }
                }
            }

            console.log('❌ No matching verification transaction found in last 1000 blocks (~3.3 minutes)');
            return false;
            
        } catch (error) {
            console.error('Error checking transactions:', error.message);
            return false;
        }
    }

    getConfig() {
        const stakingContracts = this.getStakingContracts();
        return {
            network: 'monad_testnet',
            networkName: 'Monad Testnet',
            apiEndpoint: this.baseUrl,
            requiredCollection: this.requiredCollection,
            minNftCount: this.minNftCount,
            hasApiKey: !!this.apiKey,
            botWallet: process.env.BOT_WALLET_ADDRESS,
            stakingContract: process.env.STAKING_CONTRACT_ADDRESS, // Legacy for backward compatibility
            stakingContracts: stakingContracts,
            stakingContractsCount: stakingContracts.length,
            hasStakingSupport: stakingContracts.length > 0
        };
    }
}

module.exports = MonadNFTVerifier; 