require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const EscrowManager = require('./src/EscrowManager');

const app = express();
const PORT = process.env.PORT || 3000;

// ========================================
// MIDDLEWARE DE SEGURIDAD
// ========================================

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // máximo 100 requests por ventana
    message: {
        error: 'Demasiadas solicitudes, intenta de nuevo más tarde',
        retryAfter: '15 minutos'
    }
});

app.use(limiter);
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ========================================
// INICIALIZAR ESCROW MANAGER
// ========================================

let escrowManager;

async function initializeEscrowManager() {
    try {
        escrowManager = new EscrowManager();
        await escrowManager.initialize();
        console.log('✅ EscrowManager inicializado correctamente');
    } catch (error) {
        console.error('❌ Error inicializando EscrowManager:', error.message);
        process.exit(1);
    }
}

// ========================================
// MIDDLEWARE DE VALIDACIÓN
// ========================================

function validateAddress(req, res, next) {
    const { address } = req.params;
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({
            error: 'Dirección inválida',
            message: 'La dirección debe ser un hash hexadecimal válido de 40 caracteres'
        });
    }
    next();
}

function validateRequirementId(req, res, next) {
    const { requirementId } = req.params;
    const id = parseInt(requirementId);
    if (isNaN(id) || id < 0) {
        return res.status(400).json({
            error: 'ID de requerimiento inválido',
            message: 'El ID debe ser un número entero positivo'
        });
    }
    req.requirementId = id;
    next();
}

// ========================================
// RUTAS DE SALUD Y CONFIGURACIÓN
// ========================================

app.get('/api/health', async (req, res) => {
    try {
        const networkInfo = await escrowManager.getNetworkInfo();
        const arbitroInfo = await escrowManager.getArbitroInfo();
        
        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            network: networkInfo,
            arbitro: arbitroInfo,
            version: '1.0.0'
        });
    } catch (error) {
        res.status(503).json({
            status: 'ERROR',
            message: 'Servicio no disponible',
            error: error.message
        });
    }
});

app.get('/api/balance/:address', validateAddress, async (req, res) => {
    try {
        const { address } = req.params;
        const balance = await escrowManager.getBalance(address);
        
        res.json({
            address,
            balance: balance.formatted,
            balanceWei: balance.wei,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            error: 'Error consultando balance',
            message: error.message
        });
    }
});

// ========================================
// RUTAS DE GESTIÓN DE CONTRATOS
// ========================================

app.post('/api/contracts/deploy', async (req, res) => {
    try {
        const { empresa1, empresa2, requirements } = req.body;
        
        // Validaciones
        if (!empresa1 || !empresa2) {
            return res.status(400).json({
                error: 'Datos incompletos',
                message: 'Se requieren empresa1 y empresa2'
            });
        }
        
        // Validar direcciones
        const addressRegex = /^0x[a-fA-F0-9]{40}$/;
        if (!addressRegex.test(empresa1) || !addressRegex.test(empresa2)) {
            return res.status(400).json({
                error: 'Direcciones inválidas',
                message: 'Las direcciones deben ser hashes hexadecimales válidos'
            });
        }
        
        if (empresa1.toLowerCase() === empresa2.toLowerCase()) {
            return res.status(400).json({
                error: 'Direcciones duplicadas',
                message: 'Empresa1 y Empresa2 deben ser diferentes'
            });
        }
        
        // Siempre usar exactamente este 1 requerimiento fijo
        const fixedRequirements = [
            'Subir Repositorio de Código'
        ];
        
        // Ahora empresa1 es el pagador (Empresa2) y empresa2 es el recibidor (Empresa1)
        console.log(`📝 Desplegando contrato: ${empresa1} (Pagador) -> ${empresa2} (Recibidor)`);
        console.log(`📋 Requerimiento: ${fixedRequirements.join(', ')}`);
        
        // 1. Desplegar el contrato
        const deployResult = await escrowManager.deployContract(empresa1, empresa2, fixedRequirements);
        
        // 2. Esperar un momento para que la blockchain procese
        console.log(`⏳ Esperando confirmación del deploy...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 3. Obtener estado inicial del contrato
        let finalContractInfo;
        try {
            finalContractInfo = await escrowManager.getContractInfo(deployResult.contractAddress);
            console.log(`📊 Contrato creado en estado: ${finalContractInfo.state}`);
        } catch (error) {
            console.log(`⚠️ Usando valores por defecto para respuesta`);
            finalContractInfo = {
                completedRequirements: 0,
                totalRequirements: 1,
                state: 'CREATED',
                balance: '0.0'
            };
        }
        
        res.status(201).json({
            success: true,
            message: 'Contrato desplegado exitosamente en estado CREATED',
            ...deployResult,
            payerAddress: empresa1,
            receiverAddress: empresa2,
            requirements: fixedRequirements,
            initialProgress: {
                completedRequirements: finalContractInfo.completedRequirements,
                totalRequirements: finalContractInfo.totalRequirements,
                state: finalContractInfo.state,
                balance: finalContractInfo.balance
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error en deploy:', error.message);
        res.status(500).json({
            error: 'Error desplegando contrato',
            message: error.message
        });
    }
});

app.get('/api/contracts/:address', validateAddress, async (req, res) => {
    try {
        const { address } = req.params;
        console.log(`📊 Consultando contrato: ${address}`);
        
        const contractInfo = await escrowManager.getContractInfo(address);
        
        res.json({
            success: true,
            contractAddress: address,
            ...contractInfo,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error consultando contrato:', error.message);
        
        if (error.message.includes('call revert exception')) {
            res.status(404).json({
                error: 'Contrato no encontrado',
                message: 'No existe un contrato en esta dirección o la dirección es inválida'
            });
        } else {
            res.status(500).json({
                error: 'Error consultando contrato',
                message: error.message
            });
        }
    }
});

app.get('/api/contracts', async (req, res) => {
    try {
        // Esta función requeriría un indexador de eventos
        // Por ahora retornamos información básica
        res.json({
            message: 'Funcionalidad de listado en desarrollo',
            suggestion: 'Usa la dirección específica del contrato para consultar información'
        });
    } catch (error) {
        res.status(500).json({
            error: 'Error listando contratos',
            message: error.message
        });
    }
});

// ========================================
// RUTAS DE OPERACIONES DE CONTRATO
// ========================================

app.post('/api/contracts/:address/complete/:requirementId', 
    validateAddress, 
    validateRequirementId, 
    async (req, res) => {
        try {
            const { address } = req.params;
            const { requirementId } = req;
            
            console.log(`✅ Completando requerimiento ${requirementId} en ${address}`);
            
            const result = await escrowManager.completeRequirement(address, requirementId);
            
            res.json({
                success: true,
                message: `Requerimiento ${requirementId} completado exitosamente`,
                ...result,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('❌ Error completando requerimiento:', error.message);
            
            if (error.message.includes('Requerimiento ya completado')) {
                res.status(400).json({
                    error: 'Requerimiento ya completado',
                    message: 'Este requerimiento ya fue marcado como completado'
                });
            } else if (error.message.includes('ID de requerimiento invalido')) {
                res.status(400).json({
                    error: 'ID inválido',
                    message: 'El ID de requerimiento no existe'
                });
            } else {
                res.status(500).json({
                    error: 'Error completando requerimiento',
                    message: error.message
                });
            }
        }
    }
);

app.post('/api/contracts/:address/cancel', validateAddress, async (req, res) => {
    try {
        const { address } = req.params;
        console.log(`❌ Cancelando contrato: ${address}`);
        
        const result = await escrowManager.cancelContract(address);
        
        res.json({
            success: true,
            message: 'Contrato cancelado exitosamente',
            ...result,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error cancelando contrato:', error.message);
        
        if (error.message.includes('No se puede cancelar en este estado')) {
            res.status(400).json({
                error: 'Estado inválido',
                message: 'El contrato no puede ser cancelado en su estado actual'
            });
        } else {
            res.status(500).json({
                error: 'Error cancelando contrato',
                message: error.message
            });
        }
    }
});

app.post('/api/contracts/:address/deposit', validateAddress, async (req, res) => {
    try {
        const { address } = req.params;
        const { amount } = req.body;
        
        if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
            return res.status(400).json({
                error: 'Monto inválido',
                message: 'Se requiere un monto válido mayor a 0'
            });
        }
        
        console.log(`💰 Depositando ${amount} DEV en contrato: ${address}`);
        
        const result = await escrowManager.depositFunds(address, parseFloat(amount));
        
        res.json({
            success: true,
            message: `Fondos depositados exitosamente. Ahora se pueden completar requerimientos.`,
            ...result,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error depositando fondos:', error.message);
        
        if (error.message.includes('No se pueden depositar fondos en estado actual')) {
            res.status(400).json({
                error: 'Estado inválido',
                message: 'Los fondos solo se pueden depositar cuando el contrato está en estado CREATED'
            });
        } else if (error.message.includes('EMPRESA1_PRIVATE_KEY no configurada')) {
            res.status(500).json({
                error: 'Configuración incompleta',
                message: 'La clave privada de Empresa1 no está configurada'
            });
        } else {
            res.status(500).json({
                error: 'Error depositando fondos',
                message: error.message
            });
        }
    }
});

app.post('/api/contracts/:address/start', validateAddress, async (req, res) => {
    try {
        const { address } = req.params;
        
        console.log(`🚀 Iniciando progreso del contrato: ${address}`);
        
        // Verificar balance de Empresa2 primero (ahora es el pagador)
        const empresa2Balance = await escrowManager.getBalance(process.env.EMPRESA2_ADDRESS);
        const balanceInEther = parseFloat(empresa2Balance.formatted);
        
        console.log(`💰 Balance disponible Empresa2 (Pagador): ${balanceInEther} DEV`);
        
        // Calcular monto seguro (dejar 0.01 DEV para gas)
        const maxSafeAmount = Math.max(0.01, (balanceInEther - 0.01) * 0.8); // 80% del disponible
        const depositAmount = Math.min(0.05, maxSafeAmount); // Máximo 0.05 DEV
        
        if (depositAmount < 0.01) {
            return res.status(400).json({
                error: 'Fondos insuficientes',
                message: `Empresa2 tiene ${balanceInEther} DEV. Se necesita al menos 0.02 DEV (depósito + gas)`
            });
        }
        
        console.log(`💸 Depositando ${depositAmount} DEV (calculado automáticamente)`);
        
        // 1. Depositar fondos usando Empresa2 como pagador
        const depositResult = await escrowManager.depositFundsFromEmpresa2(address, depositAmount);
        
        // 2. Esperar confirmación del depósito (reducido)
        console.log(`⏳ Esperando confirmación del depósito...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 3. Obtener estado final del contrato
        const finalContractInfo = await escrowManager.getContractInfo(address);
        
        res.json({
            success: true,
            message: `Contrato iniciado exitosamente. Depositados ${depositAmount} DEV. Listo para entregable.`,
            depositedAmount: depositAmount,
            availableBalance: balanceInEther,
            completedRequirements: finalContractInfo.completedRequirements,
            state: finalContractInfo.state,
            progress: `${finalContractInfo.completedRequirements}/${finalContractInfo.totalRequirements}`,
            ...depositResult,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error iniciando contrato:', error.message);
        
        if (error.message.includes('No se pueden depositar fondos en estado actual')) {
            res.status(400).json({
                error: 'Estado inválido',
                message: 'El contrato solo puede iniciarse cuando está en estado CREATED'
            });
        } else if (error.message.includes('EMPRESA2_PRIVATE_KEY no configurada')) {
            res.status(500).json({
                error: 'Configuración incompleta',
                message: 'La clave privada de Empresa2 no está configurada'
            });
        } else if (error.message.includes('missing revert data') || error.message.includes('insufficient funds')) {
            res.status(400).json({
                error: 'Fondos insuficientes',
                message: 'Empresa2 no tiene suficiente balance para depositar fondos. Verifica el balance de la cuenta.'
            });
        } else {
            res.status(500).json({
                error: 'Error iniciando contrato',
                message: error.message
            });
        }
    }
});

// ========================================
// MANEJO DE ERRORES
// ========================================

app.use((req, res) => {
    res.status(404).json({
        error: 'Ruta no encontrada',
        message: `La ruta ${req.method} ${req.path} no existe`,
        availableRoutes: [
            'GET /api/health',
            'GET /api/balance/:address',
            'POST /api/contracts/deploy',
            'GET /api/contracts/:address',
            'POST /api/contracts/:address/complete/:requirementId',
            'POST /api/contracts/:address/cancel',
            'POST /api/contracts/:address/deposit',
            'POST /api/contracts/:address/start'
        ]
    });
});

app.use((error, req, res, next) => {
    console.error('❌ Error no manejado:', error);
    res.status(500).json({
        error: 'Error interno del servidor',
        message: 'Ocurrió un error inesperado'
    });
});

// ========================================
// INICIALIZACIÓN DEL SERVIDOR
// ========================================

async function startServer() {
    try {
        await initializeEscrowManager();
        
        app.listen(PORT, () => {
            console.log('🚀 Servidor iniciado exitosamente');
            console.log('='.repeat(50));
            console.log(`📍 URL: http://localhost:${PORT}`);
            console.log(`🌐 Red: Moonbase Alpha`);
            console.log(`⚙️  Endpoints disponibles:`);
            console.log(`   • GET  /api/health`);
            console.log(`   • GET  /api/balance/:address`);
            console.log(`   • POST /api/contracts/deploy`);
            console.log(`   • GET  /api/contracts/:address`);
            console.log(`   • POST /api/contracts/:address/complete/:id`);
            console.log(`   • POST /api/contracts/:address/cancel`);
            console.log(`   • POST /api/contracts/:address/deposit`);
            console.log(`   • POST /api/contracts/:address/start`);
            console.log('='.repeat(50));
        });
    } catch (error) {
        console.error('❌ Error iniciando servidor:', error.message);
        process.exit(1);
    }
}

// Manejo de señales para cierre graceful
process.on('SIGINT', () => {
    console.log('\n🛑 Cerrando servidor...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Cerrando servidor...');
    process.exit(0);
});

startServer();
