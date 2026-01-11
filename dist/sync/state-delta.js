/**
 * State Delta Computation
 *
 * Computes compact deltas between snapshots for efficient network sync.
 * Used by the distributed state sync protocol.
 */
import { xxhash32Combine } from '../hash/xxhash';
import { getAllComponents } from '../core/component';
/**
 * Compute state delta between two snapshots.
 */
export function computeStateDelta(prevSnapshot, currentSnapshot) {
    const allComponents = getAllComponents();
    // Build lookup for previous entity IDs
    const prevEntityIds = new Set();
    if (prevSnapshot) {
        for (const meta of prevSnapshot.entityMeta) {
            prevEntityIds.add(meta.eid);
        }
    }
    // Find created entities (need component data for new entities)
    const created = [];
    const deleted = [];
    for (let i = 0; i < currentSnapshot.entityMeta.length; i++) {
        const meta = currentSnapshot.entityMeta[i];
        if (!prevEntityIds.has(meta.eid)) {
            // New entity - extract component data
            const entityData = {};
            for (const [compName, buffer] of currentSnapshot.componentData) {
                const component = allComponents.get(compName);
                if (!component)
                    continue;
                const fields = {};
                let offset = 0;
                for (const fieldName of component.fieldNames) {
                    const arr = component.storage.fields[fieldName];
                    const bytesPerElement = arr.BYTES_PER_ELEMENT;
                    const packedArr = new arr.constructor(buffer, offset, currentSnapshot.entityCount);
                    fields[fieldName] = packedArr[i];
                    offset += currentSnapshot.entityCount * bytesPerElement;
                }
                entityData[compName] = fields;
            }
            created.push({
                eid: meta.eid,
                type: meta.type,
                clientId: meta.clientId,
                components: entityData
            });
        }
    }
    // Find deleted entities
    if (prevSnapshot) {
        const currentEntityIds = new Set();
        for (const meta of currentSnapshot.entityMeta) {
            currentEntityIds.add(meta.eid);
        }
        for (const meta of prevSnapshot.entityMeta) {
            if (!currentEntityIds.has(meta.eid)) {
                deleted.push(meta.eid);
            }
        }
    }
    // Sort for determinism
    created.sort((a, b) => a.eid - b.eid);
    deleted.sort((a, b) => a - b);
    return {
        frame: currentSnapshot.frame,
        baseHash: prevSnapshot ? computeSnapshotHash(prevSnapshot) : 0,
        resultHash: computeSnapshotHash(currentSnapshot),
        created,
        deleted
    };
}
/**
 * Compute xxhash32 of a snapshot for state verification.
 */
export function computeSnapshotHash(snapshot) {
    const allComponents = getAllComponents();
    let hash = 0;
    // Hash frame number
    hash = xxhash32Combine(hash, snapshot.frame);
    // Hash entity count
    hash = xxhash32Combine(hash, snapshot.entityCount);
    // Hash each entity in deterministic order (already sorted in snapshot)
    for (let i = 0; i < snapshot.entityMeta.length; i++) {
        const meta = snapshot.entityMeta[i];
        // Hash eid
        hash = xxhash32Combine(hash, meta.eid);
        // Hash component data for this entity
        for (const [compName, buffer] of snapshot.componentData) {
            const component = allComponents.get(compName);
            if (!component)
                continue;
            let offset = 0;
            for (const fieldName of component.fieldNames) {
                const arr = component.storage.fields[fieldName];
                const bytesPerElement = arr.BYTES_PER_ELEMENT;
                const packedArr = new arr.constructor(buffer, offset, snapshot.entityCount);
                const value = packedArr[i];
                hash = xxhash32Combine(hash, value >>> 0);
                offset += snapshot.entityCount * bytesPerElement;
            }
        }
    }
    return hash >>> 0;
}
/**
 * Serialize delta to binary format for network transfer.
 */
export function serializeDelta(delta) {
    // Use JSON for simplicity - can optimize to binary later
    const json = JSON.stringify(delta);
    const encoder = new TextEncoder();
    return encoder.encode(json);
}
/**
 * Deserialize delta from binary format.
 */
export function deserializeDelta(bytes) {
    const decoder = new TextDecoder();
    const json = decoder.decode(bytes);
    return JSON.parse(json);
}
/**
 * Get partition data for a specific partition.
 * Partitions entities by eid % numPartitions.
 *
 * @param delta Full delta
 * @param partitionId Which partition (0 to numPartitions-1)
 * @param numPartitions Total number of partitions
 * @returns Serialized partition data containing only entities for this partition
 */
export function getPartition(delta, partitionId, numPartitions) {
    // Filter created entities
    const partitionCreated = delta.created.filter(e => getEntityPartition(e.eid, numPartitions) === partitionId);
    // Filter deleted entities
    const partitionDeleted = delta.deleted.filter(eid => getEntityPartition(eid, numPartitions) === partitionId);
    const partitionDelta = {
        partitionId,
        numPartitions,
        frame: delta.frame,
        created: partitionCreated,
        deleted: partitionDeleted
    };
    const json = JSON.stringify(partitionDelta);
    const encoder = new TextEncoder();
    return encoder.encode(json);
}
/**
 * Determine which partition an entity belongs to.
 */
export function getEntityPartition(eid, numPartitions) {
    return eid % numPartitions;
}
/**
 * Deserialize partition data.
 */
export function deserializePartition(bytes) {
    const decoder = new TextDecoder();
    const json = decoder.decode(bytes);
    return JSON.parse(json);
}
/**
 * Assemble full delta from partition data.
 */
export function assemblePartitions(partitions) {
    if (partitions.length === 0)
        return null;
    // Verify all partitions are for the same frame
    const frame = partitions[0].frame;
    for (const p of partitions) {
        if (p.frame !== frame) {
            console.warn('Partition frame mismatch');
            return null;
        }
    }
    // Combine all partition data
    const created = [];
    const deleted = [];
    for (const p of partitions) {
        created.push(...p.created);
        deleted.push(...p.deleted);
    }
    // Sort for determinism
    created.sort((a, b) => a.eid - b.eid);
    deleted.sort((a, b) => a - b);
    return {
        frame,
        baseHash: 0, // Not known from partitions
        resultHash: 0, // Not known from partitions
        created,
        deleted
    };
}
/**
 * Apply delta to update snapshot/world state.
 * Returns the entity IDs that were affected.
 */
export function applyDelta(delta, createEntity, deleteEntity) {
    // Apply deletions first
    for (const eid of delta.deleted) {
        deleteEntity(eid);
    }
    // Apply creations
    for (const entity of delta.created) {
        createEntity(entity.eid, entity.type, entity.clientId, entity.components);
    }
    return {
        created: delta.created.map(e => e.eid),
        deleted: delta.deleted
    };
}
/**
 * Check if delta is empty (no changes).
 */
export function isDeltaEmpty(delta) {
    return delta.created.length === 0 && delta.deleted.length === 0;
}
/**
 * Get approximate size of delta in bytes.
 */
export function getDeltaSize(delta) {
    // Rough estimate
    let size = 16; // frame + hashes
    for (const entity of delta.created) {
        size += 12; // eid + type overhead
        size += JSON.stringify(entity.components).length;
    }
    size += delta.deleted.length * 4; // 4 bytes per deleted eid
    return size;
}
