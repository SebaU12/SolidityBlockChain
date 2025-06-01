const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('EscrowContract', function () {
    let escrowContract;
    let arbitro, empresa1, empresa2, otherAccount;
    let contractAddress;

    const requirements = [
        "Entregar documentación técnica",
        "Completar desarrollo",
        "Pasar testing"
    ];

    const depositAmount = ethers.parseEther("1.0"); // 1 DEV

    beforeEach(async function () {
        // Obtener signers
        [arbitro, empresa1, empresa2, otherAccount] = await ethers.getSigners();

        // Desplegar contrato
        const EscrowContract = await ethers.getContractFactory('EscrowContract');
        escrowContract = await EscrowContract.deploy(
            empresa1.address,
            empresa2.address,
            requirements
        );
        
        await escrowContract.waitForDeployment();
        contractAddress = await escrowContract.getAddress();
    });

    describe('Deployment', function () {
        it('Debería configurar correctamente las direcciones', async function () {
            expect(await escrowContract.arbitro()).to.equal(arbitro.address);
            expect(await escrowContract.empresa1()).to.equal(empresa1.address);
            expect(await escrowContract.empresa2()).to.equal(empresa2.address);
        });

        it('Debería inicializar en estado CREATED', async function () {
            expect(await escrowContract.state()).to.equal(0); // CREATED
        });

        it('Debería configurar correctamente los requerimientos', async function () {
            const [descriptions, completed, times] = await escrowContract.getAllRequirements();
            
            expect(descriptions.length).to.equal(requirements.length);
            expect(descriptions[0]).to.equal(requirements[0]);
            expect(completed.every(c => c === false)).to.be.true;
        });
    });

    describe('Deposit Funds', function () {
        it('Debería permitir a Empresa1 depositar fondos', async function () {
            await expect(
                escrowContract.connect(empresa1).depositFunds({ value: depositAmount })
            ).to.emit(escrowContract, 'FundsDeposited')
             .withArgs(empresa1.address, depositAmount, anyValue);

            expect(await escrowContract.state()).to.equal(2); // IN_PROGRESS
            expect(await escrowContract.amount()).to.equal(depositAmount);
        });

        it('No debería permitir a otros depositar fondos', async function () {
            await expect(
                escrowContract.connect(empresa2).depositFunds({ value: depositAmount })
            ).to.be.revertedWith('Solo Empresa1 puede ejecutar esta funcion');
        });

        it('No debería permitir depósitos de 0', async function () {
            await expect(
                escrowContract.connect(empresa1).depositFunds({ value: 0 })
            ).to.be.revertedWith('El monto debe ser mayor a 0');
        });
    });

    describe('Complete Requirements', function () {
        beforeEach(async function () {
            // Depositar fondos primero
            await escrowContract.connect(empresa1).depositFunds({ value: depositAmount });
        });

        it('Debería permitir al árbitro completar requerimientos', async function () {
            await expect(
                escrowContract.connect(arbitro).completeRequirement(0)
            ).to.emit(escrowContract, 'RequirementCompleted')
             .withArgs(0, requirements[0], arbitro.address, anyValue);

            const [, completed,] = await escrowContract.getAllRequirements();
            expect(completed[0]).to.be.true;
            expect(await escrowContract.completedCount()).to.equal(1);
        });

        it('No debería permitir a otros completar requerimientos', async function () {
            await expect(
                escrowContract.connect(empresa1).completeRequirement(0)
            ).to.be.revertedWith('Solo el arbitro puede ejecutar esta funcion');
        });

        it('No debería permitir completar el mismo requerimiento dos veces', async function () {
            await escrowContract.connect(arbitro).completeRequirement(0);
            
            await expect(
                escrowContract.connect(arbitro).completeRequirement(0)
            ).to.be.revertedWith('Requerimiento ya completado');
        });

        it('Debería completar el contrato cuando todos los requerimientos estén completados', async function () {
            const empresa2BalanceBefore = await ethers.provider.getBalance(empresa2.address);

            // Completar todos los requerimientos
            for (let i = 0; i < requirements.length; i++) {
                await escrowContract.connect(arbitro).completeRequirement(i);
            }

            expect(await escrowContract.state()).to.equal(3); // COMPLETED
            
            const empresa2BalanceAfter = await ethers.provider.getBalance(empresa2.address);
            expect(empresa2BalanceAfter - empresa2BalanceBefore).to.equal(depositAmount);
        });
    });

    describe('Cancel Contract', function () {
        it('Debería permitir al árbitro cancelar el contrato sin fondos', async function () {
            await expect(
                escrowContract.connect(arbitro).cancelContract()
            ).to.emit(escrowContract, 'ContractCancelled');

            expect(await escrowContract.state()).to.equal(4); // CANCELLED
        });

        it('Debería devolver fondos a Empresa1 al cancelar', async function () {
            await escrowContract.connect(empresa1).depositFunds({ value: depositAmount });
            
            const empresa1BalanceBefore = await ethers.provider.getBalance(empresa1.address);
            
            await escrowContract.connect(arbitro).cancelContract();
            
            expect(await escrowContract.state()).to.equal(4); // CANCELLED
            
            const empresa1BalanceAfter = await ethers.provider.getBalance(empresa1.address);
            expect(empresa1BalanceAfter - empresa1BalanceBefore).to.equal(depositAmount);
        });

        it('No debería permitir cancelar un contrato completado', async function () {
            await escrowContract.connect(empresa1).depositFunds({ value: depositAmount });
            
            // Completar todos los requerimientos
            for (let i = 0; i < requirements.length; i++) {
                await escrowContract.connect(arbitro).completeRequirement(i);
            }

            await expect(
                escrowContract.connect(arbitro).cancelContract()
            ).to.be.revertedWith('No se puede cancelar en este estado');
        });
    });

    describe('View Functions', function () {
        beforeEach(async function () {
            await escrowContract.connect(empresa1).depositFunds({ value: depositAmount });
        });

        it('Debería retornar información correcta del contrato', async function () {
            const info = await escrowContract.getContractInfo();
            
            expect(info[0]).to.equal(arbitro.address); // arbitro
            expect(info[1]).to.equal(empresa1.address); // empresa1
            expect(info[2]).to.equal(empresa2.address); // empresa2
            expect(info[3]).to.equal(depositAmount); // amount
            expect(info[4]).to.equal(2); // state (IN_PROGRESS)
            expect(info[5]).to.equal(requirements.length); // totalRequirements
            expect(info[6]).to.equal(0); // completedRequirements
            expect(info[7]).to.equal(depositAmount); // balance
        });

        it('Debería retornar progreso correcto', async function () {
            expect(await escrowContract.getProgress()).to.equal(0);
            
            await escrowContract.connect(arbitro).completeRequirement(0);
            expect(await escrowContract.getProgress()).to.equal(33); // 1/3 * 100 = 33
            
            await escrowContract.connect(arbitro).completeRequirement(1);
            expect(await escrowContract.getProgress()).to.equal(66); // 2/3 * 100 = 66
        });

        it('Debería retornar información de requerimiento específico', async function () {
            const [description, completed, completedTime] = await escrowContract.getRequirement(0);
            
            expect(description).to.equal(requirements[0]);
            expect(completed).to.be.false;
            expect(completedTime).to.equal(0);
        });

        it('Debería indicar si puede completarse', async function () {
            expect(await escrowContract.canComplete()).to.be.false;
            
            // Completar todos menos uno
            for (let i = 0; i < requirements.length - 1; i++) {
                await escrowContract.connect(arbitro).completeRequirement(i);
            }
            
            expect(await escrowContract.canComplete()).to.be.false;
            
            // Completar el último
            await escrowContract.connect(arbitro).completeRequirement(requirements.length - 1);
            expect(await escrowContract.canComplete()).to.be.false; // Ya completado automáticamente
        });
    });

    describe('Edge Cases', function () {
        it('Debería manejar requerimiento ID inválido', async function () {
            await escrowContract.connect(empresa1).depositFunds({ value: depositAmount });
            
            await expect(
                escrowContract.connect(arbitro).completeRequirement(999)
            ).to.be.revertedWith('ID de requerimiento invalido');
        });

        it('Debería retornar balance correcto', async function () {
            expect(await escrowContract.getBalance()).to.equal(0);
            
            await escrowContract.connect(empresa1).depositFunds({ value: depositAmount });
            expect(await escrowContract.getBalance()).to.equal(depositAmount);
        });

        it('Debería manejar getSummary correctamente', async function () {
            await escrowContract.connect(empresa1).depositFunds({ value: depositAmount });
            await escrowContract.connect(arbitro).completeRequirement(0);
            
            const [state, progress, balance, total, completed] = await escrowContract.getSummary();
            
            expect(state).to.equal(2); // IN_PROGRESS
            expect(progress).to.equal(33); // 1/3 * 100
            expect(balance).to.equal(depositAmount);
            expect(total).to.equal(requirements.length);
            expect(completed).to.equal(1);
        });
    });

    describe('Security', function () {
        it('No debería permitir crear contrato con direcciones inválidas', async function () {
            const EscrowContract = await ethers.getContractFactory('EscrowContract');
            
            await expect(
                EscrowContract.deploy(ethers.ZeroAddress, empresa2.address, requirements)
            ).to.be.revertedWith('Direccion de Empresa1 invalida');
            
            await expect(
                EscrowContract.deploy(empresa1.address, ethers.ZeroAddress, requirements)
            ).to.be.revertedWith('Direccion de Empresa2 invalida');
            
            await expect(
                EscrowContract.deploy(empresa1.address, empresa1.address, requirements)
            ).to.be.revertedWith('Las empresas deben ser diferentes');
        });

        it('No debería permitir crear contrato sin requerimientos', async function () {
            const EscrowContract = await ethers.getContractFactory('EscrowContract');
            
            await expect(
                EscrowContract.deploy(empresa1.address, empresa2.address, [])
            ).to.be.revertedWith('Debe haber al menos un requerimiento');
        });

        it('No debería permitir emergencyWithdraw en estado incorrecto', async function () {
            await expect(
                escrowContract.connect(arbitro).emergencyWithdraw()
            ).to.be.revertedWith('Solo disponible en estado cancelado');
        });
    });
});

// Helper para valores any en los tests
const anyValue = require('@nomicfoundation/hardhat-chai-matchers/withArgs');
