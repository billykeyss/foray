/** Identification feature a plant photo depicts. */
export type PlantImageKind =
  | "whole"
  | "leaf"
  | "flower"
  | "fruit"
  | "seed"
  | "bark"
  | "root"
  | "habitat";

/** A plant photo tagged with the feature it shows, for the detail-page gallery.
 *  Structurally compatible with components/photo-gallery.tsx `GalleryImage`. */
export interface PlantDetailImage {
  url: string;
  thumb: string | null;
  width: number;
  height: number;
  thumbWidth: number | null;
  thumbHeight: number | null;
  artist: string | null;
  credit: string | null;
  license: string | null;
  sourceUrl: string | null;
  pageUrl: string | null;
  kind: PlantImageKind;
  caption?: string;
}
