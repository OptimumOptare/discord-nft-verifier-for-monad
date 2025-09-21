# Discord NFT Verification Bot

A Discord bot that verifies NFT ownership across multiple blockchain networks including Monad Testnet, Arbitrum, and Berachain. The bot uses transaction-based verification to ensure wallet ownership and assigns Discord roles based on verified NFT holdings.

## Features

- Multi-chain NFT verification support
- Transaction-based wallet ownership verification
- Automatic detection of staked NFTs
- PostgreSQL database for verification tracking
- Role-based Discord access control
- Rate limiting and input validation
- Health monitoring endpoint

## Supported Networks

**Monad Testnet** (Primary verification required)
- S.Y.B.I.L Pass NFTs
- Transaction verification with staking support
- Required before other chain verifications

**Arbitrum**
- Schizo Sybils (Gen 1) collection
- Uses Monad-verified wallet address

**Berachain**
- Super Schizos (Gen 2) collection  
- Uses Monad-verified wallet address

## Requirements

- Node.js 18.0.0 or higher
- PostgreSQL database
- Discord bot token and server permissions
- Alchemy API keys for blockchain access

## Environment Variables

```
DISCORD_TOKEN=your_discord_bot_token
GUILD_ID=your_discord_server_id
VERIFIED_ROLE_ID=role_id_for_verified_users
ARBITRUM_ROLE_ID=role_id_for_arbitrum_holders
BERACHAIN_ROLE_ID=role_id_for_bera_holders
DATABASE_URL=postgresql://user:pass@host:port/dbname
MONAD_ALCHEMY_API_KEY=your_monad_api_key
ARBITRUM_ALCHEMY_API_KEY=your_arbitrum_api_key
BERA_RPC_URL=berachain_rpc_endpoint
```

## Installation

1. Clone the repository
2. Install dependencies: `npm install`
3. Configure environment variables
4. Start the bot: `npm start`

## Commands

- `/verify-holdings` - Start NFT verification process
- `/verification-status` - Check current verification status
- `/monad-config` - View Monad verification settings
- `/reset-verification` - Reset verification status (testing)

## Verification Process

1. Users select a blockchain network to verify
2. For Monad: wallet address input and transaction verification required
3. For other chains: automatically uses Monad-verified wallet
4. NFT ownership is checked via blockchain APIs
5. Discord roles are assigned upon successful verification

## Deployment

The bot is configured for Railway deployment with automatic health checks and database integration. See `railway.json` for deployment configuration.

## License

MIT License 