export interface Marker {
  start: number;
  end: number;
  label: string;
}

export interface Track {
  url: string;
  title: string;
  markers: Marker[];
  duration?: number; // Optional duration in seconds
}

export interface Composition {
  id: number;
  title: string;
  tracks: Track[];
} 