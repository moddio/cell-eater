/**
 * State Delta Computation
 *
 * Computes compact deltas between snapshots for efficient network sync.
 * Used by the distributed state sync protocol.
 */
import { SparseSnapshot } from '../core/snapshot';
/**
 * Represents changes between two world states.
 */
export interface StateDelta {
    /** Frame number this delta applies to */
    frame: number;
    /** Hash of the base state (before applying delta) */
    baseHash: number;
    /** Hash of the resulting state (after applying delta) */
    resultHash: number;
    /** Newly created entities */
    created: CreatedEntity[];
    /** Deleted entity IDs */
    deleted: number[];
}
/**
 * A newly created entity with all its data.
 */
export interface CreatedEntity {
    eid: number;
    type: string;
    clientId?: number;
    /** Component name -> field name -> value */
    components: Record<string, Record<string, number>>;
}
/**
 * Compute state delta between two snapshots.
 */
export declare function computeStateDelta(prevSnapshot: SparseSnapshot | null, currentSnapshot: SparseSnapshot): StateDelta;
/**
 * Compute xxhash32 of a snapshot for state verification.
 */
export declare function computeSnapshotHash(snapshot: SparseSnapshot): number;
/**
 * Serialize delta to binary format for network transfer.
 */
export declare function serializeDelta(delta: StateDelta): Uint8Array;
/**
 * Deserialize delta from binary format.
 */
export declare function deserializeDelta(bytes: Uint8Array): StateDelta;
/**
 * Get partition data for a specific partition.
 * Partitions entities by eid % numPartitions.
 *
 * @param delta Full delta
 * @param partitionId Which partition (0 to numPartitions-1)
 * @param numPartitions Total number of partitions
 * @returns Serialized partition data containing only entities for this partition
 */
export declare function getPartition(delta: StateDelta, partitionId: number, numPartitions: number): Uint8Array;
/**
 * Determine which partition an entity belongs to.
 */
export declare function getEntityPartition(eid: number, numPartitions: number): number;
/**
 * Partition-specific delta data.
 */
export interface PartitionDelta {
    partitionId: number;
    numPartitions: number;
    frame: number;
    created: CreatedEntity[];
    deleted: number[];
}
/**
 * Deserialize partition data.
 */
export declare function deserializePartition(bytes: Uint8Array): PartitionDelta;
/**
 * Assemble full delta from partition data.
 */
export declare function assemblePartitions(partitions: PartitionDelta[]): StateDelta | null;
/**
 * Apply delta to update snapshot/world state.
 * Returns the entity IDs that were affected.
 */
export declare function applyDelta(delta: StateDelta, createEntity: (eid: number, type: string, clientId?: number, components?: Record<string, Record<string, number>>) => void, deleteEntity: (eid: number) => void): {
    created: number[];
    deleted: number[];
};
/**
 * Check if delta is empty (no changes).
 */
export declare function isDeltaEmpty(delta: StateDelta): boolean;
/**
 * Get approximate size of delta in bytes.
 */
export declare function getDeltaSize(delta: StateDelta): number;
