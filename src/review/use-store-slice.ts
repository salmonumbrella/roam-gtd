import { useEffect, useRef, useState } from "react";

interface StoreSubscriptionSource<TState> {
  getSnapshot: () => TState;
  subscribe: (listener: (state: TState) => void) => () => void;
}

export function useStoreSlice<TState, TSlice>(
  store: StoreSubscriptionSource<TState>,
  selector: (state: TState) => TSlice,
  isEqual: (left: TSlice, right: TSlice) => boolean = Object.is,
): TSlice {
  const selectorRef = useRef(selector);
  const isEqualRef = useRef(isEqual);
  const [slice, setSlice] = useState(() => selector(store.getSnapshot()));

  useEffect(() => {
    selectorRef.current = selector;
    isEqualRef.current = isEqual;

    const nextSlice = selector(store.getSnapshot());
    if (isEqual(slice, nextSlice)) {
      return;
    }

    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) {
        return;
      }
      setSlice((current) => (isEqualRef.current(current, nextSlice) ? current : nextSlice));
    });

    return () => {
      cancelled = true;
    };
  }, [isEqual, selector, slice, store]);

  useEffect(() => {
    return store.subscribe((state) => {
      const nextSlice = selectorRef.current(state);
      setSlice((current) => (isEqualRef.current(current, nextSlice) ? current : nextSlice));
    });
  }, [store]);

  // React 16 lacks useSyncExternalStore, so this selector wrapper can still
  // observe tearing during concurrent external updates. Keep selectors stable
  // and pair them with a narrow equality function when selecting objects.
  return slice;
}
