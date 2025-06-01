require('dotenv').config();
const { ethers } = require('hardhat');

async function main() {
    console.log('🚀 Deploy simplificado del contrato EscrowContract...\n');

    // Obtener signers
    const [arbitro, empresa1, empresa2] = await ethers.getSigners();

    console.log('👥 Cuentas:');
    console.log(`Árbitro: ${arbitro.address}`);
    console.log(`Empresa1: ${empresa1.address}`);
    console.log(`Empresa2: ${empresa2.address}\n`);

    // Requerimientos simples para prueba
    const requirements = [
        "Documentación entregada",
        "Desarrollo completado",
        "Testing aprobado"
    ];

    try {
        console.log('🔨 Obteniendo factory del contrato...');
        const EscrowContract = await ethers.getContractFactory('EscrowContract');

        console.log('🚀 Desplegando contrato con gas alto...');
        
        // Deploy con configuración específica
        const escrowContract = await EscrowContract.deploy(
            empresa1.address,
            empresa2.address,
            requirements,
            {
                gasLimit: 5000000,  // 5M gas
                gasPrice: ethers.parseUnits('20', 'gwei')
            }
        );

        console.log('⏳ Esperando confirmación...');
        await escrowContract.waitForDeployment();

        const contractAddress = await escrowContract.getAddress();
        const txHash = escrowContract.deploymentTransaction().hash;

        console.log('\n🎉 ¡Deploy exitoso!');
        console.log('='.repeat(50));
        console.log(`📍 Dirección: ${contractAddress}`);
        console.log(`🔗 TX Hash: ${txHash}`);
        console.log(`🌐 Explorer: https://moonbase.moonscan.io/address/${contractAddress}`);
        console.log('='.repeat(50));

        // Verificar info básica
        console.log('\n✅ Verificando contrato...');
        const [descriptions] = await escrowContract.getAllRequirements();
        console.log(`📋 Requerimientos: ${descriptions.length}`);
        console.log(`🎯 Estado inicial: CREATED (0)`);

        console.log('\n🔧 Agregar al .env:');
        console.log(`CONTRACT_ADDRESS=${contractAddress}`);

        return {
            contractAddress,
            txHash,
            arbitro: arbitro.address,
            empresa1: empresa1.address,
            empresa2: empresa2.address
        };

    } catch (error) {
        console.error('\n❌ Error en deploy:', error.message);
        
        if (error.message.includes('gas')) {
            console.log('\n💡 Posibles soluciones:');
            console.log('1. Verificar que tienes suficiente DEV para gas');
            console.log('2. Intentar con un gas price más alto');
            console.log('3. Verificar conectividad con Moonbase Alpha');
        }
        
        if (error.message.includes('nonce')) {
            console.log('\n💡 Problema de nonce:');
            console.log('1. Reset account en MetaMask');
            console.log('2. Esperar unos minutos y reintentar');
        }
        
        throw error;
    }
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = main;
