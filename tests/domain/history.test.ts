import { describe, expect, it } from 'vitest';
import { pushUndo, popUndo, UNDO_LIMIT } from '../../src/domain/history';
import { addToStock, createState, totalAmount } from '../../src/domain/index';
import type { UndoEntry } from '../../src/domain/history';

function entry(kind: string, state: ReturnType<typeof createState>): UndoEntry {
  return { kind, message: 'Did ' + kind + '.', state };
}

describe('undo history', () => {
  it('clones the snapshot so later kitchen work cannot rewrite it', () => {
    const before = addToStock(createState(), 'tomato', 3);
    const stack = pushUndo([], entry('restock', before));
    expect(stack[0]!.state).not.toBe(before);

    // The domain is immutable, but a snapshot must survive even in-place
    // mutation; this is the guarantee that makes "exact prior state" true.
    before.stockLots[0]!.amount = 99;
    expect(totalAmount(stack[0]!.state.stockLots, 'tomato')).toBe(3);
  });

  it('pops the newest snapshot first, leaving the older ones', () => {
    const first = createState();
    const second = addToStock(first, 'tomato', 2);
    let stack = pushUndo([], entry('restock', first));
    stack = pushUndo(stack, entry('cooking', second));

    const popped = popUndo(stack);
    expect(popped).not.toBeNull();
    expect(popped!.entry.kind).toBe('cooking');
    expect(totalAmount(popped!.entry.state.stockLots, 'tomato')).toBe(2);
    expect(popped!.rest).toHaveLength(1);
    expect(popped!.rest[0]!.kind).toBe('restock');

    const last = popUndo(popped!.rest);
    expect(last!.entry.state).toEqual(first);
    expect(last!.rest).toEqual([]);
  });

  it('returns null when there is nothing to undo', () => {
    expect(popUndo([])).toBeNull();
  });

  it('drops the oldest snapshots once the limit is reached', () => {
    let stack: UndoEntry[] = [];
    for (let i = 1; i <= 5; i++) {
      const state = addToStock(createState(), 'tomato', i);
      stack = pushUndo(stack, entry('restock-' + i, state), 3);
    }
    expect(stack).toHaveLength(3);
    expect(stack.map((e) => e.kind)).toEqual(['restock-3', 'restock-4', 'restock-5']);
    expect(stack[2]!.state.stockLots[0]!.amount).toBe(5);
  });

  it('keeps a bounded default limit', () => {
    expect(UNDO_LIMIT).toBeGreaterThan(0);
    expect(UNDO_LIMIT).toBeLessThanOrEqual(50);
  });
});
