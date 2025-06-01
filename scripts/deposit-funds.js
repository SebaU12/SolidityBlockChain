require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

async function depositFunds(contractAddress, amountInDev) {
    console.log('💰 Iniciando depósito de fondos...\n');
    
    try {
        // Configurar provider y signer de Empresa1
        const provider = new ethers.JsonRpcProvider(process.env.NETWORK_RPC_URL);
        const empresa1Signer = new ethers.Wallet(process.env.EMPRESA1_PRIVATE_KEY, provider);
        
        console.log(`👤 Empresa1: ${empresa1Signer.address}`);
        console.log(`📍 Contrato: ${contractAddress}`);
        console.log(`💵 Monto: ${amountInDev} DEV\n`);
        
        // Cargar ABI del contrato
        const artifactPath = path.join(__dirname, '../artifacts/contracts/EscrowContract.sol/EscrowContract.json');
        const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        
        // Conectar con el contrato
        const contract = new ethers.Contract(contractAddress, artifact.abi, empresa1Signer);
        
        // Verificar estado del contrato
        console.log('🔍 Verificando estado del contrato...');
        const contractInfo = await contract.getContractInfo();
        const states = ['CREATED', 'FUNDED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
        const currentState = states[Number(contractInfo[4])];
        
        console.log(`Estado actual: ${currentState}`);
        
        if (Number(contractInfo[4]) !== 0) { // No está en CREATED
            console.log('❌ Error: Solo se pueden depositar fondos en contratos en estado CREATED');
            console.log(`Estado actual: ${currentState}`);
            return;
        }
        
        // Verificar balance de Empresa1
        const empresa1Balance = await provider.getBalance(empresa1Signer.address);
        const empresa1BalanceDev = parseFloat(ethers.formatEther(empresa1Balance));
        const depositAmount = parseFloat(amountInDev);
        
        console.log(`Balance de Empresa1: ${empresa1BalanceDev} DEV`);
        
        if (empresa1BalanceDev < depositAmount + 0.01) { // 0.01 DEV para gas
            console.log('❌ Error: Balance insuficiente para depósito + gas');
            console.log(`Necesario: ${depositAmount + 0.01} DEV (incluyendo gas)`);
            console.log(`Disponible: ${empresa1BalanceDev} DEV`);
            return;
        }
        
        // Convertir monto a wei
        const amountWei = ethers.parseEther(amountInDev.toString());
        
        // Estimar gas
        console.log('⛽ Estimando gas...');
        const gasEstimate = await contract.depositFunds.estimateGas({ value: amountWei });
        console.log(`Gas estimado: ${gasEstimate.toString()}`);
        
        // Ejecutar depósito
        console.log('🚀 Ejecutando depósito...');
        const tx = await contract.depositFunds({
            value: amountWei,
            gasLimit: gasEstimate * 110n / 100n // 10% extra por seguridad
        });
        
        console.log(`⏳ Transacción enviada: ${tx.hash}`);
        console.log('🔗 Ver en explorer: https://moonbase.moonscan.io/tx/' + tx.hash);
        
        // Esperar confirmación
        console.log('⏳ Esperando confirmación...');
        const receipt = await tx.wait();
        
        console.log('\n🎉 ¡Depósito exitoso!');
        console.log('='.repeat(50));
        console.log(`💰 Monto depositado: ${amountInDev} DEV`);
        console.log(`⛽ Gas usado: ${receipt.gasUsed.toString()}`);
        console.log(`📦 Bloque: ${receipt.blockNumber}`);
        console.log(`🔗 TX Hash: ${tx.hash}`);
        console.log('='.repeat(50));
        
        // Verificar nuevo estado
        console.log('\n📊 Verificando nuevo estado del contrato...');
        const updatedInfo = await contract.getContractInfo();
        const newState = states[Number(updatedInfo[4])];
        
        console.log(`Estado actualizado: ${newState}`);
        console.log(`Balance del contrato: ${ethers.formatEther(updatedInfo[7])} DEV`);
        console.log(`Monto registrado: ${ethers.formatEther(updatedInfo[3])} DEV`);
        
        // Mostrar requerimientos
        const [descriptions, completed] = await contract.getAllRequirements();
        console.log('\n📋 Requerimientos pendientes:');
        descriptions.forEach((desc, index) => {
            const status = completed[index] ? '✅' : '⏳';
            console.log(`${index}. ${status} ${desc}`);
        });
        
        console.log('\n🎯 Próximos pasos:');
        console.log('1. El árbitro puede completar requerimientos usando:');
        console.log(`   POST /api/contracts/${contractAddress}/complete/{requirementId}`);
        console.log('2. Una vez completados todos, los fondos se transferirán automáticamente a Empresa2');
        console.log('3. El árbitro puede cancelar el contrato si es necesario:');
        console.log(`   POST /api/contracts/${contractAddress}/cancel`);
        
        return {
            success: true,
            transactionHash: tx.hash,
            gasUsed: receipt.gasUsed.toString(),
            newState,
            contractBalance: ethers.formatEther(updatedInfo[7])
        };
        
    } catch (error) {
        console.error('\n❌ Error durante el depósito:');
        console.error(error.message);
        
        if (error.message.includes('Solo Empresa1 puede ejecutar')) {
            console.log('\n💡 Este contrato solo permite que Empresa1 deposite fondos');
            console.log('Verifica que estés usando la cuenta correcta');
        }
        
        if (error.message.includes('El monto debe ser mayor a 0')) {
            console.log('\n💡 El monto debe ser mayor a 0 DEV');
        }
        
        if (error.message.includes('insufficient funds')) {
            console.log('\n💡 Fondos insuficientes. Obtén más DEV del faucet:');
            console.log('https://apps.moonbeam.network/moonbase-alpha/faucet/');
        }
        
        return { success: false, error: error.message };
    }
}

// Función principal
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
        console.log('❌ Uso: node scripts/deposit-funds.js <CONTRACT_ADDRESS> <AMOUNT_IN_DEV>');
        console.log('📝 Ejemplo: node scripts/deposit-funds.js 0x123... 1.5');
        
        // Usar valores por defecto si están disponibles
        if (process.env.CONTRACT_ADDRESS && process.env.CONTRACT_ADDRESS !== '0x...') {
            console.log('\n💡 Usando CONTRACT_ADDRESS del .env...');
            await depositFunds(process.env.CONTRACT_ADDRESS, '1.0');
        } else {
            console.log('\n💡 O configura CONTRACT_ADDRESS en tu .env para usar valores por defecto');
        }
        return;
    }
    
    const contractAddress = args[0];
    const amount = args[1];
    
    // Validar dirección
    if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
        console.error('❌ Dirección de contrato inválida');
        return;
    }
    
    // Validar monto
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
        console.error('❌ Monto inválido. Debe ser un número positivo');
        return;
    }
    
    await depositFunds(contractAddress, amount);
}

// Ejecutar si es llamado directamente
if (require.main === module) {
    main().catch(console.error);
}

module.exports = depositFunds;
