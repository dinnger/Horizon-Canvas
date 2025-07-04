/**
 * Orthogonal Connector Router
 *   - Given two rectangles and their connection points, returns the path for an orthogonal connector.
 *
 * https://jose.page
 * 2020
 */

import type { INodeCanvas } from './interfaz/node.interface'

type BasicCardinalPoint = 'n' | 'e' | 's' | 'w'
type Direction = 'v' | 'h'
type Side = 'top' | 'right' | 'bottom' | 'left'
type BendDirection = BasicCardinalPoint | 'unknown' | 'none'

/**
 * A point in space
 */
export interface Point {
	x: number
	y: number
}

/**
 * A size tuple
 */
interface Size {
	width: number
	height: number
}

/**
 * A line between two points
 */
interface Line {
	a: Point
	b: Point
}

/**
 * Represents a Rectangle by location and size
 */
interface Rect extends Size {
	left: number
	top: number
}

/**
 * Represents a connection point on a routing request
 */
interface ConnectorPoint {
	shape: Rect
	side: Side
	distance: number
}

/**
 * Byproduct data emitted by the routing algorithm
 */
interface OrthogonalConnectorByproduct {
	hRulers: number[]
	vRulers: number[]
	spots: Point[]
	grid: Rectangle[]
	connections: Line[]
}

/**
 * Routing request data
 */
interface OrthogonalConnectorOpts {
	ctx: CanvasRenderingContext2D
	nodes: { [key: string]: INodeCanvas }
	pointA: ConnectorPoint
	pointB: ConnectorPoint
	shapeMargin: number
	globalBoundsMargin: number
	globalBounds: Rect
}

/**
 * Utility Point creator
 * @param x
 * @param y
 */
function makePt(x: number, y: number): Point {
	return { x, y }
}

/**
 * Computes distance between two points
 * @param a
 * @param b
 */
function distance(a: Point, b: Point): number {
	return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)
}

/**
 * Abstracts a Rectangle and adds geometric utilities
 */
class Rectangle {
	static get empty(): Rectangle {
		return new Rectangle(0, 0, 0, 0)
	}

	static fromRect(r: Rect): Rectangle {
		return new Rectangle(r.left, r.top, r.width, r.height)
	}

	static fromLTRB(left: number, top: number, right: number, bottom: number): Rectangle {
		return new Rectangle(left, top, right - left, bottom - top)
	}

	constructor(
		readonly left: number,
		readonly top: number,
		readonly width: number,
		readonly height: number
	) {}

	contains(p: Point): boolean {
		return p.x >= this.left && p.x <= this.right && p.y >= this.top && p.y <= this.bottom
	}

	inflate(horizontal: number, vertical: number): Rectangle {
		return Rectangle.fromLTRB(this.left - horizontal, this.top - vertical, this.right + horizontal, this.bottom + vertical)
	}

	intersects(rectangle: Rectangle): boolean {
		const thisX = this.left
		const thisY = this.top
		const thisW = this.width
		const thisH = this.height
		const rectX = rectangle.left
		const rectY = rectangle.top
		const rectW = rectangle.width
		const rectH = rectangle.height
		return rectX < thisX + thisW && thisX < rectX + rectW && rectY < thisY + thisH && thisY < rectY + rectH
	}

	union(r: Rectangle): Rectangle {
		const x = [this.left, this.right, r.left, r.right]
		const y = [this.top, this.bottom, r.top, r.bottom]
		return Rectangle.fromLTRB(Math.min(...x), Math.min(...y), Math.max(...x), Math.max(...y))
	}

	get center(): Point {
		return {
			x: this.left + this.width / 2,
			y: this.top + this.height / 2
		}
	}

	get right(): number {
		return this.left + this.width
	}

	get bottom(): number {
		return this.top + this.height
	}

	get location(): Point {
		return makePt(this.left, this.top)
	}

	get northEast(): Point {
		return { x: this.right, y: this.top }
	}

	get southEast(): Point {
		return { x: this.right, y: this.bottom }
	}

	get southWest(): Point {
		return { x: this.left, y: this.bottom }
	}

	get northWest(): Point {
		return { x: this.left, y: this.top }
	}

	get east(): Point {
		return makePt(this.right, this.center.y)
	}

	get north(): Point {
		return makePt(this.center.x, this.top)
	}

	get south(): Point {
		return makePt(this.center.x, this.bottom)
	}

	get west(): Point {
		return makePt(this.left, this.center.y)
	}

	get size(): Size {
		return { width: this.width, height: this.height }
	}
}

/**
 * Represents a node in a graph, whose data is a Point
 */
class PointNode {
	public distance = Number.MAX_SAFE_INTEGER
	public shortestPath: PointNode[] = []
	public adjacentNodes: Map<PointNode, number> = new Map()
	constructor(public data: Point) {}
}

/***
 * Represents a Graph of Point nodes
 */
class PointGraph {
	private index: { [x: string]: { [y: string]: PointNode } } = {}

	add(p: Point) {
		const { x, y } = p
		const xs = x.toString()
		const ys = y.toString()

		if (!(xs in this.index)) {
			this.index[xs] = {}
		}
		if (!(ys in this.index[xs])) {
			this.index[xs][ys] = new PointNode(p)
		}
	}

	private getLowestDistanceNode(unsettledNodes: Set<PointNode>): PointNode {
		let lowestDistanceNode: PointNode | null = null
		let lowestDistance = Number.MAX_SAFE_INTEGER
		for (const node of unsettledNodes) {
			const nodeDistance = node.distance
			if (nodeDistance < lowestDistance) {
				lowestDistance = nodeDistance
				lowestDistanceNode = node
			}
		}
		// biome-ignore lint/style/noNonNullAssertion: <explanation>
		return lowestDistanceNode!
	}

	private inferPathDirection(node: PointNode): Direction | null {
		if (node.shortestPath.length === 0) {
			return null
		}

		return this.directionOfNodes(node.shortestPath[node.shortestPath.length - 1], node)
	}

	calculateShortestPathFromSource(graph: PointGraph, source: PointNode): PointGraph {
		source.distance = 0

		const settledNodes: Set<PointNode> = new Set()
		const unsettledNodes: Set<PointNode> = new Set()

		unsettledNodes.add(source)

		while (unsettledNodes.size !== 0) {
			const currentNode = this.getLowestDistanceNode(unsettledNodes)
			unsettledNodes.delete(currentNode)

			for (const [adjacentNode, edgeWeight] of currentNode.adjacentNodes) {
				if (!settledNodes.has(adjacentNode)) {
					this.calculateMinimumDistance(adjacentNode, edgeWeight, currentNode)
					unsettledNodes.add(adjacentNode)
				}
			}
			settledNodes.add(currentNode)
		}

		return graph
	}

	private calculateMinimumDistance(evaluationNode: PointNode, edgeWeigh: number, sourceNode: PointNode) {
		const sourceDistance = sourceNode.distance
		const comingDirection = this.inferPathDirection(sourceNode)
		const goingDirection = this.directionOfNodes(sourceNode, evaluationNode)
		const changingDirection = comingDirection && goingDirection && comingDirection !== goingDirection
		const extraWeigh = changingDirection ? (edgeWeigh + 1) ** 2 : 0

		if (sourceDistance + edgeWeigh + extraWeigh < evaluationNode.distance) {
			evaluationNode.distance = sourceDistance + edgeWeigh + extraWeigh
			const shortestPath: PointNode[] = [...sourceNode.shortestPath]
			shortestPath.push(sourceNode)
			evaluationNode.shortestPath = shortestPath
		}
	}

	private directionOf(a: Point, b: Point): Direction | null {
		if (a.x === b.x) {
			return 'h'
		}
		if (a.y === b.y) {
			return 'v'
		}
		return null
	}

	private directionOfNodes(a: PointNode, b: PointNode): Direction | null {
		return this.directionOf(a.data, b.data)
	}

	connect(a: Point, b: Point) {
		const nodeA = this.get(a)
		const nodeB = this.get(b)

		if (!nodeA || !nodeB) {
			throw new Error('A point was not found')
		}

		nodeA.adjacentNodes.set(nodeB, distance(a, b))
	}

	has(p: Point): boolean {
		const { x, y } = p
		const xs = x.toString()
		const ys = y.toString()
		return xs in this.index && ys in this.index[xs]
	}

	get(p: Point): PointNode | null {
		const { x, y } = p
		const xs = x.toString()
		const ys = y.toString()

		if (xs in this.index && ys in this.index[xs]) {
			return this.index[xs][ys]
		}

		return null
	}
}

/**
 * Gets the actual point of the connector based on the distance parameter
 * @param p
 */
function computePt(p: ConnectorPoint): Point {
	const b = Rectangle.fromRect(p.shape)
	switch (p.side) {
		case 'bottom':
			return makePt(b.left + b.width * p.distance, b.bottom)
		case 'top':
			return makePt(b.left + b.width * p.distance, b.top)
		case 'left':
			return makePt(b.left, b.top + p.distance)
		case 'right':
			return makePt(b.right, b.top + p.distance)
	}
}

/**
 * Extrudes the connector point by margin depending on it's side
 * @param cp
 * @param margin
 */
function extrudeCp(cp: ConnectorPoint, margin: number): Point {
	const { x, y } = computePt(cp)
	switch (cp.side) {
		case 'top':
			return makePt(x, y - margin)
		case 'right':
			return makePt(x + margin, y)
		case 'bottom':
			return makePt(x, y + margin)
		case 'left':
			return makePt(x - margin, y)
	}
}

/**
 * Returns flag indicating if the side belongs on a vertical axis
 * @param side
 */
function isVerticalSide(side: Side): boolean {
	return side === 'top' || side === 'bottom'
}

/**
 * Creates a grid of rectangles from the specified set of rulers, contained on the specified bounds
 * @param verticals
 * @param horizontals
 * @param bounds
 */
function rulersToGrid(verticals: number[], horizontals: number[], bounds: Rectangle): Grid {
	const result: Grid = new Grid()

	verticals.sort((a, b) => a - b)
	horizontals.sort((a, b) => a - b)

	let lastX = bounds.left
	let lastY = bounds.top
	let column = 0
	let row = 0

	for (const y of horizontals) {
		for (const x of verticals) {
			result.set(row, column++, Rectangle.fromLTRB(lastX, lastY, x, y))
			lastX = x
		}

		// Last cell of the row
		result.set(row, column, Rectangle.fromLTRB(lastX, lastY, bounds.right, y))
		lastX = bounds.left
		lastY = y
		column = 0
		row++
	}

	lastX = bounds.left

	// Last fow of cells
	for (const x of verticals) {
		result.set(row, column++, Rectangle.fromLTRB(lastX, lastY, x, bounds.bottom))
		lastX = x
	}

	// Last cell of last row
	result.set(row, column, Rectangle.fromLTRB(lastX, lastY, bounds.right, bounds.bottom))

	return result
}

/**
 * Returns an array without repeated points
 * @param points
 */
function reducePoints(points: Point[]): Point[] {
	const result: Point[] = []
	const map = new Map<number, number[]>()

	for (const p of points) {
		const { x, y } = p
		// biome-ignore lint/style/noNonNullAssertion: <explanation>
		const arr: number[] = map.get(y) || map.set(y, []).get(y)!

		if (arr.indexOf(x) < 0) {
			arr.push(x)
		}
	}

	for (const [y, xs] of map) {
		for (const x of xs) {
			result.push(makePt(x, y))
		}
	}

	return result
}

/**
 * Returns a set of spots generated from the grid, avoiding colliding spots with specified obstacles
 * @param grid
 * @param obstacles
 */
function gridToSpots(grid: Grid, obstacles: Rectangle[]): Point[] {
	const obstacleCollision = (p: Point) => obstacles.filter((o) => o.contains(p)).length > 0

	const gridPoints: Point[] = []

	for (const [row, data] of grid.data) {
		const firstRow = row === 0
		const lastRow = row === grid.rows - 1

		for (const [col, r] of data) {
			const firstCol = col === 0
			const lastCol = col === grid.columns - 1
			const nw = firstCol && firstRow
			const ne = firstRow && lastCol
			const se = lastRow && lastCol
			const sw = lastRow && firstCol

			if (nw || ne || se || sw) {
				gridPoints.push(r.northWest, r.northEast, r.southWest, r.southEast)
			} else if (firstRow) {
				gridPoints.push(r.northWest, r.north, r.northEast)
			} else if (lastRow) {
				gridPoints.push(r.southEast, r.south, r.southWest)
			} else if (firstCol) {
				gridPoints.push(r.northWest, r.west, r.southWest)
			} else if (lastCol) {
				gridPoints.push(r.northEast, r.east, r.southEast)
			} else {
				// for (let i = -30; i <= 30; i += 20) {
				// 	gridPoints.push({ x: r.center.x, y: r.center.y + i })
				// }
				gridPoints.push(r.northWest, r.north, r.northEast, r.east, r.southEast, r.south, r.southWest, r.west, r.center)
			}
		}
	}

	// for (const r of grid) {
	// 	gridPoints.push(
	// 		r.northWest,
	// 		r.north,
	// 		r.northEast,
	// 		r.east,
	// 		r.southEast,
	// 		r.south,
	// 		r.southWest,
	// 		r.west,
	// 		r.center
	// 	)
	// }

	// Reduce repeated points and filter out those who touch shapes
	return reducePoints(gridPoints).filter((p) => !obstacleCollision(p))
}

/**
 * Returns a set of spots generated from the grid, avoiding colliding spots with specified obstacles
 * @param grid
 * @param obstacles
 */
function gridToSpots2(shapeA: ConnectorPoint, shapeB: ConnectorPoint, shapeMargin: number, obstacles: Rectangle[]) {
	const obstacleCollision = (p: Point) => obstacles.filter((o) => o.contains(p)).length > 0

	const pointCount = 200
	const margin = 30
	const gridPoints: Point[] = []

	// const x1: number = Math.min(pointA.shape.left, pointB.shape.left) - margin
	// const y1: number = Math.min(
	// 	pointA.shape.top + pointA.distance,
	// 	pointB.shape.top + pointB.distance
	// )
	// const x2: number = Math.max(pointA.shape.left, pointB.shape.left) + margin
	// const y2: number = Math.max(
	// 	pointA.shape.top + pointA.distance,
	// 	pointB.shape.top + pointB.distance
	// )
	// const width = Math.abs((x2 || 0) - (x1 || 0))
	// const height = Math.abs((y2 || 0) - (y1 || 0))

	// // Determinar el número de filas y columnas basado en el área y el puntoCount
	// const aspectRatio = width / height
	// const rows = Math.round(Math.sqrt(pointCount / aspectRatio))
	// const cols = Math.round(pointCount / rows)

	// const xStep = width / (cols - 1)
	// const yStep = Math.abs(height / (rows - 1))

	// for (let i = yStep > 0 ? -15 : 0; i < rows + (yStep > 0 ? 15 : 0); i++) {
	// 	for (let j = xStep > 0 ? -15 : 0; j < cols + (xStep > 0 ? 15 : 0); j++) {
	// 		// if (gridPoints.length >= pointCount) break // Parar si ya tenemos suficientes puntos
	// 		const x = x1 + j * xStep
	// 		const y = y1 + i * yStep

	// 		gridPoints.push({ x, y })
	// 	}
	// }
	const pointA = { ...obstacles[0], distance: shapeA.distance + shapeMargin }
	const pointB = { ...obstacles[1], distance: shapeB.distance + shapeMargin }
	// const shapePoint = (point) => {
	// 	gridPoints.push(
	// 		{
	// 			x: point.left + point.width,
	// 			y: point.top - margin
	// 		},
	// 		{ x: point.left - margin, y: point.top + point.distance },
	// 		{ x: point.left - margin, y: point.top - margin },
	// 		{ x: point.left - margin, y: point.top + point.height },
	// 		{
	// 			x: point.left + point.width + margin,
	// 			y: point.top + point.distance
	// 		},
	// 		{
	// 			x: point.left + point.width + margin,
	// 			y: point.top - margin
	// 		},
	// 		{
	// 			x: point.left + point.width + margin,
	// 			y: point.top + point.height
	// 		},
	// 		{
	// 			x: point.left + point.width / 2,
	// 			y: point.top - margin
	// 		},
	// 		{
	// 			x: point.left + point.width / 2,
	// 			y: point.top + point.height + margin
	// 		},
	// 		{
	// 			x: point.left + point.width + margin,
	// 			y: point.top + point.height + margin
	// 		},
	// 		{
	// 			x: point.left - margin,
	// 			y: point.top + point.height + margin
	// 		},
	// 		{
	// 			x: point.left + point.width,
	// 			y: point.top + point.height + margin
	// 		},
	// 		{
	// 			x: pointA.left,
	// 			y: pointA.top - margin
	// 		}
	// 	)
	// }
	// shapePoint(pointA)
	// shapePoint(pointB)

	// calcular 10 puntos de xorigine a xdestino
	const x1 = Math.min(pointA.left + pointA.width, pointB.left + pointB.width) + margin
	const y1 = Math.min(pointA.top + pointA.distance, pointB.top + pointB.distance)
	const x2 = Math.max(pointA.left, pointB.left) - margin
	const y2 = Math.max(pointA.top + pointA.distance, pointB.top + pointB.distance)
	const width = Math.abs((x2 || 0) - (x1 || 0))
	const height = Math.abs((y2 || 0) - (y1 || 0))

	// Determinar el número de filas y columnas basado en el área y el puntoCount
	const aspectRatio = width / height

	const rows = height / 10 > 10 ? Math.round(height / 10) + 20 : 30
	const cols = width / 10 > 10 ? Math.round(width / 10) + 20 : 30

	const xStep = 10
	const yStep = 10

	for (let i = -20; i < rows; i++) {
		for (let j = -20; j < cols; j++) {
			const x = Math.round(x1 + j * xStep)
			const y = Math.round(y1 + i * yStep)
			// console.log({ x, y })
			gridPoints.push({ x, y })
		}
	}

	// Reduce repeated points and filter out those who touch shapes
	return reducePoints(gridPoints).filter((p) => !obstacleCollision(p))
}

/**
 * Creates a graph connecting the specified points orthogonally
 * @param spots
 */
function createGraph(spots: Point[]): {
	graph: PointGraph
	connections: Line[]
} {
	const hotXs: number[] = []
	const hotYs: number[] = []
	const graph = new PointGraph()
	const connections: Line[] = []

	for (const p of spots) {
		const { x, y } = p
		if (hotXs.indexOf(x) < 0) hotXs.push(x)
		if (hotYs.indexOf(y) < 0) hotYs.push(y)
		graph.add(p)
	}

	hotXs.sort((a, b) => a - b)
	hotYs.sort((a, b) => a - b)

	const inHotIndex = (p: Point): boolean => graph.has(p)

	// const fistHotX = hotXs[0]
	// const fistHotY = hotYs[0]
	// const lastHotX = hotXs[hotXs.length - 1]
	// const lastHotY = hotYs[hotYs.length - 1]

	// // console.log(fistHotX, fistHotY, lastHotX, lastHotY)
	// connections.push({
	// 	a: makePt(fistHotX, fistHotY),
	// 	b: makePt(lastHotX, fistHotY)
	// })

	for (let i = 0; i < hotYs.length; i++) {
		for (let j = 0; j < hotXs.length; j++) {
			const b = makePt(hotXs[j], hotYs[i])

			if (!inHotIndex(b)) {
				// console.log('no inHotIndex', b)
				continue
			}

			if (j > 0) {
				const a = makePt(hotXs[j - 1], hotYs[i])

				if (inHotIndex(a)) {
					graph.connect(a, b)
					graph.connect(b, a)
					connections.push({ a, b })
				}
			}

			if (i > 0) {
				const a = makePt(hotXs[j], hotYs[i - 1])

				if (inHotIndex(a)) {
					graph.connect(a, b)
					graph.connect(b, a)
					connections.push({ a, b })
				}
			}
		}
	}

	return { graph, connections }
}

/**
 * Solves the shotest path for the origin-destination path of the graph
 * @param graph
 * @param origin
 * @param destination
 */
function shortestPath(graph: PointGraph, origin: Point, destination: Point): Point[] {
	const originNode = graph.get(origin)
	const destinationNode = graph.get(destination)

	if (!originNode) {
		throw new Error(`Origin node {${origin.x},${origin.y}} not found`)
	}

	if (!destinationNode) {
		throw new Error(`Origin node {${origin.x},${origin.y}} not found`)
	}

	graph.calculateShortestPathFromSource(graph, originNode)

	return destinationNode.shortestPath.map((n) => n.data)
}

/**
 * Given two segments represented by 3 points,
 * determines if the second segment bends on an orthogonal direction or not, and which.
 *
 * @param a
 * @param b
 * @param c
 * @return Bend direction, unknown if not orthogonal or 'none' if straight line
 */
function getBend(a: Point, b: Point, c: Point): BendDirection {
	const equalX = a.x === b.x && b.x === c.x
	const equalY = a.y === b.y && b.y === c.y
	const segment1Horizontal = a.y === b.y
	const segment1Vertical = a.x === b.x
	const segment2Horizontal = b.y === c.y
	const segment2Vertical = b.x === c.x

	if (equalX || equalY) {
		return 'none'
	}

	if (!(segment1Vertical || segment1Horizontal) || !(segment2Vertical || segment2Horizontal)) {
		return 'unknown'
	}

	if (segment1Horizontal && segment2Vertical) {
		return c.y > b.y ? 's' : 'n'
	}
	if (segment1Vertical && segment2Horizontal) {
		return c.x > b.x ? 'e' : 'w'
	}

	throw new Error('Nope')
}

/**
 * Simplifies the path by removing unnecessary points, based on orthogonal pathways
 * @param points
 */
function simplifyPath(points: Point[]): Point[] {
	if (points.length <= 2) {
		return points
	}

	const r: Point[] = [points[0]]
	for (let i = 1; i < points.length; i++) {
		const cur = points[i]

		if (i === points.length - 1) {
			r.push(cur)
			break
		}

		const prev = points[i - 1]
		const next = points[i + 1]
		const bend = getBend(prev, cur, next)

		if (bend !== 'none') {
			r.push(cur)
		}
	}
	return r
}

/**
 * Helps create the grid portion of the algorithm
 */
class Grid {
	private _rows = 0
	private _cols = 0

	readonly data: Map<number, Map<number, Rectangle>> = new Map()

	set(row: number, column: number, rectangle: Rectangle) {
		this._rows = Math.max(this.rows, row + 1)
		this._cols = Math.max(this.columns, column + 1)

		const rowMap: Map<number, Rectangle> =
			// biome-ignore lint/style/noNonNullAssertion: <explanation>
			this.data.get(row) || this.data.set(row, new Map()).get(row)!

		rowMap.set(column, rectangle)
	}

	get(row: number, column: number): Rectangle | null {
		const rowMap = this.data.get(row)

		if (rowMap) {
			return rowMap.get(column) || null
		}

		return null
	}

	rectangles(): Rectangle[] {
		const r: Rectangle[] = []

		for (const [_, data] of this.data) {
			for (const [_, rect] of data) {
				r.push(rect)
			}
		}

		return r
	}

	get columns(): number {
		return this._cols
	}

	get rows(): number {
		return this._rows
	}
}

/**
 * Main logic wrapped in a class to hold a space for potential future functionallity
 */

// biome-ignore lint/complexity/noStaticOnlyClass: <explanation>
export class OrthogonalConnector {
	static readonly byproduct: OrthogonalConnectorByproduct = {
		hRulers: [],
		vRulers: [],
		spots: [],
		grid: [],
		connections: []
	}

	static route(opts: OrthogonalConnectorOpts): Point[] {
		const { ctx, nodes, pointA, pointB, globalBoundsMargin } = opts
		const spots: Point[] = []
		const verticals: number[] = []
		const horizontals: number[] = []
		const sideA = pointA.side
		const sideAVertical = isVerticalSide(sideA)
		const sideB = pointB.side
		const sideBVertical = isVerticalSide(sideB)
		const originA = computePt(pointA)
		const originB = computePt(pointB)
		const shapeA = Rectangle.fromRect(pointA.shape)
		const shapeB = Rectangle.fromRect(pointB.shape)
		const bigBounds = Rectangle.fromRect(opts.globalBounds)
		let shapeMargin = opts.shapeMargin
		let inflatedA = shapeA.inflate(shapeMargin, shapeMargin)
		let inflatedB = shapeB.inflate(shapeMargin, shapeMargin)

		// Check bounding boxes collision
		if (inflatedA.intersects(inflatedB)) {
			shapeMargin = 0
			inflatedA = shapeA
			inflatedB = shapeB
		}

		const inflatedBounds = inflatedA.union(inflatedB).inflate(globalBoundsMargin, globalBoundsMargin)

		// Curated bounds to stick to
		const bounds = Rectangle.fromLTRB(
			Math.max(inflatedBounds.left),
			Math.max(inflatedBounds.top),
			Math.min(inflatedBounds.right),
			Math.min(inflatedBounds.bottom)
		)

		// Add edges to rulers
		for (const b of [inflatedA, inflatedB]) {
			verticals.push(b.left)
			verticals.push(b.right)
			horizontals.push(b.top)
			horizontals.push(b.bottom)
		}
		// Rulers at origins of shapes
		;(sideAVertical ? verticals : horizontals).push(sideAVertical ? originA.x : originA.y)
		;(sideBVertical ? verticals : horizontals).push(sideBVertical ? originB.x : originB.y)

		// Points of shape antennas
		for (const connectorPt of [pointA, pointB]) {
			const p = computePt(connectorPt)
			const add = (dx: number, dy: number) => spots.push(makePt(p.x + dx, p.y + dy))

			switch (connectorPt.side) {
				case 'top':
					add(0, -shapeMargin)
					break
				case 'right':
					add(shapeMargin, 0)
					break
				case 'bottom':
					add(0, shapeMargin)
					break
				case 'left':
					add(-shapeMargin, 0)
					break
			}
		}

		// Sort rulers
		verticals.sort((a, b) => a - b)
		horizontals.sort((a, b) => a - b)

		// Create grid
		const grid = rulersToGrid(verticals, horizontals, bounds)

		const shapes = Rectangle.fromRect(pointA.shape)
		const inflates: Rectangle[] = []
		for (const node of Object.values(nodes)) {
			const shape = Rectangle.fromRect({
				left: node.design.x,
				top: node.design.y,
				width: node.design.width!,
				height: node.design.height!
			})
			const inflate = shape.inflate(shapeMargin, shapeMargin)
			inflates.push(inflate)
		}

		// const gridPoints = gridToSpots(grid, [inflatedA, inflatedB, ...inflates])
		const gridPoints = gridToSpots2(pointA, pointB, shapeMargin, [inflatedA, inflatedB, ...inflates])

		// Add to spots
		spots.push(...gridPoints)

		// Create graph
		const { graph, connections } = createGraph(spots)

		// Origin and destination by extruding antennas
		const origin = extrudeCp(pointA, shapeMargin)
		const destination = extrudeCp(pointB, shapeMargin)

		const start = computePt(pointA)
		const end = computePt(pointB)

		OrthogonalConnector.byproduct.spots = spots
		OrthogonalConnector.byproduct.vRulers = verticals
		OrthogonalConnector.byproduct.hRulers = horizontals
		OrthogonalConnector.byproduct.grid = grid.rectangles()
		OrthogonalConnector.byproduct.connections = connections

		const pathConnector = shortestPath(graph, origin, destination)

		if (pathConnector.length > 0) {
			return simplifyPath([start, ...shortestPath(graph, origin, destination), end])
			// biome-ignore lint/style/noUselessElse: <explanation>
		} else {
			return []
		}
	}
}
