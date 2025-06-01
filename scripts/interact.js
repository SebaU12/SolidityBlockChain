require('dotenv').config();
const { ethers } = require('hardhat');

async function main() {
    // Usar la dirección del contrato desde .env o la que desplegamos
    const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "0xF91020B0fD307d6dE5EAfF9cB496788B9A771EC6";
    
    if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === "0x...") {
        console.error('❌ Por favor, configura CONTRACT_ADDRESS en tu archivo .env');
        console.log('💡 Usa la dirección del contrato que desplegaste anteriormente');
        console.log('💡 Ejemplo: CONTRACT_ADDRESS=0xF91020B0fD307d6dE5EAfF9cB496788B9A771EC6');
        process.exit(1);
    }

    console.log('🔗 Interactuando con contrato en:', CONTRACT_ADDRESS);
    console.log('🌐 Red: Moonbase Alpha\n');

    try {
        // Obtener signers (cuentas configuradas)
        const [arbitro, empresa1, empresa2] = await ethers.getSigners();

        console.log('👥 Cuentas configuradas:');
        console.log(`Árbitro: ${arbitro.address}`);
        console.log(`Empresa1: ${empresa1.address}`);
        console.log(`Empresa2: ${empresa2.address}\n`);

        // Conectar con el contrato desplegado
        const EscrowContract = await ethers.getContractFactory('EscrowContract');
        const escrowContract = EscrowContract.attach(CONTRACT_ADDRESS);

        console.log('📊 Estado actual del contrato:');
        console.log('='.repeat(50));

        // Obtener información completa del contrato
        const contractInfo = await escrowContract.getContractInfo();
        const [descriptions, completed, times] = await escrowContract.getAllRequirements();
        const progress = await escrowContract.getProgress();

        // Mapear estados
        const states = ['CREATED', 'FUNDED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
        const currentState = states[Number(contractInfo[4])];

        console.log(`📍 Dirección del contrato: ${CONTRACT_ADDRESS}`);
        console.log(`🔗 Ver en explorer: https://moonbase.moonscan.io/address/${CONTRACT_ADDRESS}`);
        console.log(`👤 Árbitro: ${contractInfo[0]}`);
        console.log(`🏢 Empresa1 (Depositor): ${contractInfo[1]}`);
        console.log(`🏬 Empresa2 (Beneficiary): ${contractInfo[2]}`);
        console.log(`💰 Monto depositado: ${ethers.formatEther(contractInfo[3])} DEV`);
        console.log(`📊 Estado: ${currentState} (${Number(contractInfo[4])})`);
        console.log(`📈 Progreso: ${progress}%`);
        console.log(`📋 Requerimientos: ${Number(contractInfo[6])}/${Number(contractInfo[5])} completados`);
        console.log(`💵 Balance actual: ${ethers.formatEther(contractInfo[7])} DEV`);
        
        if (Number(contractInfo[8]) > 0) {
            console.log(`📅 Creado: ${new Date(Number(contractInfo[8]) * 1000).toLocaleString()}`);
        }
        
        if (Number(contractInfo[9]) > 0) {
            console.log(`✅ Completado: ${new Date(Number(contractInfo[9]) * 1000).toLocaleString()}`);
        }

        console.log('\n📋 Lista de Requerimientos:');
        console.log('-'.repeat(50));
        for (let i = 0; i < descriptions.length; i++) {
            const status = completed[i] ? '✅' : '⏳';
            const timeStr = completed[i] && Number(times[i]) > 0 
                ? ` (completado: ${new Date(Number(times[i]) * 1000).toLocaleString()})`
                : '';
            console.log(`${i}. ${status} ${descriptions[i]}${timeStr}`);
        }

        // Mostrar balances de las cuentas
        console.log('\n💰 Balances de cuentas:');
        console.log('-'.repeat(30));
        const arbitroBalance = await ethers.provider.getBalance(arbitro.address);
        const empresa1Balance = await ethers.provider.getBalance(empresa1.address);
        const empresa2Balance = await ethers.provider.getBalance(empresa2.address);

        console.log(`Árbitro: ${ethers.formatEther(arbitroBalance)} DEV`);
        console.log(`Empresa1: ${ethers.formatEther(empresa1Balance)} DEV`);
        console.log(`Empresa2: ${ethers.formatEther(empresa2Balance)} DEV`);

        // Mostrar acciones disponibles según el estado
        console.log('\n🎯 Acciones disponibles:');
        console.log('-'.repeat(30));
        
        switch (Number(contractInfo[4])) {
            case 0: // CREATED
                console.log('📝 Estado: CREATED - Esperando depósito');
                console.log('✅ Empresa1 puede depositar fondos');
                console.log('❌ Árbitro puede cancelar el contrato');
                console.log('\n💡 Comando para depositar:');
                console.log(`node scripts/deposit-funds.js ${CONTRACT_ADDRESS} 1.0`);
                break;
                
            case 2: // IN_PROGRESS
                console.log('🔄 Estado: IN_PROGRESS - Fondos depositados');
                console.log('✅ Árbitro puede completar requerimientos pendientes');
                console.log('❌ Árbitro puede cancelar el contrato');
                
                // Mostrar requerimientos pendientes
                const pendingRequirements = [];
                for (let i = 0; i < completed.length; i++) {
                    if (!completed[i]) {
                        pendingRequirements.push(i);
                    }
                }
                
                if (pendingRequirements.length > 0) {
                    console.log('\n📋 Requerimientos pendientes:');
                    pendingRequirements.forEach(id => {
                        console.log(`   • ID ${id}: ${descriptions[id]}`);
                    });
                    
                    console.log('\n💡 Comandos para completar requerimientos:');
                    console.log('# Usando API (servidor debe estar corriendo):');
                    pendingRequirements.slice(0, 3).forEach(id => {
                        console.log(`curl -X POST http://localhost:3000/api/contracts/${CONTRACT_ADDRESS}/complete/${id}`);
                    });
                    
                    console.log('\n# O usando Hardhat directamente:');
                    console.log(`node -e "
const { ethers } = require('hardhat');
async function complete() {
    const [arbitro] = await ethers.getSigners();
    const contract = await ethers.getContractAt('EscrowContract', '${CONTRACT_ADDRESS}');
    const tx = await contract.connect(arbitro).completeRequirement(${pendingRequirements[0]});
    console.log('TX:', tx.hash);
    await tx.wait();
    console.log('✅ Completado!');
}
complete().catch(console.error);
"`);
                }
                break;
                
            case 3: // COMPLETED
                console.log('🎉 Estado: COMPLETED - ¡Contrato finalizado exitosamente!');
                console.log('✅ Todos los requerimientos completados');
                console.log('✅ Fondos transferidos a Empresa2');
                console.log('ℹ️  No se pueden realizar más acciones');
                break;
                
            case 4: // CANCELLED
                console.log('❌ Estado: CANCELLED - Contrato cancelado');
                console.log('✅ Fondos devueltos a Empresa1');
                console.log('ℹ️  No se pueden realizar más acciones');
                break;
                
            default:
                console.log('❓ Estado desconocido');
                break;
        }

        // Información adicional útil
        console.log('\n🔗 Enlaces útiles:');
        console.log('-'.repeat(20));
        console.log(`📱 Explorer del contrato: https://moonbase.moonscan.io/address/${CONTRACT_ADDRESS}`);
        console.log(`🎛️  Remix IDE: https://remix.ethereum.org/`);
        console.log(`💧 Faucet: https://apps.moonbeam.network/moonbase-alpha/faucet/`);
        
        // Verificar si el backend está corriendo
        console.log('\n⚙️  Verificando backend API...');
        try {
            const axios = require('axios');
            const response = await axios.get(`http://localhost:${process.env.PORT || 3000}/api/health`, { timeout: 3000 });
            console.log('✅ Backend API está corriendo');
            console.log(`📍 URL: http://localhost:${process.env.PORT || 3000}/api`);
        } catch (apiError) {
            console.log('❌ Backend API no está corriendo');
            console.log('💡 Inicia el servidor con: node server.js');
        }

        console.log('\n' + '='.repeat(50));
        console.log('📊 Resumen del estado actual:');
        console.log(`• Contrato: ${currentState}`);
        console.log(`• Progreso: ${progress}%`);
        console.log(`• Balance: ${ethers.formatEther(contractInfo[7])} DEV`);
        console.log(`• Requerimientos: ${Number(contractInfo[6])}/${Number(contractInfo[5])}`);
        console.log('='.repeat(50));

    } catch (error) {
        console.error('\n❌ Error interactuando con el contrato:');
        console.error(error.message);
        
        if (error.message.includes('call revert exception')) {
            console.log('\n💡 Posibles causas:');
            console.log('• El contrato no está desplegado en esta dirección');
            console.log('• La dirección del contrato es incorrecta');
            console.log('• Problemas de conectividad con Moonbase Alpha');
            
            console.log('\n🔧 Soluciones:');
            console.log('• Verifica CONTRACT_ADDRESS en tu .env');
            console.log('• Confirma que el contrato existe en el explorer');
            console.log('• Intenta desplegar un nuevo contrato si es necesario');
        }
        
        if (error.message.includes('network')) {
            console.log('\n💡 Problema de red:');
            console.log('• Verifica tu conexión a internet');
            console.log('• Confirma que Moonbase Alpha esté funcionando');
            console.log('• Revisa NETWORK_RPC_URL en tu .env');
        }
        
        process.exit(1);
    }
}

// Función auxiliar para completar un requerimiento específico
async function completeRequirement(contractAddress, requirementId) {
    try {
        const [arbitro] = await ethers.getSigners();
        const contract = await ethers.getContractAt('EscrowContract', contractAddress);
        
        console.log(`📝 Completando requerimiento ${requirementId}...`);
        const tx = await contract.connect(arbitro).completeRequirement(requirementId);
        console.log(`⏳ TX enviada: ${tx.hash}`);
        
        await tx.wait();
        console.log(`✅ Requerimiento ${requirementId} completado!`);
        
        return tx.hash;
    } catch (error) {
        console.error(`❌ Error completando requerimiento: ${error.message}`);
        throw error;
    }
}

// Exportar funciones para uso en otros scripts
module.exports = {
    main,
    completeRequirement
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
