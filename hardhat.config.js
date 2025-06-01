require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.19",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      }
    ]
  },
  networks: {
    hardhat: {
      // Red local para testing
    },
    moonbase: {
      url: process.env.NETWORK_RPC_URL || "https://rpc.api.moonbase.moonbeam.network",
      chainId: parseInt(process.env.CHAIN_ID) || 1287,
      accounts: [
        process.env.ARBITRO_PRIVATE_KEY,
        process.env.EMPRESA1_PRIVATE_KEY,
        process.env.EMPRESA2_PRIVATE_KEY
      ].filter(key => key && key !== 'undefined'), // Filtrar claves vacías
      gas: 5000000, // Aumentar gas limit
      gasPrice: 20000000000, // 20 gwei
      timeout: 60000, // 60 segundos timeout
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 40000
  }
};
