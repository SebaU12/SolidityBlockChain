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

    async completeInitialRequirements(contractAddress, numberOfRequirementsToComplete = 2) {
        try {
            console.log(`🏃 Completando primeros ${numberOfRequirementsToComplete} requerimientos automáticamente...`);
            
            const contract = new ethers.Contract(contractAddress, this.contractABI, this.arbitroSigner);
            
            // Esperar un momento para que la blockchain se sincronice
            console.log('⏳ Esperando sincronización de blockchain...');
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Obtener información del contrato con reintentos
            let contractInfo;
            let retries = 3;
            while (retries > 0) {
                try {
                    contractInfo = await contract.getContractInfo();
                    break;
                } catch (error) {
                    console.log(`🔄 Reintentando obtener info del contrato... (${4 - retries}/3)`);
                    retries--;
                    if (retries === 0) throw error;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            const totalRequirements = Number(contractInfo[5]);
            
            // Calcular cuántos requerimientos completar
            const toComplete = Math.min(numberOfRequirementsToComplete, totalRequirements - 1);
            
            if (toComplete <= 0) {
                console.log('⚠️ No hay suficientes requerimientos para completar automáticamente');
                return;
            }
            
            console.log(`📝 Completando ${toComplete} de ${totalRequirements} requerimientos...`);
            
            // Completar cada requerimiento con esperas
            for (let i = 0; i < toComplete; i++) {
                try {
                    const requirement = await contract.getRequirement(i);
                    
                    if (!requirement.completed) {
                        console.log(`   ✔️ Completando: "${requirement.description}"`);
                        
                        const tx = await contract.completeRequirement(i, {
                            gasLimit: 200000n
                        });
                        
                        console.log(`   ⏳ Esperando confirmación de requerimiento ${i}...`);
                        await tx.wait();
                        console.log(`   ✅ Requerimiento ${i} completado`);
                        
                        // Esperar un poco entre requerimientos
                        if (i < toComplete - 1) {
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    }
                } catch (error) {
                    console.error(`   ❌ Error completando requerimiento ${i}:`, error.message);
                }
            }
            
            console.log(`🎉 Primeros ${toComplete} requerimientos completados automáticamente`);
            
        } catch (error) {
            console.error('❌ Error completando requerimientos iniciales:', error.message);
            throw error;
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

    async depositFunds(contractAddress, amountInEther) {
        try {
            if (!this.privateKeys.empresa1) {
                throw new Error('EMPRESA1_PRIVATE_KEY no configurada en .env');
            }

            const empresa1Signer = new ethers.Wallet(this.privateKeys.empresa1, this.provider);
            const contract = new ethers.Contract(contractAddress, this.contractABI, empresa1Signer);
            
            const contractInfo = await contract.getContractInfo();
            const currentState = Number(contractInfo[4]);
            
            if (currentState !== 0) {
                throw new Error(`No se pueden depositar fondos en estado actual: ${currentState}`);
            }
            
            const amountWei = ethers.parseEther(amountInEther.toString());
            
            console.log(`💰 Depositando ${amountInEther} DEV en contrato ${contractAddress}`);
            
            const gasEstimate = await contract.depositFunds.estimateGas({ value: amountWei });
            
            const tx = await contract.depositFunds({
                value: amountWei,
                gasLimit: gasEstimate * 110n / 100n
            });
            
            console.log(`⏳ Transacción de depósito enviada: ${tx.hash}`);
            
            const receipt = await tx.wait();
            
            console.log('✅ Fondos depositados exitosamente. Contrato en estado IN_PROGRESS');
            
            return {
                transactionHash: tx.hash,
                amountDeposited: amountInEther.toString(),
                gasUsed: receipt.gasUsed.toString(),
                blockNumber: receipt.blockNumber,
                newState: 'IN_PROGRESS'
            };
            
        } catch (error) {
            console.error('❌ Error depositando fondos:', error.message);
            throw new Error(`Error depositando fondos: ${error.message}`);
        }
    }

    async depositFundsFromEmpresa2(contractAddress, amountInEther) {
        try {
            if (!this.privateKeys.empresa2) {
                throw new Error('EMPRESA2_PRIVATE_KEY no configurada en .env');
            }

            const empresa2Signer = new ethers.Wallet(this.privateKeys.empresa2, this.provider);
            const contract = new ethers.Contract(contractAddress, this.contractABI, empresa2Signer);
            
            const contractInfo = await contract.getContractInfo();
            const currentState = Number(contractInfo[4]);
            
            if (currentState !== 0) {
                throw new Error(`No se pueden depositar fondos en estado actual: ${currentState}`);
            }
            
            const amountWei = ethers.parseEther(amountInEther.toString());
            
            console.log(`💰 Depositando ${amountInEther} DEV desde Empresa2 en contrato ${contractAddress}`);
            
            const gasEstimate = await contract.depositFunds.estimateGas({ value: amountWei });
            
            const tx = await contract.depositFunds({
                value: amountWei,
                gasLimit: gasEstimate * 110n / 100n
            });
            
            console.log(`⏳ Transacción de depósito enviada: ${tx.hash}`);
            console.log(`⏳ Esperando confirmación...`);
            
            const receipt = await tx.wait();
            
            // Esperar un momento adicional para sincronización
            await new Promise(resolve => setTimeout(resolve, 500));
            
            console.log('✅ Fondos depositados exitosamente desde Empresa2. Contrato en estado IN_PROGRESS');
            
            return {
                transactionHash: tx.hash,
                amountDeposited: amountInEther.toString(),
                gasUsed: receipt.gasUsed.toString(),
                blockNumber: receipt.blockNumber,
                newState: 'IN_PROGRESS',
                payer: 'Empresa2'
            };
            
        } catch (error) {
            console.error('❌ Error depositando fondos desde Empresa2:', error.message);
            throw new Error(`Error depositando fondos: ${error.message}`);
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
