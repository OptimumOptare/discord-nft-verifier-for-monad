// Shared verification utilities

// Generate verification amount (random between 0.00000001 and 0.0000001 MON)
function generateVerificationAmount() {
    const min = 0.00000001; // 0.01 gwei
    const max = 0.0000001;  // 0.1 gwei
    const randomAmount = min + (Math.random() * (max - min));
    return Number(randomAmount.toFixed(10)); // 10 decimal places precision for smaller amounts
}

// Format amount for display (prevents scientific notation)
function formatAmountForDisplay(amount) {
    if (typeof amount !== 'number' || isNaN(amount)) {
        return 'Unknown';
    }
    return amount.toFixed(10).replace(/\.?0+$/, ''); // Remove trailing zeros
}

// Convert ETH amount to Wei (for blockchain queries)
function ethToWei(ethAmount) {
    return Math.floor(ethAmount * 1e18).toString();
}

// Validate Ethereum address format
function isValidEthereumAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}

module.exports = {
    generateVerificationAmount,
    formatAmountForDisplay,
    ethToWei,
    isValidEthereumAddress
}; 