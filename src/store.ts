import * as THREE from 'three'
import * as fs from 'fs'
import * as path from 'path'
import type { AnimationName, PlayerData } from './protocol'

// --- Store Events ---

export type StoreEventType =
  | 'object_created'
  | 'object_updated'
  | 'object_deleted'

export interface StoreEventObjectCreated {
  type: 'object_created'
  id: string
  parentId: string
  object: object
}

export interface StoreEventObjectUpdated {
  type: 'object_updated'
  id: string
  object: object
}

export interface StoreEventObjectDeleted {
  type: 'object_deleted'
  id: string
}

export type StoreEvent =
  | StoreEventObjectCreated
  | StoreEventObjectUpdated
  | StoreEventObjectDeleted

export type StoreEventListener = (event: StoreEvent) => void

// --- Config ---

const STORAGE_DIR = process.env.WORLD3D_STORAGE_DIR || '/app/storage/world3d'
// Minimum Y position — objects below this are respawned at safe height
const MIN_Y_POSITION = -10
const SAFE_Y_POSITION = 2
const WORLDS_DIR = path.join(STORAGE_DIR, 'worlds')
const DEFAULT_WORLD_NAME = 'main'
const WORLD_FILE = 'world.json'
const TEMPLATE_FILE = 'template.json'
const SNAPSHOTS_DIR = 'snapshots'
const SNAPSHOT_PATH_FORMAT = process.env.WORLD3D_SNAPSHOT_PATH_FORMAT || 'Y/M/D'

// --- Interfaces ---

interface WorldTemplate {
  metadata: {
    version: string
    name: string
    description: string
    createdAt: string | null
  }
  scene: object
}

interface CreateParams {
  parentId?: string
  object: object
}

interface UpdateParams {
  uuid: string
  object: object
}

interface DeleteParams {
  nodeId: string
  cascade?: boolean
}

interface StatsResult {
  worldName: string
  nodeCount: number
  snapshotCount: number
}

// --- Helpers ---

function countSnapshotFiles(dir: string): number {
  let count = 0
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += countSnapshotFiles(path.join(dir, entry.name))
    } else if (entry.name.endsWith('.json')) {
      count++
    }
  }
  return count
}

function getWorldDir(worldName: string): string {
  return path.join(WORLDS_DIR, worldName)
}

function getWorldFilePath(worldName: string): string {
  return path.join(getWorldDir(worldName), WORLD_FILE)
}

function getTemplateFilePath(worldName: string): string {
  return path.join(getWorldDir(worldName), TEMPLATE_FILE)
}

function getSnapshotsDir(worldName: string): string {
  return path.join(getWorldDir(worldName), SNAPSHOTS_DIR)
}

function getSnapshotSubDir(worldName: string): string {
  const now = new Date()
  const replacements: Record<string, string> = {
    Y: now.getFullYear().toString(),
    M: String(now.getMonth() + 1).padStart(2, '0'),
    D: String(now.getDate()).padStart(2, '0'),
    H: String(now.getHours()).padStart(2, '0'),
  }
  const subPath = SNAPSHOT_PATH_FORMAT.split('/')
    .map((p) => replacements[p] || p)
    .join(path.sep)
  return path.join(getSnapshotsDir(worldName), subPath)
}

function ensureDirectories(worldName: string): void {
  const worldDir = getWorldDir(worldName)
  if (!fs.existsSync(worldDir)) {
    fs.mkdirSync(worldDir, { recursive: true })
  }
  const snapshotsDir = getSnapshotsDir(worldName)
  if (!fs.existsSync(snapshotsDir)) {
    fs.mkdirSync(snapshotsDir, { recursive: true })
  }
}

function getTimestamp(): string {
  return Date.now().toString()
}

// --- World3DStore ---

// JSON object structure (native Three.js format)
interface SceneObjectJson {
  uuid: string
  type?: string
  name?: string
  matrix?: number[]
  userData?: Record<string, unknown>
  children?: SceneObjectJson[]
  [key: string]: unknown
}

class World3DStore {
  private scene: THREE.Scene
  private sceneJson: SceneObjectJson | null = null // Source of truth
  private initialized = false
  private worldName: string = DEFAULT_WORLD_NAME
  private eventListeners: StoreEventListener[] = []

  constructor() {
    this.scene = new THREE.Scene()
    this.scene.name = 'root'
    this.scene.userData = { id: 'root', type: 'root', properties: {} }
  }

  /**
   * Subscribe to store events (object_created, object_updated, object_deleted).
   */
  onEvent(listener: StoreEventListener): () => void {
    this.eventListeners.push(listener)
    return () => {
      const idx = this.eventListeners.indexOf(listener)
      if (idx !== -1) {
        this.eventListeners.splice(idx, 1)
      }
    }
  }

  private emit(event: StoreEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event)
      } catch (err) {
        console.error('[world3d-store] Event listener error:', err)
      }
    }
  }

  async initialize(worldName: string = DEFAULT_WORLD_NAME): Promise<void> {
    if (this.initialized) {
      return
    }

    this.worldName = worldName
    ensureDirectories(this.worldName)
    await this.loadWorld()
    this.initialized = true
  }

  private async loadWorld(): Promise<void> {
    const worldFilePath = getWorldFilePath(this.worldName)
    const templateFilePath = getTemplateFilePath(this.worldName)

    let dataPath: string

    if (fs.existsSync(worldFilePath)) {
      dataPath = worldFilePath
    } else if (fs.existsSync(templateFilePath)) {
      // Copy template to world.json on first run
      fs.copyFileSync(templateFilePath, worldFilePath)
      dataPath = worldFilePath
    } else {
      console.warn(
        `[world3d-store] Neither world.json nor template.json found for world "${this.worldName}", starting empty`,
      )
      return
    }

    try {
      const content = fs.readFileSync(dataPath, 'utf-8')
      const data: WorldTemplate = JSON.parse(content)

      // Store JSON as source of truth
      if (data.scene) {
        const sceneData = data.scene as { object?: SceneObjectJson }
        this.sceneJson = sceneData.object || null

        // Render scene from JSON
        this.renderScene()
      }
    } catch (error) {
      console.error('[world3d-store] Failed to load world:', error)
      throw error
    }
  }

  /**
   * Render Three.js scene from sceneJson (source of truth).
   */
  private renderScene(): void {
    if (!this.sceneJson) {
      return
    }

    const loader = new THREE.ObjectLoader()
    const fullJson = { object: this.sceneJson }
    const loadedScene = loader.parse(fullJson)

    this.scene.clear()
    this.scene.userData = loadedScene.userData
    const childrenToAdd = [...loadedScene.children]
    for (const child of childrenToAdd) {
      this.scene.add(child)
    }
  }

  private saveWorld(): void {
    if (!this.sceneJson) {
      return
    }
    ensureDirectories(this.worldName)
    const worldFilePath = getWorldFilePath(this.worldName)
    const data = {
      metadata: {
        version: '1.0.0',
        name: this.worldName,
        savedAt: new Date().toISOString(),
      },
      scene: { object: this.sceneJson },
    }
    fs.writeFileSync(worldFilePath, JSON.stringify(data, null, 2))
  }

  private saveSnapshot(): void {
    if (!this.sceneJson) {
      return
    }
    const timestamp = getTimestamp()
    const snapshotDir = getSnapshotSubDir(this.worldName)
    if (!fs.existsSync(snapshotDir)) {
      fs.mkdirSync(snapshotDir, { recursive: true })
    }
    const snapshotPath = path.join(snapshotDir, `${timestamp}.json`)
    const data = {
      metadata: {
        version: '1.0.0',
        name: this.worldName,
        snapshotAt: new Date().toISOString(),
      },
      scene: { object: this.sceneJson },
    }
    fs.writeFileSync(snapshotPath, JSON.stringify(data, null, 2))
  }

  /**
   * Get all players as PlayerData array for world_state message.
   * Reads from scene - single source of truth.
   */
  getAllPlayers(): PlayerData[] {
    const players: PlayerData[] = []

    this.scene.traverse((obj) => {
      if (obj.userData?.type === 'player') {
        const quaternion = new THREE.Quaternion()
        obj.getWorldQuaternion(quaternion)
        players.push({
          playerId: obj.userData.id || obj.name,
          username: obj.userData.properties?.username || null,
          position: {
            x: obj.position.x,
            y: obj.position.y,
            z: obj.position.z,
          },
          rotation: {
            x: quaternion.x,
            y: quaternion.y,
            z: quaternion.z,
            w: quaternion.w,
          },
          animation: obj.userData.properties?.animation || 'idle',
        })
      }
    })

    return players
  }

  /**
   * Find player object in scene by username or id.
   */
  private findPlayerObject(identifier: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null
    this.scene.traverse((obj) => {
      if (obj.userData?.type === 'player') {
        if (
          obj.userData.properties?.username === identifier ||
          obj.userData.id === identifier ||
          obj.name === identifier
        ) {
          found = obj
        }
      }
    })
    return found
  }

  /**
   * Find player JSON node by username or id in source of truth.
   */
  private findPlayerObjectJson(identifier: string): SceneObjectJson | null {
    if (!this.sceneJson) {
      return null
    }

    const search = (obj: SceneObjectJson): SceneObjectJson | null => {
      if (obj.userData?.type === 'player') {
        const properties = obj.userData.properties as
          | Record<string, unknown>
          | undefined
        if (
          properties?.username === identifier ||
          obj.userData.id === identifier ||
          obj.name === identifier
        ) {
          return obj
        }
      }

      if (obj.children) {
        for (const child of obj.children) {
          const found = search(child)
          if (found) {
            return found
          }
        }
      }

      return null
    }

    return search(this.sceneJson)
  }

  /**
   * Get player by username or id.
   * Reads from scene - single source of truth.
   */
  getPlayer(identifier: string): PlayerData | null {
    const obj = this.findPlayerObject(identifier)
    if (!obj) {
      return null
    }

    const quaternion = new THREE.Quaternion()
    obj.getWorldQuaternion(quaternion)

    return {
      playerId: obj.userData.id || obj.name,
      username: obj.userData.properties?.username || null,
      position: {
        x: obj.position.x,
        y: obj.position.y,
        z: obj.position.z,
      },
      rotation: {
        x: quaternion.x,
        y: quaternion.y,
        z: quaternion.z,
        w: quaternion.w,
      },
      animation: obj.userData.properties?.animation || 'idle',
    }
  }

  /**
   * Update player state. Creates player if not exists.
   * Modifies scene - single source of truth.
   * Accepts 4x4 transformation matrix (column-major, 16 elements).
   */
  updatePlayer(
    identifier: string,
    state: { matrix?: number[]; animation?: AnimationName },
  ): PlayerData | null {
    let obj = this.findPlayerObject(identifier)
    let objJson = this.findPlayerObjectJson(identifier)

    // Apply matrix if provided
    const applyMatrix = (target: THREE.Object3D, matrix: number[]) => {
      const m = new THREE.Matrix4()
      m.fromArray(matrix)

      // Extract position, rotation, scale from matrix
      const position = new THREE.Vector3()
      const quaternion = new THREE.Quaternion()
      const scale = new THREE.Vector3()
      m.decompose(position, quaternion, scale)

      // Sanitize Y position
      if (position.y < MIN_Y_POSITION) {
        console.warn(
          `[world3d-store] Position Y=${position.y.toFixed(2)} below minimum, resetting to safe height`,
        )
        position.y = SAFE_Y_POSITION
      }

      target.position.copy(position)
      target.quaternion.copy(quaternion)
      target.scale.copy(scale)
      target.updateMatrix()
      target.updateMatrixWorld(true)
    }

    if (!obj) {
      // Create new player object in scene
      obj = new THREE.Object3D()
      obj.name = identifier
      obj.userData = {
        id: identifier,
        type: 'player',
        properties: {
          username: identifier,
          animation: state.animation || 'idle',
        },
      }
      if (state.matrix) {
        applyMatrix(obj, state.matrix)
      }
      this.scene.add(obj)

      if (this.sceneJson) {
        if (!this.sceneJson.children) {
          this.sceneJson.children = []
        }

        objJson = {
          uuid: obj.uuid,
          type: obj.type,
          name: obj.name,
          matrix: obj.matrix.toArray(),
          userData: {
            id: identifier,
            type: 'player',
            properties: {
              username: identifier,
              animation: state.animation || 'idle',
            },
          },
        }

        this.sceneJson.children.push(objJson)
      }
    } else {
      // Update existing player
      if (state.matrix) {
        applyMatrix(obj, state.matrix)
      }
      if (state.animation) {
        obj.userData.properties = obj.userData.properties || {}
        obj.userData.properties.animation = state.animation
      }
    }

    if (objJson) {
      objJson.name = obj.name
      objJson.matrix = obj.matrix.toArray()
      objJson.userData = {
        ...(objJson.userData || {}),
        id: obj.userData.id || obj.name,
        type: 'player',
        properties: {
          ...(((objJson.userData || {}).properties as
            | Record<string, unknown>
            | undefined) || {}),
          username: obj.userData.properties?.username || identifier,
          animation: obj.userData.properties?.animation || 'idle',
        },
      }
    }

    this.saveSnapshot()
    this.saveWorld()

    // Emit event for broadcasting
    this.emit({
      type: 'object_updated',
      id: obj.userData.id || obj.name,
      object: obj.toJSON(),
    })

    return this.getPlayer(identifier)
  }

  /**
   * Check if player exists in world.
   */
  hasPlayer(identifier: string): boolean {
    return this.getPlayer(identifier) !== null
  }

  /**
   * Find object in JSON by uuid (source of truth).
   */
  private findObjectJsonByUuid(uuid: string): SceneObjectJson | null {
    if (!this.sceneJson) {
      return null
    }
    if (uuid === 'root' || this.sceneJson.uuid === uuid) {
      return this.sceneJson
    }

    const search = (obj: SceneObjectJson): SceneObjectJson | null => {
      if (obj.uuid === uuid) {
        return obj
      }
      if (obj.children) {
        for (const child of obj.children) {
          const found = search(child)
          if (found) {
            return found
          }
        }
      }
      return null
    }

    return search(this.sceneJson)
  }

  /**
   * Read object and children recursively from JSON (source of truth).
   */
  read(uuid: string = 'root'): object | null {
    const obj = this.findObjectJsonByUuid(uuid)
    if (!obj) {
      console.warn(`[world3d-store] read: object not found for uuid=${uuid}`)
      return null
    }

    return { object: obj }
  }

  /**
   * Create a new object in the world from Three.js JSON format.
   */
  create(params: CreateParams): object | { success: false; error: string } {
    const { parentId = 'root', object } = params

    if (!this.sceneJson) {
      return { success: false, error: 'World not initialized' }
    }

    const newObj = object as SceneObjectJson
    if (!newObj.uuid) {
      return { success: false, error: 'Object must have uuid' }
    }

    // Check if already exists
    if (this.findObjectJsonByUuid(newObj.uuid)) {
      return { success: false, error: `Object ${newObj.uuid} already exists` }
    }

    // Find parent in JSON
    const parent = this.findObjectJsonByUuid(parentId)
    if (!parent) {
      return { success: false, error: `Parent ${parentId} not found` }
    }

    // Add to parent's children
    if (!parent.children) {
      parent.children = []
    }
    parent.children.push(newObj)

    this.saveSnapshot()
    this.saveWorld()
    this.renderScene()

    // Emit event for broadcasting
    this.emit({
      type: 'object_created',
      id: newObj.uuid,
      parentId,
      object: newObj,
    })

    return { object: newObj }
  }

  /**
   * Update an existing object in the world.
   * Performs Object merge on JSON (source of truth).
   */
  update(params: UpdateParams): object | { success: false; error: string } {
    const { uuid, object } = params

    const existingObj = this.findObjectJsonByUuid(uuid)
    if (!existingObj) {
      return {
        success: false,
        error: `Object with uuid ${uuid} not found`,
      }
    }

    // Simple Object merge (preserving children unless explicitly provided)
    const patch = object as Record<string, unknown>
    const preserveChildren = existingObj.children

    Object.assign(existingObj, patch)

    // Preserve children if not in patch
    if (!('children' in patch) && preserveChildren) {
      existingObj.children = preserveChildren
    }

    this.saveSnapshot()
    this.saveWorld()
    this.renderScene()

    // Emit event for broadcasting
    this.emit({
      type: 'object_updated',
      id: uuid,
      object: existingObj,
    })

    return { object: existingObj }
  }

  /**
   * Delete an object from the world.
   */
  delete(params: DeleteParams): boolean {
    const { nodeId: uuid, cascade = false } = params

    if (uuid === 'root') {
      throw new Error('Cannot delete root node')
    }

    if (!this.sceneJson) {
      throw new Error('World not initialized')
    }

    // Find and remove from JSON
    const removeFromParent = (parent: SceneObjectJson): boolean => {
      if (!parent.children) {
        return false
      }
      const index = parent.children.findIndex((c) => c.uuid === uuid)
      if (index !== -1) {
        const obj = parent.children[index]
        if (!cascade && obj.children && obj.children.length > 0) {
          throw new Error(
            `Object ${uuid} has children. Use cascade=true to delete with children`,
          )
        }
        parent.children.splice(index, 1)
        return true
      }
      for (const child of parent.children) {
        if (removeFromParent(child)) {
          return true
        }
      }
      return false
    }

    if (!removeFromParent(this.sceneJson)) {
      throw new Error(`Object ${uuid} not found`)
    }

    this.saveSnapshot()
    this.saveWorld()
    this.renderScene()

    // Emit event for broadcasting
    this.emit({
      type: 'object_deleted',
      id: uuid,
    })

    return true
  }

  /**
   * Get world statistics.
   */
  getStats(): StatsResult {
    let nodeCount = 0
    this.scene.traverse(() => {
      nodeCount++
    })

    const snapshotsDir = getSnapshotsDir(this.worldName)
    let snapshotCount = 0
    if (fs.existsSync(snapshotsDir)) {
      snapshotCount = countSnapshotFiles(snapshotsDir)
    }

    return { worldName: this.worldName, nodeCount, snapshotCount }
  }

  /**
   * Get the current world name.
   */
  getWorldName(): string {
    return this.worldName
  }
}

export const world3dStore = new World3DStore()

export async function initializeWorld3D(
  worldName: string = DEFAULT_WORLD_NAME,
): Promise<void> {
  await world3dStore.initialize(worldName)
}
