// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title EscrowContract
 * @dev Smart contract para gestionar transacciones de escrow descentralizado
 * @notice Este contrato permite transacciones seguras entre dos empresas con un árbitro
 */
contract EscrowContract {
    
    // ========================================
    // ESTADOS DEL CONTRATO
    // ========================================
    enum ContractState {
        CREATED,        // Recién creado, esperando depósito
        FUNDED,         // Fondos depositados por Empresa1
        IN_PROGRESS,    // Ejecutándose, completando requerimientos
        COMPLETED,      // Todos los requerimientos completados, fondos transferidos
        CANCELLED       // Cancelado por árbitro, fondos devueltos
    }
    
    // ========================================
    // ESTRUCTURA DE DATOS
    // ========================================
    struct Requirement {
        string description;     // Descripción del requerimiento
        bool completed;         // Si está completado o no
        uint256 completedTime;  // Timestamp cuando se completó
    }
    
    // ========================================
    // VARIABLES DE ESTADO
    // ========================================
    address public arbitro;           // Dirección del árbitro
    address public empresa1;          // Dirección de la empresa que paga (depositor)
    address public empresa2;          // Dirección de la empresa que recibe (beneficiary)
    uint256 public amount;            // Cantidad depositada en el contrato
    ContractState public state;       // Estado actual del contrato
    
    Requirement[] public requirements; // Array de requerimientos
    uint256 public completedCount;     // Cantidad de requerimientos completados
    
    uint256 public createdTime;       // Timestamp de creación
    uint256 public completedTime;     // Timestamp de finalización
    
    // ========================================
    // EVENTOS
    // ========================================
    event ContractCreated(
        address indexed arbitro,
        address indexed empresa1,
        address indexed empresa2,
        uint256 totalRequirements,
        uint256 timestamp
    );
    
    event FundsDeposited(
        address indexed depositor,
        uint256 amount,
        uint256 timestamp
    );
    
    event RequirementCompleted(
        uint256 indexed requirementId,
        string description,
        address indexed completedBy,
        uint256 timestamp
    );
    
    event ContractCompleted(
        address indexed beneficiary,
        uint256 amount,
        uint256 timestamp
    );
    
    event ContractCancelled(
        address indexed cancelledBy,
        address indexed refundTo,
        uint256 amount,
        uint256 timestamp
    );
    
    // ========================================
    // MODIFICADORES
    // ========================================
    modifier onlyArbitro() {
        require(msg.sender == arbitro, "Solo el arbitro puede ejecutar esta funcion");
        _;
    }
    
    modifier onlyEmpresa1() {
        require(msg.sender == empresa1, "Solo Empresa1 puede ejecutar esta funcion");
        _;
    }
    
    modifier inState(ContractState _state) {
        require(state == _state, "Estado del contrato invalido para esta operacion");
        _;
    }
    
    modifier validRequirementId(uint256 _requirementId) {
        require(_requirementId < requirements.length, "ID de requerimiento invalido");
        _;
    }
    
    // ========================================
    // CONSTRUCTOR
    // ========================================
    /**
     * @dev Constructor del contrato
     * @param _empresa1 Dirección de la empresa que depositará fondos
     * @param _empresa2 Dirección de la empresa que recibirá fondos
     * @param _requirements Array de descripciones de requerimientos
     */
    constructor(
        address _empresa1,
        address _empresa2,
        string[] memory _requirements
    ) {
        require(_empresa1 != address(0), "Direccion de Empresa1 invalida");
        require(_empresa2 != address(0), "Direccion de Empresa2 invalida");
        require(_empresa1 != _empresa2, "Las empresas deben ser diferentes");
        require(_requirements.length > 0, "Debe haber al menos un requerimiento");
        require(_requirements.length <= 50, "Maximo 50 requerimientos permitidos");
        
        arbitro = msg.sender;
        empresa1 = _empresa1;
        empresa2 = _empresa2;
        state = ContractState.CREATED;
        createdTime = block.timestamp;
        completedCount = 0;
        
        // Inicializar requerimientos
        for (uint256 i = 0; i < _requirements.length; i++) {
            require(bytes(_requirements[i]).length > 0, "Requerimiento no puede estar vacio");
            requirements.push(Requirement({
                description: _requirements[i],
                completed: false,
                completedTime: 0
            }));
        }
        
        emit ContractCreated(arbitro, empresa1, empresa2, requirements.length, block.timestamp);
    }
    
    // ========================================
    // FUNCIONES PRINCIPALES
    // ========================================
    
    /**
     * @dev Empresa1 deposita fondos en el contrato
     * @notice Solo Empresa1 puede depositar fondos
     */
    function depositFunds() external payable onlyEmpresa1 inState(ContractState.CREATED) {
        require(msg.value > 0, "El monto debe ser mayor a 0");
        
        amount = msg.value;
        state = ContractState.IN_PROGRESS;
        
        emit FundsDeposited(msg.sender, msg.value, block.timestamp);
    }
    
    /**
     * @dev Árbitro marca un requerimiento como completado
     * @param _requirementId ID del requerimiento a completar
     */
    function completeRequirement(uint256 _requirementId) 
        external 
        onlyArbitro 
        inState(ContractState.IN_PROGRESS)
        validRequirementId(_requirementId)
    {
        require(!requirements[_requirementId].completed, "Requerimiento ya completado");
        
        requirements[_requirementId].completed = true;
        requirements[_requirementId].completedTime = block.timestamp;
        completedCount++;
        
        emit RequirementCompleted(
            _requirementId,
            requirements[_requirementId].description,
            msg.sender,
            block.timestamp
        );
        
        // Si todos los requerimientos están completados, finalizar contrato
        if (completedCount == requirements.length) {
            _completeContract();
        }
    }
    
    /**
     * @dev Árbitro cancela el contrato y devuelve fondos a Empresa1
     * @notice Solo se puede cancelar si no está completado
     */
    function cancelContract() external onlyArbitro {
        require(state == ContractState.IN_PROGRESS || state == ContractState.CREATED, 
                "No se puede cancelar en este estado");
        
        uint256 refundAmount = address(this).balance;
        state = ContractState.CANCELLED;
        
        if (refundAmount > 0) {
            (bool success, ) = empresa1.call{value: refundAmount}("");
            require(success, "Error al devolver fondos");
        }
        
        emit ContractCancelled(msg.sender, empresa1, refundAmount, block.timestamp);
    }
    
    /**
     * @dev Función interna para completar el contrato y transferir fondos
     */
    function _completeContract() internal {
        require(state == ContractState.IN_PROGRESS, "Estado invalido para completar");
        require(completedCount == requirements.length, "No todos los requerimientos completados");
        
        uint256 transferAmount = address(this).balance;
        state = ContractState.COMPLETED;
        completedTime = block.timestamp;
        
        // Transferir todos los fondos a Empresa2
        (bool success, ) = empresa2.call{value: transferAmount}("");
        require(success, "Error al transferir fondos");
        
        emit ContractCompleted(empresa2, transferAmount, block.timestamp);
    }
    
    // ========================================
    // FUNCIONES DE CONSULTA
    // ========================================
    
    /**
     * @dev Obtiene información completa del contrato
     * @return _arbitro Dirección del árbitro
     * @return _empresa1 Dirección de empresa1
     * @return _empresa2 Dirección de empresa2
     * @return _amount Monto depositado
     * @return _state Estado actual del contrato
     * @return _totalRequirements Total de requerimientos
     * @return _completedRequirements Requerimientos completados
     * @return _balance Balance actual del contrato
     * @return _createdTime Timestamp de creación
     * @return _completedTime Timestamp de finalización
     */
    function getContractInfo() external view returns (
        address _arbitro,
        address _empresa1,
        address _empresa2,
        uint256 _amount,
        ContractState _state,
        uint256 _totalRequirements,
        uint256 _completedRequirements,
        uint256 _balance,
        uint256 _createdTime,
        uint256 _completedTime
    ) {
        return (
            arbitro,
            empresa1,
            empresa2,
            amount,
            state,
            requirements.length,
            completedCount,
            address(this).balance,
            createdTime,
            completedTime
        );
    }
    
    /**
     * @dev Obtiene información de un requerimiento específico
     * @param _requirementId ID del requerimiento
     * @return description Descripción del requerimiento
     * @return completed Si está completado
     * @return reqCompletedTime Timestamp de completado
     */
    function getRequirement(uint256 _requirementId) 
        external 
        view 
        validRequirementId(_requirementId)
        returns (string memory description, bool completed, uint256 reqCompletedTime) 
    {
        Requirement memory req = requirements[_requirementId];
        return (req.description, req.completed, req.completedTime);
    }
    
    /**
     * @dev Obtiene todos los requerimientos
     * @return descriptions Array de descripciones
     * @return completed Array de estados de completado
     * @return completedTimes Array de timestamps de completado
     */
    function getAllRequirements() external view returns (
        string[] memory descriptions,
        bool[] memory completed,
        uint256[] memory completedTimes
    ) {
        uint256 length = requirements.length;
        descriptions = new string[](length);
        completed = new bool[](length);
        completedTimes = new uint256[](length);
        
        for (uint256 i = 0; i < length; i++) {
            descriptions[i] = requirements[i].description;
            completed[i] = requirements[i].completed;
            completedTimes[i] = requirements[i].completedTime;
        }
        
        return (descriptions, completed, completedTimes);
    }
    
    /**
     * @dev Obtiene el balance actual del contrato
     * @return Balance en wei
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
    
    /**
     * @dev Obtiene el progreso actual del contrato
     * @return Porcentaje de completado (0-100)
     */
    function getProgress() external view returns (uint256) {
        if (requirements.length == 0) return 0;
        return (completedCount * 100) / requirements.length;
    }
    
    // ========================================
    // FUNCIONES DE EMERGENCIA
    // ========================================
    
    /**
     * @dev Función de emergencia para recuperar fondos (solo si hay un error crítico)
     * @notice Solo el árbitro puede ejecutar en casos extremos
     */
    function emergencyWithdraw() external onlyArbitro {
        require(state == ContractState.CANCELLED, "Solo disponible en estado cancelado");
        
        uint256 balance = address(this).balance;
        if (balance > 0) {
            (bool success, ) = arbitro.call{value: balance}("");
            require(success, "Error en retiro de emergencia");
        }
    }
    
    // ========================================
    // FUNCIONES DE INFORMACIÓN
    // ========================================
    
    /**
     * @dev Verifica si el contrato puede ser completado
     * @return true si todos los requerimientos están completados
     */
    function canComplete() external view returns (bool) {
        return completedCount == requirements.length && state == ContractState.IN_PROGRESS;
    }
    
    /**
     * @dev Obtiene información resumida para dashboards
     * @return _state Estado del contrato
     * @return _progress Progreso porcentual
     * @return _balance Balance actual
     * @return _totalRequirements Total de requerimientos
     * @return _completedRequirements Requerimientos completados
     */
    function getSummary() external view returns (
        ContractState _state,
        uint256 _progress,
        uint256 _balance,
        uint256 _totalRequirements,
        uint256 _completedRequirements
    ) {
        uint256 progress = requirements.length > 0 ? (completedCount * 100) / requirements.length : 0;
        return (state, progress, address(this).balance, requirements.length, completedCount);
    }
}
