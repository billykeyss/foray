/** Identification feature a coastal-species photo depicts. */
export type OceanImageKind =
  | "whole"
  | "blade"
  | "shell"
  | "detail"
  | "habitat";

/** A coastal photo tagged with the feature it shows, for the detail-page gallery.
 *  Structurally compatible with components/photo-gallery.tsx `GalleryImage`. */
export interface OceanDetailImage {
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
  kind: OceanImageKind;
  caption?: string;
}
