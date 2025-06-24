export type ICommunicationTypes =
	// Obtención de datos virtuales del workflow
	| 'getVirtualProperties' // Obtiene las propiedades virtuales del workflow
	| 'getVirtualNodes' // Obtiene los nodos virtuales del workflow
	| 'getVirtualConnections' // Obtiene las conexiones virtuales entre nodos
	| 'getVirtualProject' // Obtiene la configuración del proyecto virtual
	| 'connectionError'
	| 'virtualChangeProperties'
	| 'virtualChangePosition'
	| 'virtualActionNode'
	| 'virtualAddNode'
	| 'virtualAddConnection'
	| 'virtualRemoveConnection'
	| 'virtualRemoveNode'
