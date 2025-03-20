export interface Marker {
  start: number;
  end: number;
  label: string;
}

export interface Segment {
  label: string;
  phi4_text: string;
  whisper3_text: string;
  nemo_text: string;
}

export interface Track {
  url: string;
  title: string;
  markers: Marker[];
  segments: Segment[];
  duration?: number; // Optional duration in seconds
}

export interface Composition {
  id: number;
  title: string;
  tracks: Track[];
} 