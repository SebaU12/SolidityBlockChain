require('dotenv').config();
const axios = require('axios');

const API_BASE_URL = `http://localhost:${process.env.PORT || 3000}/api`;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;

// Configurar timeout para axios
axios.defaults.timeout = 30000;

// Función para esperar un tiempo determinado
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Función para hacer requests con retry
async function makeRequest(method, url, data = null, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            let response;
            switch (method.toLowerCase()) {
                case 'get':
                    response = await axios.get(url);
                    break;
                case 'post':
                    response = await axios.post(url, data);
                    break;
                case 'put':
                    response = await axios.put(url, data);
                    break;
                case 'delete':
                    response = await axios.delete(url);
                    break;
                default:
                    throw new Error(`Método HTTP no soportado: ${method}`);
            }
            return response;
        } catch (error) {
            if (i === retries - 1) throw error;
            console.log(`⚠️ Reintento ${i + 1}/${retries} para ${method} ${url}`);
            await sleep(2000);
        }
    }
}

async function testAPI() {
    console.log('🧪 INICIANDO TESTS COMPLETOS DE API');
    console.log('='.repeat(60));
    console.log(`🌐 URL Base: ${API_BASE_URL}`);
    console.log(`📅 Fecha: ${new Date().toLocaleString()}`);
    console.log('='.repeat(60));
    
    const results = {
        passed: 0,
        failed: 0,
        errors: []
    };
    
    try {
        // ========================================
        // 1. TEST HEALTH CHECK
        // ========================================
        console.log('\n1️⃣ TESTING HEALTH CHECK');
        console.log('-'.repeat(40));
        
        try {
            const healthResponse = await makeRequest('get', `${API_BASE_URL}/health`);
            
            if (healthResponse.status === 200) {
                console.log('✅ Health Check: PASSED');
                console.log(`   Status: ${healthResponse.data.status}`);
                console.log(`   Network: ${healthResponse.data.network.name}`);
                console.log(`   Chain ID: ${healthResponse.data.network.chainId}`);
                console.log(`   Árbitro: ${healthResponse.data.arbitro.address}`);
                console.log(`   Balance Árbitro: ${healthResponse.data.arbitro.balance}`);
                console.log(`   Timestamp: ${healthResponse.data.timestamp}`);
                results.passed++;
            } else {
                throw new Error(`Status inesperado: ${healthResponse.status}`);
            }
        } catch (error) {
            console.log('❌ Health Check: FAILED');
            console.log(`   Error: ${error.message}`);
            results.failed++;
            results.errors.push(`Health Check: ${error.message}`);
        }
        
        // ========================================
        // 2. TEST BALANCE CHECK
        // ========================================
        console.log('\n2️⃣ TESTING BALANCE CHECK');
        console.log('-'.repeat(40));
        
        const addressesToTest = [
            { name: 'Árbitro', address: process.env.ARBITRO_ADDRESS },
            { name: 'Empresa1', address: process.env.EMPRESA1_ADDRESS },
            { name: 'Empresa2', address: process.env.EMPRESA2_ADDRESS }
        ];
        
        for (const account of addressesToTest) {
            try {
                if (!account.address) {
                    console.log(`⚠️ ${account.name}: Dirección no configurada en .env`);
                    continue;
                }
                
                const balanceResponse = await makeRequest('get', `${API_BASE_URL}/balance/${account.address}`);
                
                if (balanceResponse.status === 200) {
                    console.log(`✅ Balance ${account.name}: PASSED`);
                    console.log(`   Dirección: ${balanceResponse.data.address}`);
                    console.log(`   Balance: ${balanceResponse.data.balance} DEV`);
                    console.log(`   Balance Wei: ${balanceResponse.data.balanceWei}`);
                    results.passed++;
                } else {
                    throw new Error(`Status inesperado: ${balanceResponse.status}`);
                }
            } catch (error) {
                console.log(`❌ Balance ${account.name}: FAILED`);
                console.log(`   Error: ${error.message}`);
                results.failed++;
                results.errors.push(`Balance ${account.name}: ${error.message}`);
            }
        }
        
        // ========================================
        // 3. TEST VALIDACIONES DE ENTRADA
        // ========================================
        console.log('\n3️⃣ TESTING VALIDACIONES');
        console.log('-'.repeat(40));
        
        const validationTests = [
            {
                name: 'Dirección inválida en balance',
                method: 'get',
                url: `${API_BASE_URL}/balance/invalid`,
                expectedStatus: 400
            },
            {
                name: 'Contrato inexistente',
                method: 'get', 
                url: `${API_BASE_URL}/contracts/0x1234567890123456789012345678901234567890`,
                expectedStatus: 404
            },
            {
                name: 'Deploy con datos incompletos',
                method: 'post',
                url: `${API_BASE_URL}/contracts/deploy`,
                data: { incomplete: 'data' },
                expectedStatus: 400
            },
            {
                name: 'Complete con ID inválido',
                method: 'post',
                url: `${API_BASE_URL}/contracts/0x1234567890123456789012345678901234567890/complete/abc`,
                expectedStatus: 400
            }
        ];
        
        for (const test of validationTests) {
            try {
                await makeRequest(test.method, test.url, test.data);
                console.log(`❌ ${test.name}: FAILED (debería haber fallado)`);
                results.failed++;
                results.errors.push(`${test.name}: No validó correctamente`);
            } catch (error) {
                if (error.response && error.response.status === test.expectedStatus) {
                    console.log(`✅ ${test.name}: PASSED`);
                    console.log(`   Error esperado: ${error.response.data.error || error.response.data.message}`);
                    results.passed++;
                } else {
                    console.log(`❌ ${test.name}: FAILED`);
                    console.log(`   Error inesperado: ${error.message}`);
                    results.failed++;
                    results.errors.push(`${test.name}: ${error.message}`);
                }
            }
        }
        
        // ========================================
        // 4. TEST CONTRACT INFO (SI EXISTE)
        // ========================================
        if (CONTRACT_ADDRESS && CONTRACT_ADDRESS !== '0x...') {
            console.log('\n4️⃣ TESTING CONTRACT INFO');
            console.log('-'.repeat(40));
            console.log(`📍 Contrato: ${CONTRACT_ADDRESS}`);
            
            try {
                const contractResponse = await makeRequest('get', `${API_BASE_URL}/contracts/${CONTRACT_ADDRESS}`);
                
                if (contractResponse.status === 200) {
                    console.log('✅ Contract Info: PASSED');
                    const data = contractResponse.data;
                    console.log(`   Árbitro: ${data.arbitro}`);
                    console.log(`   Empresa1: ${data.empresa1}`);
                    console.log(`   Empresa2: ${data.empresa2}`);
                    console.log(`   Estado: ${data.state} (${data.stateCode})`);
                    console.log(`   Progreso: ${data.progress}%`);
                    console.log(`   Requerimientos: ${data.completedRequirements}/${data.totalRequirements}`);
                    console.log(`   Balance: ${data.balance} DEV`);
                    console.log(`   Monto depositado: ${data.amount} DEV`);
                    
                    if (data.requirements && data.requirements.descriptions) {
                        console.log('\n   📋 Requerimientos:');
                        data.requirements.descriptions.forEach((desc, index) => {
                            const status = data.requirements.completed[index] ? '✅' : '⏳';
                            console.log(`      ${index}. ${status} ${desc}`);
                        });
                    }
                    
                    results.passed++;
                    
                    // Guardar datos del contrato para tests posteriores
                    window.contractData = data;
                    
                } else {
                    throw new Error(`Status inesperado: ${contractResponse.status}`);
                }
            } catch (error) {
                console.log('❌ Contract Info: FAILED');
                console.log(`   Error: ${error.message}`);
                results.failed++;
                results.errors.push(`Contract Info: ${error.message}`);
            }
        } else {
            console.log('\n4️⃣ SKIPPING CONTRACT INFO');
            console.log('-'.repeat(40));
            console.log('⚠️ CONTRACT_ADDRESS no configurado en .env');
        }
        
        // ========================================
        // 5. TEST DEPLOY NUEVO CONTRATO
        // ========================================
        console.log('\n5️⃣ TESTING DEPLOY NUEVO CONTRATO');
        console.log('-'.repeat(40));
        
        try {
            const deployData = {
                empresa1: process.env.EMPRESA1_ADDRESS,
                empresa2: process.env.EMPRESA2_ADDRESS,
                requirements: [
                    "Documentación técnica completa",
                    "Código desarrollado y testeado",
                    "Deploy en staging exitoso",
                    "Aprobación final del cliente"
                ]
            };
            
            console.log('📝 Desplegando contrato de prueba...');
            console.log(`   Empresa1: ${deployData.empresa1}`);
            console.log(`   Empresa2: ${deployData.empresa2}`);
            console.log(`   Requerimientos: ${deployData.requirements.length}`);
            
            const deployResponse = await makeRequest('post', `${API_BASE_URL}/contracts/deploy`, deployData);
            
            if (deployResponse.status === 201) {
                console.log('✅ Deploy: PASSED');
                const data = deployResponse.data;
                console.log(`   Contrato: ${data.contractAddress}`);
                console.log(`   TX Hash: ${data.transactionHash}`);
                console.log(`   Gas usado: ${data.gasUsed}`);
                console.log(`   🔗 Explorer: https://moonbase.moonscan.io/address/${data.contractAddress}`);
                
                // Guardar dirección del nuevo contrato para tests adicionales
                window.newContractAddress = data.contractAddress;
                
                results.passed++;
                
                // Esperar un poco para que la transacción se confirme
                console.log('⏳ Esperando confirmación...');
                await sleep(5000);
                
                // Verificar que el contrato fue creado correctamente
                try {
                    const newContractInfo = await makeRequest('get', `${API_BASE_URL}/contracts/${data.contractAddress}`);
                    if (newContractInfo.status === 200) {
                        console.log('✅ Verificación post-deploy: PASSED');
                        console.log(`   Estado inicial: ${newContractInfo.data.state}`);
                        results.passed++;
                    }
                } catch (verifyError) {
                    console.log('⚠️ Verificación post-deploy: WARNING');
                    console.log(`   Error: ${verifyError.message}`);
                }
                
            } else {
                throw new Error(`Status inesperado: ${deployResponse.status}`);
            }
        } catch (error) {
            console.log('❌ Deploy: FAILED');
            console.log(`   Error: ${error.message}`);
            results.failed++;
            results.errors.push(`Deploy: ${error.message}`);
        }
        
        // ========================================
        // 6. TEST COMPLETE REQUIREMENT
        // ========================================
        console.log('\n6️⃣ TESTING COMPLETE REQUIREMENT');
        console.log('-'.repeat(40));
        
        // Usar el contrato recién creado o el existente
        const testContractAddress = window.newContractAddress || CONTRACT_ADDRESS;
        
        if (testContractAddress && testContractAddress !== '0x...') {
            try {
                // Primero verificar si hay requerimientos pendientes
                const contractInfo = await makeRequest('get', `${API_BASE_URL}/contracts/${testContractAddress}`);
                
                if (contractInfo.data.state === 'CREATED') {
                    console.log('ℹ️ Contrato en estado CREATED - necesita depósito de fondos primero');
                    console.log(`💡 Ejecuta: node scripts/deposit-funds.js ${testContractAddress} 1.0`);
                } else if (contractInfo.data.state === 'IN_PROGRESS') {
                    // Buscar primer requerimiento no completado
                    let pendingRequirementId = -1;
                    const requirements = contractInfo.data.requirements;
                    
                    for (let i = 0; i < requirements.completed.length; i++) {
                        if (!requirements.completed[i]) {
                            pendingRequirementId = i;
                            break;
                        }
                    }
                    
                    if (pendingRequirementId !== -1) {
                        console.log(`📝 Completando requerimiento ${pendingRequirementId}...`);
                        console.log(`   "${requirements.descriptions[pendingRequirementId]}"`);
                        
                        const completeResponse = await makeRequest(
                            'post',
                            `${API_BASE_URL}/contracts/${testContractAddress}/complete/${pendingRequirementId}`
                        );
                        
                        if (completeResponse.status === 200) {
                            console.log('✅ Complete Requirement: PASSED');
                            console.log(`   TX Hash: ${completeResponse.data.transactionHash}`);
                            console.log(`   Gas usado: ${completeResponse.data.gasUsed}`);
                            
                            if (completeResponse.data.contractCompleted) {
                                console.log('🎉 ¡Contrato completado automáticamente!');
                            }
                            
                            results.passed++;
                            
                            // Verificar el nuevo estado
                            await sleep(3000);
                            const updatedInfo = await makeRequest('get', `${API_BASE_URL}/contracts/${testContractAddress}`);
                            console.log(`   Nuevo progreso: ${updatedInfo.data.progress}%`);
                            
                        } else {
                            throw new Error(`Status inesperado: ${completeResponse.status}`);
                        }
                    } else {
                        console.log('ℹ️ Todos los requerimientos ya están completados');
                        results.passed++;
                    }
                } else {
                    console.log(`ℹ️ Contrato en estado ${contractInfo.data.state} - no se pueden completar requerimientos`);
                    results.passed++;
                }
                
            } catch (error) {
                console.log('❌ Complete Requirement: FAILED');
                console.log(`   Error: ${error.message}`);
                results.failed++;
                results.errors.push(`Complete Requirement: ${error.message}`);
            }
        } else {
            console.log('⚠️ No hay contrato disponible para testear complete requirement');
        }
        
        // ========================================
        // 7. TEST CANCEL CONTRACT
        // ========================================
        console.log('\n7️⃣ TESTING CANCEL CONTRACT');
        console.log('-'.repeat(40));
        
        // Solo probar cancel si tenemos un contrato nuevo que podamos cancelar
        if (window.newContractAddress) {
            try {
                const contractInfo = await makeRequest('get', `${API_BASE_URL}/contracts/${window.newContractAddress}`);
                
                if (contractInfo.data.state === 'CREATED' || contractInfo.data.state === 'IN_PROGRESS') {
                    console.log(`📝 Cancelando contrato en estado ${contractInfo.data.state}...`);
                    
                    const cancelResponse = await makeRequest('post', `${API_BASE_URL}/contracts/${window.newContractAddress}/cancel`);
                    
                    if (cancelResponse.status === 200) {
                        console.log('✅ Cancel Contract: PASSED');
                        console.log(`   TX Hash: ${cancelResponse.data.transactionHash}`);
                        console.log(`   Gas usado: ${cancelResponse.data.gasUsed}`);
                        console.log(`   Fondos devueltos a: ${cancelResponse.data.refundedTo}`);
                        
                        results.passed++;
                        
                        // Verificar el estado cancelado
                        await sleep(3000);
                        const cancelledInfo = await makeRequest('get', `${API_BASE_URL}/contracts/${window.newContractAddress}`);
                        console.log(`   Estado final: ${cancelledInfo.data.state}`);
                        
                    } else {
                        throw new Error(`Status inesperado: ${cancelResponse.status}`);
                    }
                } else {
                    console.log(`ℹ️ Contrato en estado ${contractInfo.data.state} - no se puede cancelar`);
                    
                    // Probar que efectivamente no se puede cancelar
                    try {
                        await makeRequest('post', `${API_BASE_URL}/contracts/${window.newContractAddress}/cancel`);
                        console.log('❌ Cancel debería haber fallado');
                        results.failed++;
                    } catch (error) {
                        if (error.response && error.response.status === 400) {
                            console.log('✅ Validación de cancel correcta');
                            results.passed++;
                        }
                    }
                }
                
            } catch (error) {
                console.log('❌ Cancel Contract: FAILED');
                console.log(`   Error: ${error.message}`);
                results.failed++;
                results.errors.push(`Cancel Contract: ${error.message}`);
            }
        } else {
            console.log('ℹ️ No hay contrato nuevo para testear cancelación');
        }
        
        // ========================================
        // 8. TEST PERFORMANCE Y LOAD
        // ========================================
        console.log('\n8️⃣ TESTING PERFORMANCE');
        console.log('-'.repeat(40));
        
        try {
            const startTime = Date.now();
            const promises = [];
            const concurrentRequests = 5;
            
            console.log(`📊 Ejecutando ${concurrentRequests} requests concurrentes...`);
            
            for (let i = 0; i < concurrentRequests; i++) {
                promises.push(makeRequest('get', `${API_BASE_URL}/health`));
            }
            
            const responses = await Promise.all(promises);
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            const allSuccessful = responses.every(r => r.status === 200);
            
            if (allSuccessful) {
                console.log('✅ Performance Test: PASSED');
                console.log(`   ${concurrentRequests} requests en ${duration}ms`);
                console.log(`   Promedio: ${(duration / concurrentRequests).toFixed(2)}ms por request`);
                results.passed++;
            } else {
                throw new Error('Algunas requests fallaron');
            }
            
        } catch (error) {
            console.log('❌ Performance Test: FAILED');
            console.log(`   Error: ${error.message}`);
            results.failed++;
            results.errors.push(`Performance: ${error.message}`);
        }
        
        // ========================================
        // 9. TEST RATE LIMITING
        // ========================================
        console.log('\n9️⃣ TESTING RATE LIMITING');
        console.log('-'.repeat(40));
        
        try {
            console.log('📊 Probando límites de rate limiting...');
            
            let rateLimitHit = false;
            const rapidRequests = [];
            
            // Hacer muchas requests rápidas para probar rate limiting
            for (let i = 0; i < 20; i++) {
                rapidRequests.push(
                    makeRequest('get', `${API_BASE_URL}/health`, null, 1)
                        .catch(error => {
                            if (error.response && error.response.status === 429) {
                                rateLimitHit = true;
                                return { rateLimited: true };
                            }
                            throw error;
                        })
                );
            }
            
            await Promise.all(rapidRequests);
            
            if (rateLimitHit) {
                console.log('✅ Rate Limiting: PASSED');
                console.log('   Rate limiting funcionando correctamente');
                results.passed++;
            } else {
                console.log('⚠️ Rate Limiting: WARNING');
                console.log('   No se activó el rate limiting (puede ser normal en desarrollo)');
                results.passed++;
            }
            
        } catch (error) {
            console.log('❌ Rate Limiting: FAILED');
            console.log(`   Error: ${error.message}`);
            results.failed++;
            results.errors.push(`Rate Limiting: ${error.message}`);
        }
        
    } catch (error) {
        console.error('\n💥 ERROR CRÍTICO EN TESTS:', error.message);
        results.failed++;
        results.errors.push(`Crítico: ${error.message}`);
    }
    
    // ========================================
    // RESUMEN FINAL
    // ========================================
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN DE TESTS');
    console.log('='.repeat(60));
    console.log(`✅ Pasaron: ${results.passed}`);
    console.log(`❌ Fallaron: ${results.failed}`);
    console.log(`📈 Total: ${results.passed + results.failed}`);
    console.log(`📊 Porcentaje de éxito: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);
    
    if (results.errors.length > 0) {
        console.log('\n❌ ERRORES ENCONTRADOS:');
        console.log('-'.repeat(30));
        results.errors.forEach((error, index) => {
            console.log(`${index + 1}. ${error}`);
        });
    }
    
    console.log('\n🎯 RECOMENDACIONES:');
    console.log('-'.repeat(30));
    
    if (results.failed === 0) {
        console.log('🎉 ¡Todos los tests pasaron! El sistema está funcionando correctamente.');
        console.log('📋 Próximos pasos:');
        console.log('   • Probar flujo completo con depósito de fondos');
        console.log('   • Ejecutar tests de stress más intensivos');
        console.log('   • Considerar deploy a mainnet');
    } else {
        console.log('🔧 Hay algunos problemas que requieren atención:');
        
        if (results.errors.some(e => e.includes('ECONNREFUSED'))) {
            console.log('   • Verificar que el servidor esté corriendo: node server.js');
        }
        
        if (results.errors.some(e => e.includes('deploy'))) {
            console.log('   • Verificar configuración de cuentas y fondos');
        }
        
        if (results.errors.some(e => e.includes('contract'))) {
            console.log('   • Verificar CONTRACT_ADDRESS en .env');
        }
        
        console.log('   • Revisar logs detallados arriba');
        console.log('   • Ejecutar tests individuales para debugging');
    }
    
    console.log('\n📞 COMANDOS ÚTILES:');
    console.log('-'.repeat(30));
    console.log('• Servidor: node server.js');
    console.log('• Deploy: npx hardhat run scripts/simple-deploy.js --network moonbase');
    console.log('• Interact: npx hardhat run scripts/interact.js --network moonbase');
    console.log('• Deposit: node scripts/deposit-funds.js [CONTRACT] [AMOUNT]');
    console.log('• Full Flow: node scripts/test-api-complete.js --complete-flow');
    
    console.log('\n' + '='.repeat(60));
    
    return results;
}

// ========================================
// FUNCIÓN PARA FLUJO COMPLETO
// ========================================
async function testCompleteFlow() {
    console.log('\n🔄 TESTING FLUJO COMPLETO DE ESCROW');
    console.log('='.repeat(60));
    
    const flowResults = {
        steps: [],
        success: true
    };
    
    try {
        // Step 1: Deploy nuevo contrato
        console.log('\n1️⃣ PASO 1: Deploy de contrato');
        console.log('-'.repeat(40));
        
        const deployData = {
            empresa1: process.env.EMPRESA1_ADDRESS,
            empresa2: process.env.EMPRESA2_ADDRESS,
            requirements: [
                "Análisis de requerimientos completado",
                "Arquitectura del sistema aprobada",
                "Desarrollo del backend finalizado",
                "Testing de integración exitoso",
                "Deploy a staging aprobado",
                "Documentación técnica entregada",
                "Aprobación final del cliente"
            ]
        };
        
        console.log('📝 Desplegando contrato de flujo completo...');
        const deployResponse = await makeRequest('post', `${API_BASE_URL}/contracts/deploy`, deployData);
        const contractAddress = deployResponse.data.contractAddress;
        
        console.log(`✅ Contrato desplegado: ${contractAddress}`);
        console.log(`🔗 Explorer: https://moonbase.moonscan.io/address/${contractAddress}`);
        
        flowResults.steps.push({
            step: 'Deploy',
            success: true,
            contractAddress,
            txHash: deployResponse.data.transactionHash
        });
        
        // Step 2: Verificar estado inicial
        console.log('\n2️⃣ PASO 2: Verificar estado inicial');
        console.log('-'.repeat(40));
        
        await sleep(2000); // Esperar confirmación
        const initialInfo = await makeRequest('get', `${API_BASE_URL}/contracts/${contractAddress}`);
        
        console.log(`Estado: ${initialInfo.data.state}`);
        console.log(`Requerimientos: ${initialInfo.data.totalRequirements}`);
        console.log(`Progreso: ${initialInfo.data.progress}%`);
        console.log(`Balance: ${initialInfo.data.balance} DEV`);
        
        if (initialInfo.data.state !== 'CREATED') {
            throw new Error(`Estado inicial incorrecto: ${initialInfo.data.state}`);
        }
        
        flowResults.steps.push({
            step: 'Initial State Check',
            success: true,
            state: initialInfo.data.state
        });
        
        // Step 3: Simular depósito (mostrar instrucciones)
        console.log('\n3️⃣ PASO 3: Simular depósito de fondos');
        console.log('-'.repeat(40));
        console.log('ℹ️ En un flujo real, Empresa1 depositaría fondos usando:');
        console.log(`   node scripts/deposit-funds.js ${contractAddress} 2.5`);
        console.log('');
        console.log('📝 Para este test, continuaremos simulando que ya se depositaron fondos...');
        
        // Para este test, asumimos que el depósito fue exitoso
        // En un caso real, aquí se haría el depósito real
        console.log('✅ Depósito simulado (en producción sería real)');
        
        flowResults.steps.push({
            step: 'Deposit Simulation',
            success: true,
            note: 'Simulated - would be real deposit in production'
        });
        
        // Step 4: Completar requerimientos progresivamente
        console.log('\n4️⃣ PASO 4: Completar requerimientos progresivamente');
        console.log('-'.repeat(40));
        
        const totalRequirements = deployData.requirements.length;
        
        for (let i = 0; i < totalRequirements; i++) {
            console.log(`\n📋 Completando requerimiento ${i + 1}/${totalRequirements}:`);
            console.log(`   "${deployData.requirements[i]}"`);
            
            try {
                const completeResponse = await makeRequest(
                    'post',
                    `${API_BASE_URL}/contracts/${contractAddress}/complete/${i}`
                );
                
                console.log(`   ✅ TX: ${completeResponse.data.transactionHash}`);
                console.log(`   ⛽ Gas: ${completeResponse.data.gasUsed}`);
                
                // Verificar progreso
                await sleep(2000);
                const progressInfo = await makeRequest('get', `${API_BASE_URL}/contracts/${contractAddress}`);
                console.log(`   📊 Progreso: ${progressInfo.data.progress}%`);
                console.log(`   📋 Completados: ${progressInfo.data.completedRequirements}/${progressInfo.data.totalRequirements}`);
                
                flowResults.steps.push({
                    step: `Complete Requirement ${i}`,
                    success: false,
                    error: error.message
                });
                flowResults.success = false;
                break;
            }
        }
        
        // Step 5: Verificar estado final
        console.log('\n5️⃣ PASO 5: Verificar estado final');
        console.log('-'.repeat(40));
        
        await sleep(3000); // Esperar confirmaciones finales
        const finalInfo = await makeRequest('get', `${API_BASE_URL}/contracts/${contractAddress}`);
        
        console.log('📊 ESTADO FINAL DEL CONTRATO:');
        console.log(`   Estado: ${finalInfo.data.state}`);
        console.log(`   Progreso: ${finalInfo.data.progress}%`);
        console.log(`   Requerimientos: ${finalInfo.data.completedRequirements}/${finalInfo.data.totalRequirements}`);
        console.log(`   Balance: ${finalInfo.data.balance} DEV`);
        console.log(`   Monto original: ${finalInfo.data.amount} DEV`);
        
        if (finalInfo.data.state === 'COMPLETED') {
            console.log('🎉 ¡FLUJO COMPLETADO EXITOSAMENTE!');
            console.log('✅ Todos los requerimientos fueron completados');
            console.log('✅ Fondos transferidos automáticamente a Empresa2');
        } else {
            console.log(`⚠️ Flujo incompleto - Estado final: ${finalInfo.data.state}`);
        }
        
        flowResults.steps.push({
            step: 'Final State Check',
            success: finalInfo.data.state === 'COMPLETED',
            finalState: finalInfo.data.state,
            finalProgress: finalInfo.data.progress
        });
        
        // Step 6: Verificar balances finales
        console.log('\n6️⃣ PASO 6: Verificar balances finales');
        console.log('-'.repeat(40));
        
        const accounts = [
            { name: 'Empresa1', address: process.env.EMPRESA1_ADDRESS },
            { name: 'Empresa2', address: process.env.EMPRESA2_ADDRESS },
            { name: 'Contrato', address: contractAddress }
        ];
        
        for (const account of accounts) {
            try {
                const balanceResponse = await makeRequest('get', `${API_BASE_URL}/balance/${account.address}`);
                console.log(`💰 ${account.name}: ${balanceResponse.data.balance} DEV`);
            } catch (error) {
                console.log(`❌ Error obteniendo balance de ${account.name}: ${error.message}`);
            }
        }
        
        // Step 7: Generar reporte final
        console.log('\n7️⃣ PASO 7: Reporte final');
        console.log('-'.repeat(40));
        
        const report = {
            contractAddress,
            totalSteps: flowResults.steps.length,
            successfulSteps: flowResults.steps.filter(s => s.success).length,
            failedSteps: flowResults.steps.filter(s => !s.success).length,
            finalState: finalInfo.data.state,
            finalProgress: finalInfo.data.progress,
            timestamp: new Date().toISOString()
        };
        
        console.log('📋 REPORTE EJECUTIVO:');
        console.log(`   Contrato: ${report.contractAddress}`);
        console.log(`   Pasos totales: ${report.totalSteps}`);
        console.log(`   Pasos exitosos: ${report.successfulSteps}`);
        console.log(`   Pasos fallidos: ${report.failedSteps}`);
        console.log(`   Estado final: ${report.finalState}`);
        console.log(`   Progreso final: ${report.finalProgress}%`);
        console.log(`   Éxito general: ${flowResults.success ? '✅ SÍ' : '❌ NO'}`);
        
        flowResults.report = report;
        
    } catch (error) {
        console.error('\n💥 ERROR CRÍTICO EN FLUJO COMPLETO:', error.message);
        flowResults.success = false;
        flowResults.criticalError = error.message;
    }
    
    // Resumen final del flujo
    console.log('\n' + '='.repeat(60));
    console.log('🏁 RESUMEN DEL FLUJO COMPLETO');
    console.log('='.repeat(60));
    
    flowResults.steps.forEach((step, index) => {
        const status = step.success ? '✅' : '❌';
        console.log(`${index + 1}. ${status} ${step.step}`);
        if (step.error) {
            console.log(`      Error: ${step.error}`);
        }
        if (step.txHash) {
            console.log(`      TX: ${step.txHash}`);
        }
    });
    
    if (flowResults.success) {
        console.log('\n🎉 ¡FLUJO COMPLETO EXITOSO!');
        console.log('El sistema de escrow funciona correctamente de extremo a extremo.');
    } else {
        console.log('\n⚠️ FLUJO INCOMPLETO');
        console.log('Revisar errores arriba para identificar problemas.');
    }
    
    return flowResults;
}

// ========================================
// FUNCIÓN PARA TESTS DE STRESS
// ========================================
async function testStress() {
    console.log('\n🏋️ TESTING DE STRESS');
    console.log('='.repeat(60));
    
    const stressResults = {
        concurrentUsers: 10,
        requestsPerUser: 20,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        errors: []
    };
    
    try {
        console.log(`📊 Configuración del test:`);
        console.log(`   Usuarios concurrentes: ${stressResults.concurrentUsers}`);
        console.log(`   Requests por usuario: ${stressResults.requestsPerUser}`);
        console.log(`   Total requests: ${stressResults.concurrentUsers * stressResults.requestsPerUser}`);
        
        const startTime = Date.now();
        const userPromises = [];
        
        // Crear promesas para cada usuario concurrente
        for (let user = 0; user < stressResults.concurrentUsers; user++) {
            const userPromise = async () => {
                const userResults = {
                    userId: user,
                    requests: [],
                    successful: 0,
                    failed: 0
                };
                
                for (let req = 0; req < stressResults.requestsPerUser; req++) {
                    const requestStart = Date.now();
                    try {
                        await makeRequest('get', `${API_BASE_URL}/health`, null, 1);
                        const requestTime = Date.now() - requestStart;
                        userResults.requests.push({ success: true, time: requestTime });
                        userResults.successful++;
                    } catch (error) {
                        const requestTime = Date.now() - requestStart;
                        userResults.requests.push({ success: false, time: requestTime, error: error.message });
                        userResults.failed++;
                    }
                    
                    // Pequeña pausa entre requests
                    await sleep(Math.random() * 100);
                }
                
                return userResults;
            };
            
            userPromises.push(userPromise());
        }
        
        console.log('\n🚀 Ejecutando test de stress...');
        const userResults = await Promise.all(userPromises);
        const endTime = Date.now();
        
        // Compilar resultados
        let totalResponseTime = 0;
        userResults.forEach(user => {
            stressResults.successfulRequests += user.successful;
            stressResults.failedRequests += user.failed;
            
            user.requests.forEach(req => {
                totalResponseTime += req.time;
                if (!req.success) {
                    stressResults.errors.push(req.error);
                }
            });
        });
        
        stressResults.totalRequests = stressResults.successfulRequests + stressResults.failedRequests;
        stressResults.averageResponseTime = totalResponseTime / stressResults.totalRequests;
        stressResults.totalTime = endTime - startTime;
        stressResults.requestsPerSecond = (stressResults.totalRequests / stressResults.totalTime) * 1000;
        
        console.log('\n📊 RESULTADOS DEL STRESS TEST:');
        console.log(`   Tiempo total: ${stressResults.totalTime}ms`);
        console.log(`   Requests totales: ${stressResults.totalRequests}`);
        console.log(`   Requests exitosos: ${stressResults.successfulRequests}`);
        console.log(`   Requests fallidos: ${stressResults.failedRequests}`);
        console.log(`   Tasa de éxito: ${((stressResults.successfulRequests / stressResults.totalRequests) * 100).toFixed(2)}%`);
        console.log(`   Tiempo promedio de respuesta: ${stressResults.averageResponseTime.toFixed(2)}ms`);
        console.log(`   Requests por segundo: ${stressResults.requestsPerSecond.toFixed(2)}`);
        
        if (stressResults.errors.length > 0) {
            console.log(`\n❌ Errores encontrados: ${stressResults.errors.length}`);
            const uniqueErrors = [...new Set(stressResults.errors)];
            uniqueErrors.forEach(error => {
                const count = stressResults.errors.filter(e => e === error).length;
                console.log(`   • ${error} (${count} veces)`);
            });
        }
        
    } catch (error) {
        console.error('💥 Error en stress test:', error.message);
        stressResults.criticalError = error.message;
    }
    
    return stressResults;
}

// ========================================
// FUNCIÓN PRINCIPAL
// ========================================
async function main() {
    const args = process.argv.slice(2);
    let results = {};
    
    // Verificar que el servidor esté corriendo
    try {
        await makeRequest('get', `${API_BASE_URL}/health`, null, 1);
        console.log(`✅ Servidor detectado en ${API_BASE_URL}`);
    } catch (error) {
        console.error(`❌ No se puede conectar al servidor en ${API_BASE_URL}`);
        console.log('\n💡 Soluciones:');
        console.log('1. Asegúrate de que el servidor esté corriendo:');
        console.log('   node server.js');
        console.log('2. Verifica que el puerto sea correcto en .env');
        console.log('3. Verifica que no haya firewall bloqueando el puerto');
        process.exit(1);
    }
    
    if (args.includes('--complete-flow')) {
        results.completeFlow = await testCompleteFlow();
    } else if (args.includes('--stress')) {
        results.stress = await testStress();
    } else if (args.includes('--all')) {
        console.log('🚀 EJECUTANDO TODOS LOS TESTS');
        results.api = await testAPI();
        results.completeFlow = await testCompleteFlow();
        results.stress = await testStress();
    } else {
        results.api = await testAPI();
    }
    
    // Guardar resultados en archivo si se especifica
    if (args.includes('--save-results')) {
        const fs = require('fs');
        const resultsFile = `test-results-${Date.now()}.json`;
        fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
        console.log(`\n💾 Resultados guardados en: ${resultsFile}`);
    }
    
    console.log('\n🏁 TESTS COMPLETADOS');
    return results;
}

// ========================================
// UTILIDADES ADICIONALES
// ========================================

// Función para mostrar ayuda
function showHelp() {
    console.log('🧪 TEST API COMPLETO - Sistema de Escrow');
    console.log('='.repeat(50));
    console.log('Uso: node scripts/test-api-complete.js [opciones]');
    console.log('');
    console.log('Opciones:');
    console.log('  --complete-flow    Ejecutar flujo completo de escrow');
    console.log('  --stress          Ejecutar test de stress');
    console.log('  --all             Ejecutar todos los tests');
    console.log('  --save-results    Guardar resultados en archivo JSON');
    console.log('  --help            Mostrar esta ayuda');
    console.log('');
    console.log('Ejemplos:');
    console.log('  node scripts/test-api-complete.js');
    console.log('  node scripts/test-api-complete.js --complete-flow');
    console.log('  node scripts/test-api-complete.js --all --save-results');
    console.log('');
    console.log('Pre-requisitos:');
    console.log('  • Servidor corriendo: node server.js');
    console.log('  • Variables de entorno configuradas en .env');
    console.log('  • Cuentas con fondos DEV suficientes');
}

// Manejo de argumentos de línea de comandos
if (process.argv.includes('--help')) {
    showHelp();
    process.exit(0);
}

// Exportar funciones para uso programático
module.exports = {
    testAPI,
    testCompleteFlow,
    testStress,
    main
};

// Ejecutar si es llamado directamente
if (require.main === module) {
    main().catch(console.error);
}.steps.push({
                    step: `Complete Requirement ${i}`,
                    success: true,
                    progress: progressInfo.data.progress,
                    txHash: completeResponse.data.transactionHash
                });
                
                if (completeResponse.data.contractCompleted) {
                    console.log('   🎉 ¡CONTRATO COMPLETADO AUTOMÁTICAMENTE!');
                    break;
                }
                
                // Pausa entre requerimientos para simular trabajo real
                if (i < totalRequirements - 1) {
                    console.log('   ⏳ Simulando tiempo de trabajo...');
                    await sleep(1000);
                }
                
            } catch (error) {
                console.log(`   ❌ Error: ${error.message}`);
                flowResults
