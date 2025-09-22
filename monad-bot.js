/**
 * Multi-Chain Discord NFT Verification Bot
 * Supports Monad Testnet (primary), Arbitrum, and Berachain
 * Monad verification is required first, others can use verified addresses
 */

const { Client, GatewayIntentBits, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import verifiers and utilities
const MonadNFTVerifier = require('./verifiers/monad-verifier');
const ArbitrumNFTVerifier = require('./verifiers/arbitrum-verifier');
const BeraVerifier = require('./verifiers/bera-verifier');
const PostgreSQLDatabase = require('./database/postgres-db');
const HealthServer = require('./health-server');
const { generateVerificationAmount, formatAmountForDisplay, ethToWei, isValidEthereumAddress } = require('./verifiers/base-verifier');

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Initialize verifiers and database
const monadVerifier = new MonadNFTVerifier();
const arbitrumVerifier = new ArbitrumNFTVerifier();
const beraVerifier = new BeraVerifier();
const verificationDB = new PostgreSQLDatabase();

// Initialize health server
const healthServer = new HealthServer();
healthServer.setDatabase(verificationDB);
healthServer.start();

// Storage for verification codes (Monad only)
const VERIFICATION_FILE = path.join(__dirname, 'verification_codes.json');
let verificationCodes = {};

// Load existing verification codes
function loadVerificationCodes() {
    try {
        if (fs.existsSync(VERIFICATION_FILE)) {
            const data = fs.readFileSync(VERIFICATION_FILE, 'utf8');
            verificationCodes = JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading verification codes:', error);
        verificationCodes = {};
    }
}

// Save verification codes
function saveVerificationCodes() {
    try {
        fs.writeFileSync(VERIFICATION_FILE, JSON.stringify(verificationCodes, null, 2));
    } catch (error) {
        console.error('Error saving verification codes:', error);
    }
}

client.once('ready', async () => {
    console.log(`✅ Multi-Chain NFT Bot is ready! Logged in as ${client.user.tag}`);
    healthServer.setReady(true);
    
    // Show configuration
    const monadConfig = monadVerifier.getConfig();
    const arbitrumConfig = arbitrumVerifier.getConfig();
    const beraConfig = beraVerifier.getConfig();
    
    console.log('🔗 Multi-Chain Configuration:');
    console.log(`   🟣 Monad: ${monadConfig.networkName} (Primary)`);
    console.log(`   🔵 Arbitrum: ${arbitrumConfig.networkName}`);
    console.log(`   🐻 Bera: ${beraConfig.networkName}`);
    const stats = await verificationDB.getStats();
    console.log(`   📊 Database: ${stats.totalUsers} users (🟣 ${stats.monadVerified} Monad, 🔵 ${stats.arbitrumVerified} Arbitrum, 🐻 ${stats.beraVerified} Bera)`);
    
    // Load verification codes
    loadVerificationCodes();
    
    // Register slash commands
    try {
        const commands = [
            new SlashCommandBuilder()
                .setName('verify-holdings')
                .setDescription('Verify NFT ownership across multiple chains'),
            
            new SlashCommandBuilder()
                .setName('monad-config')
                .setDescription('Show Monad NFT verification configuration'),
                
            new SlashCommandBuilder()
                .setName('verification-status')
                .setDescription('Check your verification status'),
                
            new SlashCommandBuilder()
                .setName('reset-verification')
                .setDescription('Reset your verification status (for testing)')
        ];

        // Wait a moment for guild cache to populate
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        if (guild) {
            await guild.commands.set(commands);
            console.log('✅ Slash commands registered successfully');
        } else {
            console.warn('⚠️ Guild not found. Make sure GUILD_ID is set correctly in .env');
            console.warn(`   📋 Guild ID: ${process.env.GUILD_ID}`);
            console.warn(`   🔍 Available guilds: ${client.guilds.cache.map(g => `${g.name} (${g.id})`).join(', ')}`);
        }
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isCommand()) {
            await handleSlashCommand(interaction);
        } else if (interaction.isButton()) {
            await handleButtonInteraction(interaction);
        } else if (interaction.isStringSelectMenu()) {
            await handleSelectMenuInteraction(interaction);
        } else if (interaction.isModalSubmit()) {
            await handleModalSubmit(interaction);
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Error')
            .setDescription('An error occurred while processing your request. Please try again.');

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        } catch (followUpError) {
            console.error('Discord client error:', followUpError);
        }
    }
});

async function handleSlashCommand(interaction) {
    if (interaction.commandName === 'verify-holdings') {
        const embed = new EmbedBuilder()
            .setColor('#9900ff')
            .setTitle('🔗 Multi-Chain NFT Verification')
            .setDescription('Verify that your wallet owns the required NFTs to get access to Schizlist Role.')
            .addFields(
                {
                    name: '📋 How it works:',
                    value: '• **Monad Testnet**: Primary verification (transaction required)\n• **Arbitrum/Bera**: Can use your Monad-verified address\n• Gain access to exclusive channels upon successful verification'
                },
                {
                    name: '🔗 Supported Networks:',
                    value: '🟣 **Monad Testnet** - S.Y.B.I.L Pass\n🔵 **Arbitrum** - Schizo Sybils (Gen 1)\n🐻 **Bera** - Super Schizos (Gen 2)',
                    inline: false
                }
            );

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_verification_chain')
            .setPlaceholder('Choose a blockchain to verify on...')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Monad Testnet')
                    .setDescription('Primary verification with transaction & staking support')
                    .setValue('monad_testnet')
                    .setEmoji('🟣'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Arbitrum')
                    .setDescription('Verify NFTs on Arbitrum network')
                    .setValue('arbitrum')
                    .setEmoji('🔵'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Bera')
                    .setDescription('Verify NFTs on Bera network')
                    .setValue('bera')
                    .setEmoji('🐻')
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.reply({ embeds: [embed], components: [row] });
        
    } else if (interaction.commandName === 'monad-config') {
        const config = monadVerifier.getConfig();
        
        const embed = new EmbedBuilder()
            .setColor('#9900ff')
            .setTitle('🟣 Monad NFT Verification Configuration')
            .addFields(
                {
                    name: 'Network:',
                    value: config.networkName,
                    inline: true
                },
                {
                    name: 'API Status:',
                    value: config.hasApiKey ? '✅ Connected' : '❌ No API Key',
                    inline: true
                },
                {
                    name: 'Min NFTs Required:',
                    value: `${config.minNftCount}`,
                    inline: true
                },
                {
                    name: 'API Endpoint:',
                    value: `\`https://monad-testnet.g.alchemy.com/v2/[API_KEY]\``,
                    inline: false
                }
            );

        if (config.requiredCollection) {
            embed.addFields({
                name: 'Required Collection:',
                value: `\`${config.requiredCollection}\``
            });
        } else {
            embed.addFields({
                name: 'Collection Filter:',
                value: 'Any NFT collection accepted'
            });
        }

        // Add staking contract info
        if (config.hasStakingSupport) {
            const stakingInfo = config.stakingContractsCount === 1 
                ? `✅ Enabled (1 contract)\n\`${config.stakingContracts[0]}\``
                : `✅ Enabled (${config.stakingContractsCount} contracts)\n${config.stakingContracts.map((addr, i) => `${i + 1}. \`${addr}\``).join('\n')}`;
            
            embed.addFields({
                name: 'Staking Support:',
                value: stakingInfo,
                inline: false
            });
        } else {
            embed.addFields({
                name: 'Staking Support:',
                value: '❌ Not configured (direct ownership only)',
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
        
    } else if (interaction.commandName === 'verification-status') {
        const userId = interaction.user.id;
        const userVerifications = await verificationDB.getUserVerifications(userId);
        
        if (Object.keys(userVerifications).length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('📋 Verification Status')
                .setDescription('You have not completed any verifications yet. Use `/verify-holdings` to begin.');
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } else {
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('📋 Multi-Chain Verification Status')
                .setDescription('Here are your verified networks:');

            let fieldsAdded = false;

            // Add Monad verification
            if (userVerifications.monad_testnet?.verificationResult?.verified) {
                const monadData = userVerifications.monad_testnet;
                embed.addFields({
                    name: '🟣 Monad Testnet',
                    value: `✅ Verified\n\`${monadData.walletAddress}\`\n📅 ${new Date(monadData.verifiedAt).toLocaleDateString()}`,
                    inline: true
                });
                fieldsAdded = true;
            }

            // Add Arbitrum verification
            if (userVerifications.arbitrum?.verificationResult?.verified) {
                const arbitrumData = userVerifications.arbitrum;
                embed.addFields({
                    name: '🔵 Arbitrum',
                    value: `✅ Verified\n\`${arbitrumData.walletAddress}\`\n📅 ${new Date(arbitrumData.verifiedAt).toLocaleDateString()}`,
                    inline: true
                });
                fieldsAdded = true;
            }

            // Add Bera verification
            if (userVerifications.berachain?.verificationResult?.verified) {
                const beraData = userVerifications.berachain;
                embed.addFields({
                    name: '🐻 Berachain',
                    value: `✅ Verified\n\`${beraData.walletAddress}\`\n📅 ${new Date(beraData.verifiedAt).toLocaleDateString()}`,
                    inline: true
                });
                fieldsAdded = true;
            }

            // Add available networks to verify
            const availableNetworks = [];
            if (!userVerifications.monad_testnet?.verificationResult?.verified) {
                availableNetworks.push('🟣 Monad Testnet (Required first)');
            }
            if (!userVerifications.arbitrum?.verificationResult?.verified) {
                availableNetworks.push('🔵 Arbitrum');
            }
            if (!userVerifications.berachain?.verificationResult?.verified) {
                availableNetworks.push('🐻 Berachain');
            }

            if (availableNetworks.length > 0) {
                embed.addFields({
                    name: '📋 Available to Verify:',
                    value: availableNetworks.join('\n'),
                    inline: false
                });
            }
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
    } else if (interaction.commandName === 'reset-verification') {
        const userId = interaction.user.id;
        
        // Remove from database
        const removed = await verificationDB.removeVerification(userId);
        
        // Remove from legacy verification codes
        const userCodeEntry = Object.entries(verificationCodes).find(([code, data]) => data.userId === userId);
        if (userCodeEntry) {
            const [code, data] = userCodeEntry;
            delete verificationCodes[code];
            saveVerificationCodes();
        }
        
        if (removed || userCodeEntry) {
            // Remove verified roles
            const member = interaction.guild.members.cache.get(userId);
            const roleIds = [
                process.env.VERIFIED_ROLE_ID,
                process.env.ARBITRUM_ROLE_ID,
                process.env.BERACHAIN_ROLE_ID
            ].filter(Boolean);
            
            if (member && roleIds.length > 0) {
                try {
                    for (const roleId of roleIds) {
                        const role = interaction.guild.roles.cache.get(roleId);
                        if (role && member.roles.cache.has(roleId)) {
                            await member.roles.remove(role);
                        }
                    }
                } catch (error) {
                    console.error('Error removing roles:', error);
                }
            }
            
            const embed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('🔄 Verification Reset')
                .setDescription('Your verification status has been completely reset.')
                .addFields(
                    { name: 'Status:', value: 'You can now verify again on all chains' }
                );
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } else {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Nothing to Reset')
                .setDescription('You don\'t have any verification to reset.');
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
}

async function handleSelectMenuInteraction(interaction) {
    if (interaction.customId === 'select_verification_chain') {
        const selectedChain = interaction.values[0];
        const userId = interaction.user.id;
        
        if (selectedChain === 'monad_testnet') {
            // Monad verification (unchanged logic)
            const config = monadVerifier.getConfig();
            
            const embed = new EmbedBuilder()
                .setColor('#9900ff')
                .setTitle('🟣 Monad NFT Verification')
                .setDescription('Verify that your wallet owns the required NFTs on Monad testnet to get access to exclusive content.')
                .addFields(
                    { 
                        name: '📋 Requirements:', 
                        value: config.requiredCollection 
                            ? `• Must own NFTs from specific collection\n• Minimum ${config.minNftCount} NFT(s) required`
                            : `• Must own at least ${config.minNftCount} NFT(s) from any collection`
                    },
                    {
                        name: '🔗 Network:',
                        value: '🟣 Monad Testnet',
                        inline: true
                    },
                    {
                        name: '🏦 Staking Support:',
                        value: config.hasStakingSupport 
                            ? '✅ Staked NFTs are automatically detected!'
                            : '⚠️ Only direct ownership verified',
                        inline: true
                    }
                );

            if (config.requiredCollection) {
                embed.addFields({
                    name: '🎨 Required Collection:',
                    value: `\`${config.requiredCollection}\``
                });
            }

            const button = new ButtonBuilder()
                .setCustomId('request_monad_wallet')
                .setLabel('Start Monad Verification')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🟣');

            const row = new ActionRowBuilder().addComponents(button);
            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
            
        } else if (selectedChain === 'arbitrum' || selectedChain === 'bera') {
            // Check if user has Monad verification first
            const hasMonadVerification = await verificationDB.hasMonadVerification(userId);
            
            if (hasMonadVerification) {
                // Use Monad-verified address only
                const verifiedWallet = await verificationDB.getVerifiedWallet(userId);
                const networkName = selectedChain === 'arbitrum' ? 'Arbitrum' : 'Bera';
                const emoji = selectedChain === 'arbitrum' ? '🔵' : '🐻';
                
                const embed = new EmbedBuilder()
                    .setColor(selectedChain === 'arbitrum' ? '#4A90E2' : '#8B4513')
                    .setTitle(`${emoji} ${networkName} NFT Verification`)
                    .setDescription(`Ready to verify your Monad-verified wallet on ${networkName}!`)
                    .addFields(
                        {
                            name: '🟣 Your Monad-Verified Wallet:',
                            value: `\`${verifiedWallet}\``,
                            inline: false
                        },
                        {
                            name: '⚡ Verification Process:',
                            value: `Click the button below to verify this wallet on ${networkName}. No transaction required!`,
                            inline: false
                        }
                    );

                const useVerifiedButton = new ButtonBuilder()
                    .setCustomId(`use_verified_wallet_${selectedChain}`)
                    .setLabel(`Verify on ${networkName}`)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⚡');

                const row = new ActionRowBuilder().addComponents(useVerifiedButton);
                await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
            } else {
                // No Monad verification - require it first
                const networkName = selectedChain === 'arbitrum' ? 'Arbitrum' : 'Bera';
                const emoji = selectedChain === 'arbitrum' ? '🔵' : '🐻';
                
                const embed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle(`${emoji} ${networkName} Verification Requires Monad First`)
                    .setDescription('You need to complete Monad verification before you can verify on other chains.')
                    .addFields(
                        {
                            name: '📋 Required Steps:',
                            value: '1. Complete **Monad Testnet** verification first\n2. Then return to verify on other chains\n3. Use your Monad-verified address for quick verification'
                        },
                        {
                            name: '🔗 Why Monad First?',
                            value: 'Monad verification includes transaction validation and creates a secure record of your wallet ownership.'
                        }
                    );

                const monadButton = new ButtonBuilder()
                    .setCustomId('request_monad_wallet')
                    .setLabel('Start Monad Verification')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🟣');

                const row = new ActionRowBuilder().addComponents(monadButton);
                await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
            }
        }
    }
}

async function handleButtonInteraction(interaction) {
    if (interaction.customId === 'request_monad_wallet') {
        // Show wallet address modal first
        const modal = new ModalBuilder()
            .setCustomId('monad_wallet_input_modal')
            .setTitle('Enter Your Wallet Address');

        const walletInput = new TextInputBuilder()
            .setCustomId('wallet_address')
            .setLabel('Wallet Address')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('0x1234567890abcdef...')
            .setRequired(true)
            .setMaxLength(42)
            .setMinLength(42);

        const firstActionRow = new ActionRowBuilder().addComponents(walletInput);
        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);
        
    } else if (interaction.customId === 'confirm_monad_transaction') {
        await interaction.deferReply({ ephemeral: true });

        const userId = interaction.user.id;

        // Find user's verification request
        const userVerification = Object.entries(verificationCodes).find(([id, data]) => data.userId === userId);
        
        if (!userVerification) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ No Verification Request')
                .setDescription('You need to start verification first. Use `/verify-holdings` to begin.');
            
            await interaction.editReply({ embeds: [embed] });
            return;
        }

        const [verificationId, verificationData] = userVerification;
        const walletAddress = verificationData.walletAddress;

        if (!walletAddress) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ No Wallet Address')
                .setDescription('Wallet address not found. Please start the verification process again.');
            
            await interaction.editReply({ embeds: [embed] });
            return;
        }

        try {
            // Step 1: Check for verification transaction
            console.log('💰 Checking for verification transaction...');
            const config = monadVerifier.getConfig();
            const transactionFound = await monadVerifier.checkVerificationTransaction(
                walletAddress, 
                config.botWallet, 
                verificationData.amountWei
            );
            
            if (!transactionFound) {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Transaction Not Found')
                    .setDescription('The verification transaction was not found on Monad testnet.')
                    .addFields(
                        { name: 'Please ensure:', value: '• You sent the exact amount specified\n• Transaction was sent to the correct address\n• Transaction was on Monad Testnet\n• Transaction was sent recently (within 3 minutes)' },
                        { name: 'Required Amount:', value: `**${formatAmountForDisplay(verificationData.amount)} MON**` },
                        { name: 'Bot Wallet:', value: `\`${config.botWallet}\`` },
                        { name: 'From Wallet:', value: `\`${walletAddress}\`` }
                    );

                await interaction.editReply({ embeds: [embed] });
                return;
            }
            
            console.log('✅ Verification transaction confirmed on blockchain');

            // Step 2: Verify NFT ownership on Monad (with staking support)
            console.log('🟣 Verifying NFT ownership on Monad (checking direct ownership and staking)...');
            const nftResult = await monadVerifier.verifyNFTOwnershipWithStaking(walletAddress);
            
            if (nftResult.verified) {
                // Verification successful - save to database
                await verificationDB.saveMonadVerification(userId, interaction.user.username, walletAddress, nftResult);
                
                // Update legacy verification codes
                verificationCodes[verificationId].verified = true;
                verificationCodes[verificationId].verifiedAt = Date.now();
                verificationCodes[verificationId].nftVerificationResult = nftResult;
                saveVerificationCodes();

                // Assign verified role
                const member = interaction.guild.members.cache.get(userId);
                const roleId = process.env.VERIFIED_ROLE_ID;
                
                if (roleId && member) {
                    try {
                        const role = interaction.guild.roles.cache.get(roleId);
                        if (role) {
                            await member.roles.add(role);
                        }
                    } catch (error) {
                        console.error('Error assigning role:', error);
                    }
                }

                const successEmbed = monadVerifier.formatDiscordEmbed(nftResult);
                await interaction.editReply({ embeds: [successEmbed] });
            } else {
                // NFT verification failed
                const failEmbed = monadVerifier.formatDiscordEmbed(nftResult);
                await interaction.editReply({ embeds: [failEmbed] });
            }
            
        } catch (error) {
            console.error('Verification error:', error);
            
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Verification Error')
                .setDescription('Failed to verify your wallet and NFTs. Please try again later.')
                .addFields(
                    { name: 'Error Details:', value: error.message || 'Unknown error occurred' }
                );

            await interaction.editReply({ embeds: [embed] });
        }
        
    } else if (interaction.customId.startsWith('use_verified_wallet_')) {
        // Use Monad-verified wallet for other chains
        const network = interaction.customId.replace('use_verified_wallet_', '');
        const userId = interaction.user.id;
        const verifiedWallet = await verificationDB.getVerifiedWallet(userId);
        
        if (!verifiedWallet) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ No Verified Wallet')
                .setDescription('No Monad-verified wallet found. Please complete Monad verification first.');
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            let verifier, networkName, emoji;
            
            if (network === 'arbitrum') {
                verifier = arbitrumVerifier;
                networkName = 'Arbitrum';
                emoji = '🔵';
            } else if (network === 'bera') {
                verifier = beraVerifier;
                networkName = 'Bera';
                emoji = '🐻';
            } else {
                throw new Error('Invalid network');
            }

            console.log(`${emoji} Verifying NFT ownership on ${networkName} for: ${verifiedWallet}`);
            const nftResult = await verifier.verifyNFTOwnership(verifiedWallet);
            
            if (nftResult.verified) {
                // Save verification to database
                await verificationDB.saveVerification(userId, interaction.user.username, verifiedWallet, nftResult, network);
                
                // Assign role
                const member = interaction.guild.members.cache.get(userId);
                const roleId = network === 'arbitrum' ? process.env.ARBITRUM_ROLE_ID : process.env.BERACHAIN_ROLE_ID;
                
                if (roleId && member) {
                    try {
                        const role = interaction.guild.roles.cache.get(roleId);
                        if (role) {
                            await member.roles.add(role);
                            console.log(`✅ Assigned ${networkName} role to ${interaction.user.username}`);
                        }
                    } catch (error) {
                        console.error(`Error assigning ${networkName} role:`, error);
                    }
                }

                const successEmbed = verifier.formatDiscordEmbed(nftResult);
                await interaction.editReply({ embeds: [successEmbed] });
            } else {
                const failEmbed = verifier.formatDiscordEmbed(nftResult);
                await interaction.editReply({ embeds: [failEmbed] });
            }
            
        } catch (error) {
            console.error(`${networkName} verification error:`, error);
            
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle(`❌ ${networkName} Verification Error`)
                .setDescription(`Failed to verify your wallet on ${networkName}. Please try again later.`)
                .addFields(
                    { name: 'Error Details:', value: error.message || 'Unknown error occurred' }
                );

            await interaction.editReply({ embeds: [embed] });
        }
        
    }
}

async function handleModalSubmit(interaction) {
    if (interaction.customId === 'monad_wallet_input_modal') {
        await interaction.deferReply({ ephemeral: true });

        const walletAddress = interaction.fields.getTextInputValue('wallet_address').trim();
        const userId = interaction.user.id;

        // Validate wallet address format
        if (!isValidEthereumAddress(walletAddress)) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Invalid Wallet Address')
                .setDescription('Please provide a valid Ethereum wallet address (should start with 0x and be 42 characters long).');
            
            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Check if user already verified
        const existingCode = Object.entries(verificationCodes).find(([code, data]) => data.userId === userId);
        
        if (existingCode && existingCode[1].verified) {
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Already Verified')
                .setDescription('You are already verified! You have access to all Monad NFT holder features.');
            
            await interaction.editReply({ embeds: [embed] });
            return;
        }

        let verificationAmount;
        let verificationId;
        if (existingCode && !existingCode[1].verified) {
            // Use existing amount if it exists, otherwise generate new one
            verificationAmount = existingCode[1].amount || generateVerificationAmount();
            verificationId = existingCode[0];
            
            // Update existing code with wallet address and amount
            verificationCodes[verificationId].walletAddress = walletAddress;
            if (!existingCode[1].amount) {
                verificationCodes[verificationId].amount = verificationAmount;
                verificationCodes[verificationId].amountWei = ethToWei(verificationAmount);
            }
            saveVerificationCodes();
        } else {
            verificationAmount = generateVerificationAmount();
            verificationId = Date.now().toString(); // Use timestamp as ID
            verificationCodes[verificationId] = {
                userId: userId,
                username: interaction.user.username,
                walletAddress: walletAddress,
                amount: verificationAmount,
                amountWei: ethToWei(verificationAmount),
                timestamp: Date.now(),
                verified: false
            };
            saveVerificationCodes();
        }

        const config = monadVerifier.getConfig();
        const embed = new EmbedBuilder()
            .setColor('#9900ff')
            .setTitle('💰 Verification Transaction Required')
            .setDescription('To verify wallet ownership, send a small transaction with the exact amount below:')
            .addFields(
                { name: '💸 Amount to Send:', value: `\`${formatAmountForDisplay(verificationAmount)} MON\``, inline: false },
                { name: '📍 Send exact amount from your Wallet to:', value: `\`${config.botWallet}\``, inline: false },
                { name: '⚠️ Important:', value: '• Use the **EXACT** amount shown above\n• Send from the wallet address specified above\n• Transaction must be on Monad Testnet\n• Only send MON (not tokens)' },
                { name: '⏰ Time Limit:', value: 'Transaction must be sent within 3 minutes (we check last 1000 blocks)' }
            )
            .setFooter({ text: 'After sending, click the button below to verify!' });

        const button = new ButtonBuilder()
            .setCustomId('confirm_monad_transaction')
            .setLabel('I Sent the Transaction')
            .setStyle(ButtonStyle.Success)
            .setEmoji('💰');

        const row = new ActionRowBuilder().addComponents(button);
        await interaction.editReply({ embeds: [embed], components: [row] });
        
    }
}

// Error handling
client.on('error', error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN); 