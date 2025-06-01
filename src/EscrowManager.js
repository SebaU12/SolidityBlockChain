const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

class EscrowManager {
    constructor() {
        this.provider = null;
        this.arbitroSigner = null;
        this.contractABI = null;
        this.contractBytecode = null;
        
        // Direcciones de las cuentas
        this.addresses = {
            arbitro: process.env.ARBITRO_ADDRESS,
            empresa1: process.env.EMPRESA1_ADDRESS,
            empresa2: process.env.EMPRESA2_ADDRESS
        };
        
        // Claves privadas
        this.privateKeys = {
            arbitro: process.env.ARBITRO_PRIVATE_KEY,
            empresa1: process.env.EMPRESA1_PRIVATE_KEY,
            empresa2: process.env.EMPRESA2_PRIVATE_KEY
        };
    }

    async initialize() {
        try {
            console.log('🔧 Inicializando EscrowManager...');
            
            // Configurar provider
            this.provider = new ethers.JsonRpcProvider(process.env.NETWORK_RPC_URL);
            
            // Verificar conexión
            const network = await this.provider.getNetwork();
            console.log(`✅ Conectado a: ${network.name} (Chain ID: ${network.chainId})`);
            
            // Configurar signer del árbitro
            if (!this.privateKeys.arbitro) {
                throw new Error('ARBITRO_PRIVATE_KEY no configurada en .env');
            }
            
            this.arbitroSigner = new ethers.Wallet(this.privateKeys.arbitro, this.provider);
            console.log(`👤 Árbitro configurado: ${this.arbitroSigner.address}`);
            
            // Cargar ABI y bytecode del contrato
            await this.loadContractArtifacts();
            
            console.log('🎉 EscrowManager inicializado correctamente');
            
        } catch (error) {
            console.error('❌ Error inicializando EscrowManager:', error.message);
            throw error;
        }
    }

    async loadContractArtifacts() {
        try {
            // Ruta al artifact compilado por Hardhat
            const artifactPath = path.join(__dirname, '../artifacts/contracts/EscrowContract.sol/EscrowContract.json');
            
            if (!fs.existsSync(artifactPath)) {
                throw new Error(`Artifact no encontrado en: ${artifactPath}. Ejecuta 'npx hardhat compile' primero.`);
            }
            
            const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
            this.contractABI = artifact.abi;
            this.contractBytecode = artifact.bytecode;
            
            console.log('📜 Artifacts del contrato cargados correctamente');
            
        } catch (error) {
            console.error('❌ Error cargando artifacts:', error.message);
            throw error;
        }
    }

    // ========================================
    // FUNCIONES DE INFORMACIÓN GENERAL
    // ========================================

    async getNetworkInfo() {
        const network = await this.provider.getNetwork();
        const blockNumber = await this.provider.getBlockNumber();
        const gasPrice = await this.provider.getFeeData();
        
        return {
            name: network.name,
            chainId: network.chainId.toString(),
            blockNumber,
            gasPrice: ethers.formatUnits(gasPrice.gasPrice, 'gwei') + ' gwei'
        };
    }

    async getArbitroInfo() {
        const balance = await this.provider.getBalance(this.arbitroSigner.address);
        
        return {
            address: this.arbitroSigner.address,
            balance: ethers.formatEther(balance) + ' DEV'
        };
    }

    async getBalance(address) {
        const balance = await this.provider.getBalance(address);
        return {
            wei: balance.toString(),
            formatted: ethers.formatEther(balance)
        };
    }

    // ========================================
    // FUNCIONES DE GESTIÓN DE CONTRATOS
    // ========================================

    async deployContract(empresa1Address, empresa2Address, requirements) {
        try {
            console.log('🚀 Iniciando deploy de contrato...');
            
            // Crear factory del contrato
            const contractFactory = new ethers.ContractFactory(
                this.contractABI,
                this.contractBytecode,
                this.arbitroSigner
            );
            
            // Estimar gas
            const gasEstimate = await contractFactory.getDeployTransaction(
                empresa1Address,
                empresa2Address,
                requirements
            ).then(tx => this.provider.estimateGas(tx));
            
            console.log(`⛽ Gas estimado: ${gasEstimate.toString()}`);
            
            // Desplegar contrato
            const contract = await contractFactory.deploy(
                empresa1Address,
                empresa2Address,
                requirements,
                {
                    gasLimit: gasEstimate * 120n / 100n // 20% extra por seguridad
                }
            );
            
            // Esperar confirmación
            await contract.waitForDeployment();
            const contractAddress = await contract.getAddress();
            const deployTx = contract.deploymentTransaction();
            
            console.log(`✅ Contrato desplegado en: ${contractAddress}`);
            
            return {
                contractAddress,
                transactionHash: deployTx.hash,
                arbitro: this.arbitroSigner.address,
                empresa1: empresa1Address,
                empresa2: empresa2Address,
                requirements,
                gasUsed: (await deployTx.wait()).gasUsed.toString()
            };
            
        } catch (error) {
            console.error('❌ Error en deploy:', error.message);
            throw new Error(`Error desplegando contrato: ${error.message}`);
        }
    }

    async getContractInfo(contractAddress) {
        try {
            // Conectar con el contrato existente
            const contract = new ethers.Contract(contractAddress, this.contractABI, this.provider);
            
            // Obtener información básica
            const contractInfo = await contract.getContractInfo();
            const [descriptions, completed, completedTimes] = await contract.getAllRequirements();
            const progress = await contract.getProgress();
            
            // Mapear estados
            const states = ['CREATED', 'FUNDED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
            const currentState = states[Number(contractInfo[4])];
            
            return {
                arbitro: contractInfo[0],
                empresa1: contractInfo[1],
                empresa2: contractInfo[2],
                amount: ethers.formatEther(contractInfo[3]),
                state: currentState,
                stateCode: Number(contractInfo[4]),
                totalRequirements: Number(contractInfo[5]),
                completedRequirements: Number(contractInfo[6]),
                balance: ethers.formatEther(contractInfo[7]),
                createdTime: Number(contractInfo[8]),
                completedTime: Number(contractInfo[9]),
                progress: Number(progress),
                requirements: {
                    descriptions: descriptions,
                    completed: completed,
                    completedTimes: completedTimes.map(time => Number(time))
                }
            };
            
        } catch (error) {
            console.error('❌ Error obteniendo info del contrato:', error.message);
            throw new Error(`Error consultando contrato: ${error.message}`);
        }
    }

    async completeRequirement(contractAddress, requirementId) {
        try {
            // Conectar con el contrato como árbitro
            const contract = new ethers.Contract(contractAddress, this.contractABI, this.arbitroSigner);
            
            // Verificar que el requerimiento existe y no está completado
            const requirement = await contract.getRequirement(requirementId);
            if (requirement.completed) {
                throw new Error('Requerimiento ya completado');
            }
            
            console.log(`📝 Completando requerimiento ${requirementId}: "${requirement.description}"`);
            
            // Estimar gas
            const gasEstimate = await contract.completeRequirement.estimateGas(requirementId);
            
            // Ejecutar transacción
            const tx = await contract.completeRequirement(requirementId, {
                gasLimit: gasEstimate * 110n / 100n // 10% extra
            });
            
            console.log(`⏳ Transacción enviada: ${tx.hash}`);
            
            // Esperar confirmación
            const receipt = await tx.wait();
            
            // Verificar si el contrato se completó automáticamente
            const contractInfo = await contract.getContractInfo();
            const isCompleted = Number(contractInfo[4]) === 3; // COMPLETED
            
            console.log(`✅ Requerimiento ${requirementId} completado`);
            if (isCompleted) {
                console.log('🎉 ¡Todos los requerimientos completados! Contrato finalizado automáticamente.');
            }
            
            return {
                transactionHash: tx.hash,
                requirementId,
                gasUsed: receipt.gasUsed.toString(),
                contractCompleted: isCompleted,
                blockNumber: receipt.blockNumber
            };
            
        } catch (error) {
            console.error('❌ Error completando requerimiento:', error.message);
            throw new Error(`Error completando requerimiento: ${error.message}`);
        }
    }

    async cancelContract(contractAddress) {
        try {
            // Conectar con el contrato como árbitro
            const contract = new ethers.Contract(contractAddress, this.contractABI, this.arbitroSigner);
            
            // Verificar estado actual
            const contractInfo = await contract.getContractInfo();
            const currentState = Number(contractInfo[4]);
            
            if (currentState === 3) { // COMPLETED
                throw new Error('No se puede cancelar un contrato completado');
            }
            if (currentState === 4) { // CANCELLED
                throw new Error('El contrato ya está cancelado');
            }
            
            console.log(`❌ Cancelando contrato en estado: ${currentState}`);
            
            // Estimar gas
            const gasEstimate = await contract.cancelContract.estimateGas();
            
            // Ejecutar transacción
            const tx = await contract.cancelContract({
                gasLimit: gasEstimate * 110n / 100n
            });
            
            console.log(`⏳ Transacción de cancelación enviada: ${tx.hash}`);
            
            // Esperar confirmación
            const receipt = await tx.wait();
            
            console.log('✅ Contrato cancelado exitosamente');
            
            return {
                transactionHash: tx.hash,
                gasUsed: receipt.gasUsed.toString(),
                blockNumber: receipt.blockNumber,
                refundedTo: contractInfo[1] // empresa1
            };
            
        } catch (error) {
            console.error('❌ Error cancelando contrato:', error.message);
            throw new Error(`Error cancelando contrato: ${error.message}`);
        }
    }

    // ========================================
    // FUNCIONES DE UTILIDAD
    // ========================================

    async getContractEvents(contractAddress, fromBlock = 0) {
        try {
            const contract = new ethers.Contract(contractAddress, this.contractABI, this.provider);
            
            // Obtener todos los eventos del contrato
            const events = await contract.queryFilter('*', fromBlock);
            
            return events.map(event => ({
                event: event.eventName,
                args: event.args,
                blockNumber: event.blockNumber,
                transactionHash: event.transactionHash,
                timestamp: null // Se podría obtener del bloque si es necesario
            }));
            
        } catch (error) {
            console.error('❌ Error obteniendo eventos:', error.message);
            throw new Error(`Error obteniendo eventos: ${error.message}`);
        }
    }

    // Función para conectar con diferentes signers según sea necesario
    getContractWithSigner(contractAddress, signerType = 'arbitro') {
        const privateKey = this.privateKeys[signerType];
        if (!privateKey) {
            throw new Error(`Clave privada para ${signerType} no configurada`);
        }
        
        const signer = new ethers.Wallet(privateKey, this.provider);
        return new ethers.Contract(contractAddress, this.contractABI, signer);
    }
}

module.exports = EscrowManager;
