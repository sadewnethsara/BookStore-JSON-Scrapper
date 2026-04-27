/** Customer storefront book review (UI-facing). */
export interface StorefrontReview {
  userName: string;
  userAvatar: string;
  rating: number;
  comment: string;
  date: string;
}

/** Customer storefront book card / detail (UI-facing; maps from catalog + joins). */
export interface StorefrontBook {
  id: string;
  title: string;
  author: string;
  /** Browsing facet; use "" when unknown until category joins exist everywhere. */
  category: string;
  imageUrl: string;
  imageGallery: string[];
  price: number;
  rating: number;
  reviews: StorefrontReview[];
  /** Flutter home grid only. */
  gridSize?: string;
  isVideo?: boolean;
}
