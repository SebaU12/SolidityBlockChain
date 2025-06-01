require('dotenv').config();
const { ethers } = require('hardhat');

async function main() {
    // Reemplaza esta dirección con la del contrato desplegado
    const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "0x...";
    
    if (CONTRACT_ADDRESS === "0x...") {
        console.error('❌ Por favor, configura CONTRACT_ADDRESS en tu archivo .env');
        console.log('💡 Ejecuta el script de deploy primero: npx hardhat run scripts/deploy.js --network moonbase');
        process.exit(1);
    }

    console.log('🔗 Conectando con el contrato en:', CONTRACT_ADDRESS);

    // Obtener signers
    const [arbitro, empresa1, empresa2] = await ethers.getSigners();

    // Conectar con el contrato desplegado
    const EscrowContract = await ethers.getContractFactory('EscrowContract');
    const escrowContract = EscrowContract.attach(CONTRACT_ADDRESS);

    console.log('\n📊 Estado actual del contrato:');
    console.log('='.repeat(40));

    try {
        // Obtener información del contrato
        const contractInfo = await escrowContract.getContractInfo();
        const [descriptions, completed, times] = await escrowContract.getAllRequirements();

        console.log(`Árbitro: ${contractInfo[0]}`);
        console.log(`Empresa1: ${contractInfo[1]}`);
        console.log(`Empresa2: ${contractInfo[2]}`);
        console.log(`Monto depositado: ${ethers.formatEther(contractInfo[3])} DEV`);
        
        const states = ['CREATED', 'FUNDED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
        console.log(`Estado: ${states[contractInfo[4]]}`);
        
        console.log(`Total requerimientos: ${contractInfo[5]}`);
        console.log(`Completados: ${contractInfo[6]}`);
        console.log(`Balance actual: ${ethers.formatEther(contractInfo[7])} DEV`);
        console.log(`Progreso: ${await escrowContract.getProgress()}%`);

        console.log('\n📋 Requerimientos:');
        for (let i = 0; i < descriptions.length; i++) {
            const status = completed[i] ? '✅' : '⏳';
            const timeStr = completed[i] && times[i] > 0 
                ? ` (${new Date(Number(times[i]) * 1000).toLocaleString()})`
                : '';
            console.log(`${i + 1}. ${status} ${descriptions[i]}${timeStr}`);
        }

        // Mostrar balances de las cuentas
        console.log('\n💰 Balances de cuentas:');
        const arbitroBalance = await ethers.provider.getBalance(arbitro.address);
        const empresa1Balance = await ethers.provider.getBalance(empresa1.address);
        const empresa2Balance = await ethers.provider.getBalance(empresa2.address);

        console.log(`Árbitro: ${ethers.formatEther(arbitroBalance)} DEV`);
        console.log(`Empresa1: ${ethers.formatEther(empresa1Balance)} DEV`);
        console.log(`Empresa2: ${ethers.formatEther(empresa2Balance)} DEV`);

        // Mostrar acciones disponibles según el estado
        console.log('\n🎯 Acciones disponibles:');
        const currentState = contractInfo[4];
        
        switch (Number(currentState)) {
            case 0: // CREATED
                console.log('• Empresa1 puede depositar fondos');
                console.log('• Árbitro puede cancelar el contrato');
                break;
            case 2: // IN_PROGRESS
                console.log('• Árbitro puede completar requerimientos pendientes');
                console.log('• Árbitro puede cancelar el contrato');
                const pendingRequirements = descriptions.map((desc, index) => 
                    !completed[index] ? index : null
                ).filter(index => index !== null);
                if (pendingRequirements.length > 0) {
                    console.log(`• Requerimientos pendientes: ${pendingRequirements.join(', ')}`);
                }
                break;
            case 3: // COMPLETED
                console.log('• ✅ Contrato completado - Fondos transferidos a Empresa2');
                break;
            case 4: // CANCELLED
                console.log('• ❌ Contrato cancelado - Fondos devueltos a Empresa1');
                break;
        }

        console.log('\n🔗 Enlaces útiles:');
        console.log(`• Ver contrato: https://moonbase.moonscan.io/address/${CONTRACT_ADDRESS}`);
        console.log(`• Interactuar con Remix: https://remix.ethereum.org/`);

    } catch (error) {
        console.error('❌ Error al consultar el contrato:', error.message);
        
        if (error.message.includes('call revert exception')) {
            console.log('💡 El contrato puede no estar desplegado en esta dirección');
            console.log('💡 Verifica que CONTRACT_ADDRESS sea correcto en tu .env');
        }
    }
}

// Función para completar un requerimiento específico
async function completeRequirement(contractAddress, requirementId) {
    const [arbitro] = await ethers.getSigners();
    const EscrowContract = await ethers.getContractFactory('EscrowContract');
    const escrowContract = EscrowContract.attach(contractAddress);

    try {
        console.log(`📝 Completando requerimiento ${requirementId}...`);
        
        const tx = await escrowContract.connect(arbitro).completeRequirement(requirementId);
        console.log(`⏳ Transacción enviada: ${tx.hash}`);
        
        const receipt = await tx.wait();
        console.log(`✅ Requerimiento ${requirementId} completado exitosamente!`);
        console.log(`⛽ Gas usado: ${receipt.gasUsed}`);
        
        // Verificar si el contrato se completó automáticamente
        const contractInfo = await escrowContract.getContractInfo();
        if (contractInfo[4] === 3n) { // COMPLETED
            console.log('🎉 ¡Todos los requerimientos completados! Fondos transferidos a Empresa2');
        }
        
    } catch (error) {
        console.error('❌ Error al completar requerimiento:', error.message);
    }
}

// Función para depositar fondos (ejecutar desde Empresa1)
async function depositFunds(contractAddress, amountInDev) {
    const [, empresa1] = await ethers.getSigners();
    const EscrowContract = await ethers.getContractFactory('EscrowContract');
    const escrowContract = EscrowContract.attach(contractAddress);

    try {
        const amount = ethers.parseEther(amountInDev.toString());
        console.log(`💰 Depositando ${amountInDev} DEV...`);
        
        const tx = await escrowContract.connect(empresa1).depositFunds({ value: amount });
        console.log(`⏳ Transacción enviada: ${tx.hash}`);
        
        const receipt = await tx.wait();
        console.log(`✅ Fondos depositados exitosamente!`);
        console.log(`⛽ Gas usado: ${receipt.gasUsed}`);
        
    } catch (error) {
        console.error('❌ Error al depositar fondos:', error.message);
    }
}

// Exportar funciones para uso en otros scripts
module.exports = {
    main,
    completeRequirement,
    depositFunds
};

// Ejecutar si es llamado directamente
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}
