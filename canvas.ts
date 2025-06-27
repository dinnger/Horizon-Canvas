import './style/style.css'
import '@fontsource-variable/comfortaa'
import type { ICommunicationTypes } from './interfaz/connect.interface.js'
import type { INodeCanvas, INodeConnections } from './interfaz/node.interface.js'
import {
	drawNodeConnectionPreview,
	renderSelected,
	getTempConnection,
	subscriberHelper,
	setIndexTime,
	renderAnimation
} from './canvasHelpers'
import { pattern_dark, pattern_light } from './canvasPattern'
import { v4 as uuidv4 } from 'uuid'
import { Nodes, type ICanvasNodeNew } from './canvasNodes'

export interface ILog {
	logs?: object
}

type EventsCanvas =
	| 'node_context'
	| 'node_selected'
	| 'node_deselected'
	| 'node_moved'
	| 'node_added'
	| 'node_removed'
	| 'node_connection_selected'
	| 'mouse_move'
	| 'zoom'
	| 'clear'

/**
 * Clase principal que maneja el canvas de flujo de trabajo.
 * Gestiona la renderización, eventos, y operaciones de nodos y conexiones.
 */
export class Canvas {
	canvas: HTMLCanvasElement
	context: CanvasRenderingContext2D
	ctx: CanvasRenderingContext2D
	canvasTranslate: { x: number; y: number } = { x: 0, y: 0 }
	canvasTempPosX = 0
	canvasTempPosY = 0
	canvasWidth = 0
	canvasHeight = 0
	canvasFactor = 1
	canvasPattern: CanvasPattern | undefined
	canvasRelativePos: INodeCanvas['design'] = { x: 0, y: 0 }
	canvasPosition: INodeCanvas['design'] = { x: 0, y: 0 }
	canvasGrid = 40
	canvasSelect: {
		x1: number
		y1: number
		x2: number
		y2: number
		show: boolean
	} = { x1: 0, y1: 0, x2: 0, y2: 0, show: false }

	// setInterval
	backgroundUpdateInterval: ReturnType<typeof setInterval> | null = null
	canvasFps: number = 1000 / 40
	indexTime = 0
	theme: string

	nodes: Nodes

	selectedNode: ICanvasNodeNew[] = []
	newConnectionNode: {
		node: INodeCanvas
		type: 'input' | 'output' | 'callback'
		index: number
		value: any
		relative?: { x: number; y: number }
	} | null = null

	isNodeConnectionVisible = false

	eventsCanvas = ['mousedown', 'mouseup', 'mousemove', 'wheel', 'dblclick', 'contextmenu']
	eventsType: 'cursor' | 'move' = 'cursor'

	isDragging = false

	subscribers: {
		event: EventsCanvas | EventsCanvas[]
		callback: (e: any) => any
	}[] = []

	constructor({
		canvas,
		theme
	}: {
		canvas: HTMLCanvasElement
		theme: string
	}) {
		this.canvas = canvas
		this.context = canvas.getContext('2d') as CanvasRenderingContext2D
		this.ctx = this.context
		this.nodes = new Nodes({
			canvasTranslate: this.canvasTranslate,
			ctx: this.ctx
		})
		this.theme = theme
		this.init()
	}

	/**
	 * Inicializa el canvas configurando eventos y cargando datos iniciales.
	 * @param nodes - Nodos iniciales a cargar
	 * @param connections - Conexiones iniciales a establecer
	 */
	init() {
		this.eventResize()
		for (const event of this.eventsCanvas) {
			this.canvas.addEventListener(event as any, (e) => {
				e.preventDefault()
				e.stopPropagation()
				this.events({ event: event as string, e })
			})
		}
		window.addEventListener('resize', () => this.eventResize())
		document.addEventListener('mouseup', this.eventMouseUp)

		this.addImageProcess(this.theme === 'light' ? pattern_light : pattern_dark).then((img) => {
			this.canvasPattern = this.ctx.createPattern(img, 'repeat') as CanvasPattern
			this.background()
			if (this.backgroundUpdateInterval) {
				clearInterval(this.backgroundUpdateInterval)
			}

			this.backgroundUpdateInterval = setInterval(() => {
				this.indexTime++
				setIndexTime(this.indexTime)
				if (this.indexTime > 100) this.indexTime = 0
				this.background()
			}, this.canvasFps)
		})
	}

	/**
	 * Carga nodos y conexiones en el canvas.
	 * @param nodes - Diccionario de nodos indexados por ID
	 * @param connections - Array de conexiones entre nodos
	 */
	private load({
		nodes,
		connections
	}: {
		nodes: { [key: string]: INodeCanvas }
		connections: INodeConnections[]
	}) {
		for (const [key, node] of Object.entries(nodes)) {
			this.nodes.addNode({ ...node, id: key })
		}
		for (const connection of connections) {
			this.nodes.addConnection(connection)
		}
	}

	/**
	 * Emite eventos a los suscriptores registrados.
	 * @param event - Tipo de evento o array de tipos
	 * @param e - Datos del evento
	 */
	private emit = (event: EventsCanvas | EventsCanvas[], e: any) => {
		const events = !Array.isArray(event) ? [event] : event
		for (const event of events) {
			for (const subscriber of this.subscribers.filter((f) => f.event === event)) {
				if (subscriber.callback) subscriber.callback(e)
			}
		}
	}

	/**
	 * Carga una imagen de forma asíncrona.
	 * @param src - URL de la imagen a cargar
	 * @returns Promise que resuelve con la imagen cargada
	 */
	private addImageProcess(src: string): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const img = new Image()
			img.onload = () => resolve(img)
			img.onerror = reject
			img.src = src
		})
	}

	/**
	 * Renderiza el fondo del canvas y todos los elementos visuales.
	 */
	private background() {
		if (!this.canvas || !this.ctx || !this.canvasPattern) return
		const x = this.canvasTranslate.x
		const y = this.canvasTranslate.y
		const x_ = -x / this.canvasFactor
		const y_ = -y / this.canvasFactor
		const w_ = this.canvasWidth / this.canvasFactor
		const h_ = this.canvasHeight / this.canvasFactor

		this.ctx.clearRect(x_, y_, w_, h_)
		this.ctx.save()
		this.ctx.translate(x, y)
		this.ctx.scale(this.canvasFactor, this.canvasFactor)
		this.ctx.clearRect(x_, y_, w_, h_)
		this.ctx.fillStyle = this.canvasPattern
		this.ctx.fillRect(x_, y_, w_, h_)
		this.ctx.globalAlpha = 1.0
		this.ctx.imageSmoothingEnabled = this.ctx.imageSmoothingEnabled = true

		this.nodes.render({ ctx: this.ctx })

		if (this.canvasSelect.show) {
			this.nodes.selectedMultiple({
				range: this.canvasSelect,
				relative: this.canvasRelativePos
			})
			renderSelected({
				canvasSelect: this.canvasSelect,
				theme: this.theme,
				ctx: this.ctx
			})
		}

		renderAnimation({ ctx: this.ctx })

		if (this.newConnectionNode) {
			drawNodeConnectionPreview({
				node_connection_new: this.newConnectionNode.node,
				type: this.newConnectionNode.type,
				index: this.newConnectionNode.index,
				canvasRelativePos: this.newConnectionNode.relative || this.canvasRelativePos,
				nodes: this.nodes.getNodes(),
				ctx: this.ctx
			})
		}

		this.ctx.restore()
	}

	/**
	 * Registra un callback para eventos específicos del canvas.
	 * @param event - Tipo de evento o array de tipos
	 * @param callback - Función a ejecutar cuando ocurra el evento
	 */
	subscriber = (event: EventsCanvas | EventsCanvas[], callback: (e: any) => any) => {
		if (Array.isArray(event)) {
			for (const e of event) {
				this.subscriber(e, callback)
			}
			return
		}
		this.subscribers.push({ event, callback })
	}

	/**
	 * Dispatcher principal de eventos del canvas.
	 * @param event - Nombre del evento
	 * @param e - Objeto del evento
	 */
	private events({ event, e }: { event: string; e: any }) {
		switch (event) {
			case 'mousedown':
				this.eventMouseDown(e)
				break
			case 'mouseup':
				this.eventMouseUp(e)
				break
			case 'mousemove':
				this.eventMouseMove(e)
				break
			case 'wheel':
				this.eventWheel(e)
				break
			case 'dblclick':
				this.eventDbClick(e)
				break
			case 'contextmenu':
				this.eventContextMenu(e)
				break
		}
	}

	/**
	 * Maneja el evento de mouse down para iniciar arrastre y selección.
	 * @param e - Evento del mouse
	 */
	private eventMouseDown = (e: MouseEvent) => {
		this.canvasTempPosX = e.clientX - this.canvasTranslate.x
		this.canvasTempPosY = e.clientY - this.canvasTranslate.y
		if (e.button === 0 || e.button === 2) {
			this.newConnectionNode = this.nodes.selected({
				relative: this.canvasRelativePos
			})
			this.selectedNode = this.nodes.getSelected()
			this.isDragging = true

			if (this.selectedNode.length === 0) {
				this.emit('node_selected', null)
			}
			if (!this.newConnectionNode) {
				this.emit('node_connection_selected', null)
			}
			if (this.selectedNode.length === 0 && !this.newConnectionNode) {
				this.isNodeConnectionVisible = false
				this.emit('clear', null)
			}
		}

		if (e.button === 1) {
			this.eventMouseUp(e)
			this.eventsType = 'move'
		}
	}

	/**
	 * Maneja el evento de mouse up para finalizar arrastre.
	 * @param e - Evento del mouse
	 */
	private eventMouseUp = (e: MouseEvent) => {
		this.isDragging = false
		if (e.button === 1) this.eventsType = 'cursor'
		if (e.button === 0) this.eventMouseEnd()
	}

	/**
	 * Maneja el movimiento del mouse para arrastre y selección múltiple.
	 * @param e - Evento del mouse
	 */
	private eventMouseMove = (e: MouseEvent) => {
		const { offsetX: x, offsetY: y } = e
		this.canvasPosition = { x, y }
		this.canvasRelativePos = {
			x: Number.parseFloat(((x - this.canvasTranslate.x) / this.canvasFactor).toFixed(2)),
			y: Number.parseFloat(((y - this.canvasTranslate.y) / this.canvasFactor).toFixed(2))
		}
		this.emit('mouse_move', this.canvasRelativePos)
		if (this.eventsType === 'cursor' && e.buttons === 1 && this.isDragging) {
			if (this.selectedNode.length === 0 || this.canvasSelect.show) {
				if (!this.canvasSelect.show) {
					this.canvasSelect.x1 = this.canvasRelativePos.x
					this.canvasSelect.y1 = this.canvasRelativePos.y
				}
				this.canvasSelect.x2 = this.canvasRelativePos.x
				this.canvasSelect.y2 = this.canvasRelativePos.y
				this.canvasSelect.show = true
				return
			}
			if (this.selectedNode.length > 0 && !this.newConnectionNode) {
				this.nodes.move({ relative: this.canvasRelativePos })
				this.emit('node_moved', { selected: this.selectedNode })
			}
		}
		if ((this.eventsType === 'move' && e.buttons === 1) || e.buttons === 4) {
			if (e.buttons === 4) this.eventsType = 'move'
			this.canvasTranslate.x = e.clientX - this.canvasTempPosX
			this.canvasTranslate.y = e.clientY - this.canvasTempPosY
		}
	}

	/**
	 * Maneja el doble click para seleccionar nodos.
	 * @param _e - Evento del mouse
	 */
	private eventDbClick = (_e: MouseEvent) => {
		const selected = this.nodes.getSelected()
		this.emit('node_selected', { selected })
	}

	/**
	 * Maneja el evento de rueda del mouse para zoom.
	 * @param e - Evento de rueda
	 */
	private eventWheel = (e: WheelEvent) => {
		this.eventScrollZoom({ deltaY: e.deltaY })
	}

	/**
	 * Maneja el menú contextual del canvas.
	 * @param _e - Evento del mouse
	 */
	private eventContextMenu = (_e: MouseEvent) => {
		const connectionAtPosition = this.nodes.getConnectionAtPosition({
			x: this.canvasRelativePos.x,
			y: this.canvasRelativePos.y
		})

		if (connectionAtPosition) {
			this.emit('node_connection_selected', {
				id: connectionAtPosition.connection.id!,
				nodeOrigin: connectionAtPosition.nodeOrigin.get(),
				nodeDestiny: connectionAtPosition.nodeDestiny.get(),
				input: connectionAtPosition.connection.connectorDestinyName,
				output: connectionAtPosition.connection.connectorName
			})
			return
		}

		const selected = this.nodes.getSelected()
		if (selected.length === 0) return
		this.emit('node_context', {
			selected,
			canvasTranslate: this.nodes.canvasTranslate
		})
	}

	/**
	 * Finaliza operaciones de arrastre y crea conexiones automáticas.
	 */
	private eventMouseEnd() {
		this.canvasSelect.show = false

		if (this.newConnectionNode && !getTempConnection()) {
			const targetInput = this.nodes.getInputAtPosition({
				x: this.canvasRelativePos.x,
				y: this.canvasRelativePos.y
			})
			this.newConnectionNode.relative = this.canvasRelativePos

			if (targetInput && targetInput.node.id !== this.newConnectionNode.node.id) {
				const originNode = this.nodes.getNode({
					id: this.newConnectionNode.node.id!
				})
				originNode.addConnection({
					connectorType: this.newConnectionNode.type,
					connectorName: this.newConnectionNode.value.name,
					idNodeDestiny: targetInput.node.id!,
					connectorDestinyType: 'input',
					connectorDestinyName: targetInput.connectorName.name,
					isManual: true
				})

				this.newConnectionNode = null
				this.isNodeConnectionVisible = false
			} else {
				this.emit('node_added', {
					design: this.canvasPosition,
					relativePos: { ...this.canvasRelativePos },
					connection: {
						...this.newConnectionNode.value,
						type: this.newConnectionNode.type
					},
					node: this.newConnectionNode.node
				})
				this.newConnectionNode = null
			}
		}
	}

	/**
	 * Ajusta el tamaño del canvas al contenedor padre.
	 */
	private eventResize() {
		const parent = this.canvas.parentElement
		if (parent) {
			this.canvasWidth = parent.clientWidth
			this.canvasHeight = parent.clientHeight
			this.canvas.width = this.canvasWidth
			this.canvas.height = this.canvasHeight
		}
	}

	/**
	 * Aplica zoom al canvas con límites establecidos.
	 * @param zoom - Nuevo factor de zoom
	 * @param value - Incremento del zoom
	 */
	private eventZoom({ zoom, value }: { zoom?: number; value?: number }) {
		this.canvasFactor = zoom || this.canvasFactor + (value || 0)
		if (this.canvasFactor < 0.5) this.canvasFactor = 0.5
		if (this.canvasFactor > 2) this.canvasFactor = 2
		this.emit('zoom', { zoom: this.canvasFactor.toFixed(1) })
	}

	/**
	 * Maneja el zoom con rueda del mouse manteniendo el punto focal.
	 * @param deltaY - Dirección del scroll
	 */
	private eventScrollZoom({ deltaY }: { deltaY: number }) {
		const tempFactor = this.canvasFactor
		this.eventZoom({ value: deltaY > 0 ? -0.1 : 0.1 })
		this.canvasTranslate.x -= this.canvasRelativePos.x * (this.canvasFactor - tempFactor)
		this.canvasTranslate.y -= this.canvasRelativePos.y * (this.canvasFactor - tempFactor)
	}

	/**
	 * Suscribe a eventos de comunicación externa.
	 * @param type - Tipo o tipos de comunicación
	 * @param fn - Función callback para manejar eventos
	 */
	actionSubscriber(
		type: ICommunicationTypes | ICommunicationTypes[],
		fn: ({ event, data }: { event: ICommunicationTypes; data: any }) => void
	) {
		if (Array.isArray(type)) {
			for (const t of type) {
				subscriberHelper().subscriber(t, fn)
			}
		} else {
			subscriberHelper().subscriber(type, fn)
		}
	}

	/**
	 * Aumenta el zoom del canvas.
	 */
	actionZoomIn() {
		this.eventZoom({ value: 0.1 })
	}

	/**
	 * Disminuye el zoom del canvas.
	 */
	actionZoomOut() {
		this.eventZoom({ value: -0.1 })
	}

	/**
	 * Restaura el zoom al 100%.
	 */
	actionZoomCenter() {
		this.eventZoom({ zoom: 1 })
	}

	/**
	 * Añade un nuevo nodo al canvas y opcionalmente lo conecta a otro nodo.
	 * @param origin - Información del nodo origen para conexión automática
	 * @param node - Datos del nodo a crear
	 * @param isManual - Indica si es una acción manual del usuario
	 * @returns ID del nodo creado
	 */
	actionAddNode({
		origin,
		node,
		isManual
	}: {
		origin?: {
			idNode: string
			connectorType: 'input' | 'output' | 'callback'
			connectorName: string
		}
		node: INodeCanvas
		isManual?: boolean
	}) {
		const id = uuidv4()
		this.newConnectionNode = null
		const data: INodeCanvas = {
			...JSON.parse(JSON.stringify(node)),
			id: node.id || id,
			design: {
				x: Math.round((node.design.x || 0) / this.canvasGrid) * this.canvasGrid,
				y: Math.round((node.design.y || 0) / this.canvasGrid) * this.canvasGrid
			}
		}
		data.info.name = node.info.name
		// utilsValidateName({
		// 	text: node.info.name,
		// 	nodes: Object.values(this.nodes.getNodes())
		// })
		const nodeDestiny = this.nodes.addNode(data, isManual)

		console.log('origin', origin)
		if (origin) {
			this.nodes.getNode({ id: origin.idNode }).addConnection({
				connectorType: origin.connectorType,
				connectorName: origin.connectorName,
				idNodeDestiny: nodeDestiny.id,
				connectorDestinyType: 'output',
				connectorDestinyName: nodeDestiny.info.connectors.inputs[0].name,
				isManual: true
			})
		}
		return id
	}

	/**
	 * Elimina una conexión específica por su ID.
	 * @param id - ID de la conexión a eliminar
	 */
	actionDeleteConnectionById({ id }: { id: string }) {
		for (const node of Object.values(this.nodes.nodes)) {
			node.deleteConnections({ id })
		}
	}

	/**
	 * Procesa datos de trazado de ejecución de nodos.
	 * @param data - Datos de entrada y salida de cada nodo
	 */
	actionTrace(data: {
		[id: string]: {
			input: { data: { [key: string]: number }; length: number }
			output: { data: { [key: string]: number }; length: number }
			callback: { data: { [key: string]: number }; length: number }
		}
	}) {
		// this.nodes.trace(data);
	}

	/**
	 * Get the current workflow data.
	 * @returns A workflow data object with nodes and connections.
	 */
	getWorkflowData() {
		const nodes = this.nodes.getNodes()
		const connections: INodeConnections[] = []
		const plainNodes: { [key: string]: INodeCanvas } = {}
		for (const node of Object.values(nodes)) {
			plainNodes[node.id] = node.get()
			if (node.connections) {
				for (const conn of node.connections) {
					if (conn.idNodeOrigin === node.id) {
						connections.push({
							...conn,
							colorGradient: null,
							pointers: undefined
						})
					}
				}
			}
			plainNodes[node.id].connections = []
		}
		return { nodes: plainNodes, connections }
	}

	/**
	 * Carga datos de workflow en el canvas, limpiando el contenido actual.
	 * @param data - Nodos y conexiones a cargar.
	 */
	loadWorkflowData(data: {
		nodes: { [key: string]: INodeCanvas }
		connections: INodeConnections[]
	}) {
		// Limpiar nodos existentes
		this.nodes.clear()
		this.selectedNode = []
		this.newConnectionNode = null

		// Cargar nuevos datos
		this.load(JSON.parse(JSON.stringify(data)))
	}

	/**
	 * Limpia recursos y remueve event listeners.
	 */
	destroy() {
		for (const event of this.eventsCanvas) {
			this.canvas.removeEventListener(event as any, (e) => {
				e.preventDefault()
				this.events({ event: event as string, e })
			})
		}
		window.removeEventListener('resize', () => this.eventResize())
		document.removeEventListener('mouseup', this.eventMouseUp)
		subscriberHelper().clear()
		this.eventMouseEnd()
		if (this.backgroundUpdateInterval) {
			clearInterval(this.backgroundUpdateInterval)
		}
	}
}
