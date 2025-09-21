const keccak = require('keccak');

function getFunctionSelector(signature) {
    return '0x' + keccak('keccak256').update(signature).digest('hex').slice(0, 8);
}

console.log('🔧 Calculating Function Signatures:');
console.log('');

// Calculate signatures for the functions in your contract ABI
const functions = [
    'nftStakeCount(address)',
    'getStakedTokenIds(address)', 
    'totalNFTStakeCount()',
    'stakedTokenIds(address,uint256)',
    'firstStakeTimestamp(address)',
    'nftCollection()',
    'stakedNFT(uint256)'
];

functions.forEach(func => {
    const selector = getFunctionSelector(func);
    console.log(`${func.padEnd(35)} -> ${selector}`);
});

console.log('');
console.log('✅ Use these signatures in your contract calls!');

