/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { serviceAreaCodes, type ServiceAreaCode } from '../data/siteData';

const STORAGE_KEY = 'sssb-service-area-v1';

type ServiceAreaContextValue = {
  /** null means "All locations". */
  area: ServiceAreaCode | null;
  selectArea: (area: ServiceAreaCode | null) => void;
};

const ServiceAreaContext = createContext<ServiceAreaContextValue | null>(null);

function readStoredArea(): ServiceAreaCode | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && serviceAreaCodes.includes(stored as ServiceAreaCode)
      ? (stored as ServiceAreaCode)
      : null;
  } catch {
    return null;
  }
}

/**
 * Holds the visitor's chosen service area. Services, products and promotions all read the same
 * value, so choosing a location in one section keeps the rest of the page consistent with it.
 */
export function ServiceAreaProvider({ children }: { children: ReactNode }) {
  const [area, setArea] = useState<ServiceAreaCode | null>(() =>
    typeof window === 'undefined' ? null : readStoredArea(),
  );

  const selectArea = useCallback((next: ServiceAreaCode | null) => {
    setArea(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, next);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage can be unavailable in privacy modes; the choice still applies for this visit.
    }
  }, []);

  const value = useMemo<ServiceAreaContextValue>(() => ({ area, selectArea }), [area, selectArea]);

  return <ServiceAreaContext.Provider value={value}>{children}</ServiceAreaContext.Provider>;
}

export function useServiceArea() {
  const value = useContext(ServiceAreaContext);
  if (!value) throw new Error('useServiceArea must be used inside ServiceAreaProvider.');
  return value;
}
