'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

/**
 * Undo/redo over an immutable state object.
 *
 * History stores editor *settings*, never pixels — a stack of rasters for a
 * 24MP image would exhaust memory within a few edits. Re-rendering from
 * settings is fast because the source bitmap is decoded once.
 *
 * Consecutive changes of the same kind (dragging a slider) are coalesced so one
 * gesture produces one undo step rather than sixty.
 */

const MAX_HISTORY = 40;
const COALESCE_WINDOW_MS = 600;

export interface HistoryController<T> {
  state: T;
  set: (next: T | ((current: T) => T), options?: { coalesceKey?: string }) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useEditorState<T>(initial: T): HistoryController<T> {
  const [past, setPast] = useState<T[]>([]);
  const [present, setPresent] = useState<T>(initial);
  const [future, setFuture] = useState<T[]>([]);

  const lastChange = useRef<{ key: string; at: number } | null>(null);
  const initialRef = useRef(initial);

  const set = useCallback(
    (next: T | ((current: T) => T), options: { coalesceKey?: string } = {}) => {
      setPresent((current) => {
        const resolved =
          typeof next === 'function' ? (next as (value: T) => T)(current) : next;
        if (Object.is(resolved, current)) return current;

        const now = Date.now();
        const shouldCoalesce =
          options.coalesceKey !== undefined &&
          lastChange.current?.key === options.coalesceKey &&
          now - lastChange.current.at < COALESCE_WINDOW_MS;

        if (!shouldCoalesce) {
          setPast((stack) => [...stack, current].slice(-MAX_HISTORY));
        }
        lastChange.current = options.coalesceKey
          ? { key: options.coalesceKey, at: now }
          : null;

        setFuture([]);
        return resolved;
      });
    },
    [],
  );

  const undo = useCallback(() => {
    setPast((stack) => {
      if (stack.length === 0) return stack;
      const previous = stack[stack.length - 1] as T;
      setPresent((current) => {
        setFuture((forward) => [current, ...forward]);
        return previous;
      });
      lastChange.current = null;
      return stack.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((stack) => {
      if (stack.length === 0) return stack;
      const next = stack[0] as T;
      setPresent((current) => {
        setPast((backward) => [...backward, current].slice(-MAX_HISTORY));
        return next;
      });
      lastChange.current = null;
      return stack.slice(1);
    });
  }, []);

  const reset = useCallback(() => {
    setPresent((current) => {
      setPast((stack) => [...stack, current].slice(-MAX_HISTORY));
      return initialRef.current;
    });
    setFuture([]);
    lastChange.current = null;
  }, []);

  return useMemo(
    () => ({
      state: present,
      set,
      undo,
      redo,
      reset,
      canUndo: past.length > 0,
      canRedo: future.length > 0,
    }),
    [present, set, undo, redo, reset, past.length, future.length],
  );
}
