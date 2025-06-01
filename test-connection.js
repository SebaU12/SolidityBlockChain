require('dotenv').config();
const { ethers } = require('ethers');

async function testSetup() {
    console.log('🚀 Iniciando verificación del setup...\n');

    try {
        // Configurar provider
        const provider = new ethers.JsonRpcProvider(process.env.NETWORK_RPC_URL);
        
        // Verificar conexión a la red
        console.log('📡 Verificando conexión a Moonbase Alpha...');
        const network = await provider.getNetwork();
        console.log(`✅ Conectado a: ${network.name} (Chain ID: ${network.chainId})\n`);

        // Verificar cuentas y balances
        const accounts = [
            { name: 'ÁRBITRO', address: process.env.ARBITRO_ADDRESS, key: process.env.ARBITRO_PRIVATE_KEY },
            { name: 'EMPRESA1', address: process.env.EMPRESA1_ADDRESS, key: process.env.EMPRESA1_PRIVATE_KEY },
            { name: 'EMPRESA2', address: process.env.EMPRESA2_ADDRESS, key: process.env.EMPRESA2_PRIVATE_KEY }
        ];

        console.log('👥 Verificando cuentas configuradas:\n');

        for (const account of accounts) {
            try {
                console.log(`--- ${account.name} ---`);
                console.log(`Dirección: ${account.address}`);
                
                // Verificar que la clave privada corresponde a la dirección
                const wallet = new ethers.Wallet(account.key);
                if (wallet.address.toLowerCase() === account.address.toLowerCase()) {
                    console.log('✅ Clave privada válida');
                } else {
                    console.log('❌ ERROR: Clave privada no coincide con la dirección');
                }

                // Verificar balance
                const balance = await provider.getBalance(account.address);
                const balanceInDev = ethers.formatEther(balance);
                console.log(`Balance: ${balanceInDev} DEV`);
                
                if (parseFloat(balanceInDev) > 0) {
                    console.log('✅ Tiene fondos suficientes');
                } else {
                    console.log('⚠️  ADVERTENCIA: Sin fondos - visita el faucet');
                }
                
                console.log('');
            } catch (error) {
                console.log(`❌ ERROR verificando ${account.name}: ${error.message}\n`);
            }
        }

        // Verificar configuración del puerto
        console.log('⚙️  Configuración del servidor:');
        console.log(`Puerto: ${process.env.PORT || 3000}`);
        console.log(`RPC URL: ${process.env.NETWORK_RPC_URL}`);
        console.log(`Chain ID: ${process.env.CHAIN_ID}\n`);

        console.log('🎉 ¡Verificación completada!');
        
    } catch (error) {
        console.error('❌ Error durante la verificación:', error.message);
        process.exit(1);
    }
}

testSetup();
