/** Geo point for smart store selection (see `storeSelector.ts`). */
export interface LuminaStoreLocation {
  lat: number;
  lng: number;
}

export interface LuminaStore {
  id: string;
  name: string;
  location: LuminaStoreLocation;
  isActive: boolean;
}

export interface LuminaInventoryItem {
  storeId: string;
  bookId: string;
  quantity: number;
}

/** Admin / ERP book row (list screens). */
export interface LuminaAdminBookListItem {
  id: string;
  title: string;
  isbn: string;
  priceLkr: number;
}

/** Admin order summary (list screens). */
export interface LuminaOrderSummary {
  id: string;
  status: string;
  customerName: string;
  totalLkr: number;
}
