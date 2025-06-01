require('dotenv').config();
const { ethers } = require('hardhat');

async function main() {
    console.log('🚀 Iniciando deployment del contrato EscrowContract...\n');

    // Obtener signers (cuentas configuradas)
    const [arbitro, empresa1, empresa2] = await ethers.getSigners();

    console.log('👥 Cuentas configuradas:');
    console.log(`Árbitro: ${arbitro.address}`);
    console.log(`Empresa1: ${empresa1.address}`);
    console.log(`Empresa2: ${empresa2.address}\n`);

    // Verificar balances
    console.log('💰 Verificando balances:');
    const arbitroBalance = await ethers.provider.getBalance(arbitro.address);
    const empresa1Balance = await ethers.provider.getBalance(empresa1.address);
    const empresa2Balance = await ethers.provider.getBalance(empresa2.address);

    console.log(`Árbitro: ${ethers.formatEther(arbitroBalance)} DEV`);
    console.log(`Empresa1: ${ethers.formatEther(empresa1Balance)} DEV`);
    console.log(`Empresa2: ${ethers.formatEther(empresa2Balance)} DEV\n`);

    // Verificar que el árbitro tenga fondos suficientes para el deploy
    if (parseFloat(ethers.formatEther(arbitroBalance)) < 0.1) {
        console.error('❌ Error: El árbitro necesita al menos 0.1 DEV para hacer el deploy');
        console.log('💡 Obtén más fondos del faucet: https://apps.moonbeam.network/moonbase-alpha/faucet/');
        process.exit(1);
    }

    // Requerimientos de ejemplo para el contrato de prueba
    const requirements = [
        "Entregar documentación técnica completa",
        "Completar desarrollo del módulo principal",
        "Pasar todas las pruebas de calidad",
        "Realizar deployment en ambiente de staging",
        "Obtener aprobación final del cliente"
    ];

    console.log('📋 Requerimientos del contrato:');
    requirements.forEach((req, index) => {
        console.log(`${index + 1}. ${req}`);
    });
    console.log('');

    try {
        // Obtener la factory del contrato
        console.log('🔨 Compilando contrato...');
        const EscrowContract = await ethers.getContractFactory('EscrowContract');

        // Estimar gas para el deployment
        console.log('⛽ Estimando gas para deployment...');
        const deploymentData = EscrowContract.interface.encodeDeploy([
            empresa1.address,
            empresa2.address,
            requirements
        ]);
        
        const gasEstimate = await ethers.provider.estimateGas({
            data: deploymentData
        });
        
        console.log(`Gas estimado: ${gasEstimate.toString()}`);
        console.log(`Costo estimado: ~${ethers.formatEther(gasEstimate * 20000000000n)} DEV\n`);

        // Desplegar el contrato
        console.log('🚀 Desplegando contrato...');
        const escrowContract = await EscrowContract.deploy(
            empresa1.address,
            empresa2.address,
            requirements,
            {
                gasLimit: 3000000, // Gas limit fijo más alto
                gasPrice: 20000000000 // 20 gwei
            }
        );

        // Esperar confirmación
        console.log('⏳ Esperando confirmación en blockchain...');
        await escrowContract.waitForDeployment();

        const contractAddress = await escrowContract.getAddress();

        console.log('\n🎉 ¡Contrato desplegado exitosamente!');
        console.log('='.repeat(50));
        console.log(`📍 Dirección del contrato: ${contractAddress}`);
        console.log(`🔗 Ver en explorer: https://moonbase.moonscan.io/address/${contractAddress}`);
        console.log(`⛽ Gas usado: ${(await escrowContract.deploymentTransaction().wait()).gasUsed}`);
        console.log(`📝 Hash de transacción: ${escrowContract.deploymentTransaction().hash}`);
        console.log('='.repeat(50));

        // Verificar información del contrato
        console.log('\n✅ Verificando información del contrato...');
        const contractInfo = await escrowContract.getContractInfo();
        
        console.log('\n📊 Información del contrato:');
        console.log(`Árbitro: ${contractInfo[0]}`);
        console.log(`Empresa1: ${contractInfo[1]}`);
        console.log(`Empresa2: ${contractInfo[2]}`);
        console.log(`Estado: ${contractInfo[4]} (0=CREATED, 1=FUNDED, 2=IN_PROGRESS, 3=COMPLETED, 4=CANCELLED)`);
        console.log(`Total requerimientos: ${contractInfo[5]}`);
        console.log(`Requerimientos completados: ${contractInfo[6]}`);
        console.log(`Balance del contrato: ${ethers.formatEther(contractInfo[7])} DEV`);

        // Guardar información para uso posterior
        const deploymentInfo = {
            contractAddress: contractAddress,
            transactionHash: escrowContract.deploymentTransaction().hash,
            arbitro: arbitro.address,
            empresa1: empresa1.address,
            empresa2: empresa2.address,
            requirements: requirements,
            deployedAt: new Date().toISOString(),
            network: 'moonbase-alpha'
        };

        // Mostrar información para el archivo .env
        console.log('\n🔧 Agregar al archivo .env:');
        console.log(`CONTRACT_ADDRESS=${contractAddress}`);

        // Mostrar próximos pasos
        console.log('\n🎯 Próximos pasos:');
        console.log('1. Empresa1 debe depositar fondos usando la función depositFunds()');
        console.log('2. El árbitro puede completar requerimientos usando completeRequirement()');
        console.log('3. Cuando todos los requerimientos estén completados, los fondos se transferirán automáticamente a Empresa2');

        console.log('\n💡 Comandos útiles:');
        console.log('• Ver contrato en explorer:', `https://moonbase.moonscan.io/address/${contractAddress}`);
        console.log('• Interactuar con Remix:', 'https://remix.ethereum.org/');

        return deploymentInfo;

    } catch (error) {
        console.error('\n❌ Error durante el deployment:');
        console.error(error.message);
        
        if (error.message.includes('insufficient funds')) {
            console.log('\n💡 Solución: Obtén más DEV tokens del faucet:');
            console.log('https://apps.moonbeam.network/moonbase-alpha/faucet/');
        }
        
        process.exit(1);
    }
}

// Ejecutar el script
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = main;
