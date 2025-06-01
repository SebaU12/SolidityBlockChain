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
        if (!empresa1 || !empresa2 || !requirements) {
            return res.status(400).json({
                error: 'Datos incompletos',
                message: 'Se requieren empresa1, empresa2 y requirements'
            });
        }
        
        if (!Array.isArray(requirements) || requirements.length === 0) {
            return res.status(400).json({
                error: 'Requerimientos inválidos',
                message: 'Requirements debe ser un array no vacío'
            });
        }
        
        if (requirements.length > 50) {
            return res.status(400).json({
                error: 'Demasiados requerimientos',
                message: 'Máximo 50 requerimientos permitidos'
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
        
        console.log(`📝 Desplegando contrato: ${empresa1} -> ${empresa2}`);
        console.log(`📋 Requerimientos: ${requirements.length}`);
        
        const result = await escrowManager.deployContract(empresa1, empresa2, requirements);
        
        res.status(201).json({
            success: true,
            message: 'Contrato desplegado exitosamente',
            ...result,
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
            'POST /api/contracts/:address/cancel'
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
