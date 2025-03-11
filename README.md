# BirdsMilkDatasetViewer

A dataset visualization tool with multi-track audio player functionality.

A multi-track audio player component built using Svelte and WaveSurfer.js, featuring waveform visualization, markers, and synchronized playback control.

## Features

### Core Functionality
- **Multi-track Support**: Display and control multiple audio tracks simultaneously
- **Waveform Visualization**: Visual audio representation using WaveSurfer.js
- **Synchronized Playback**: All tracks maintain synchronized playback positions
- **Marker System**: Visual markers for important audio points
- **Loop Control**: Set and clear loop regions for repeated playback

### Playback Controls
- Play/pause individual tracks
- Only one track can play at a time
- Synchronized seeking across all tracks
- Loop support with customizable start/end points

### Visual Elements
- Waveform display for each track
- Visual markers showing annotated regions
- Playback position indicator
- Play/pause buttons for each track
- Loop control interface

### User Interface
- Clean and modern design
- Clear visual separation between tracks
- Responsive layout
- Intuitive controls

## Technical Architecture

### Frontend (Svelte + TypeScript)
- **AudioPlayer Component** (`src/lib/AudioPlayer.svelte`)
  - Manages individual track playback
  - Handles waveform visualization
  - Controls track synchronization
  - Manages loop regions
  - Renders markers and UI

- **App Component** (`src/App.svelte`)
  - Fetches composition data
  - Renders multiple AudioPlayer instances
  - Manages global state

- **Type Definitions** (`src/lib/types.ts`)
  ```typescript
  interface Marker {
    start: number;
    end: number;
    label: string;
  }

  interface Track {
    url: string;
    markers: Marker[];
  }

  interface Composition {
    id: number;
    title: string;
    tracks: Track[];
  }
  ```

### Backend (Express)
- Serves audio files
- Provides composition metadata
- RESTful API endpoints:
  - GET `/api/compositions`: List all compositions
  - GET `/api/compositions/:id`: Get specific composition
  - Static serving of audio files

## Implementation Details

### WaveSurfer Integration
```typescript
const wavesurfer = WaveSurfer.create({
  container,
  waveColor: '#4a9eff',
  progressColor: '#1e6bb8',
  cursorColor: '#ff0000',
  height: 100,
  normalize: true
});
```

### Marker System
```typescript
track.markers.forEach(marker => {
  const markerEl = document.createElement('div');
  markerEl.style.position = 'absolute';
  markerEl.style.left = `${(marker.start / wavesurfer.getDuration()) * 100}%`;
  markerEl.style.width = `${((marker.end - marker.start) / wavesurfer.getDuration()) * 100}%`;
  markerEl.style.height = '100%';
  markerEl.style.background = 'rgba(255, 0, 0, 0.2)';
  markerEl.title = marker.label;
  container.appendChild(markerEl);
});
```

### Track Synchronization
```typescript
wavesurfer.on('seeking', () => {
  const currentTime = wavesurfer.getCurrentTime();
  const duration = wavesurfer.getDuration() || 1;
  const progress = currentTime / duration;
  
  wavesurfers.forEach((ws, i) => {
    if (i !== index) {
      ws.seekTo(progress);
    }
  });
});
```

### Loop Region Management
```typescript
wavesurfer.on('audioprocess', (currentTime: number) => {
  if (loopStart !== null && loopEnd !== null) {
    if (currentTime >= loopEnd) {
      wavesurfer.seekTo(loopStart / (wavesurfer.getDuration() || 1));
    }
  }
});
```

## Installation

1. Install frontend dependencies:
```bash
npm install
```

2. Install server dependencies:
```bash
cd server
npm install
```

3. Add your audio files to the `server/audio` directory.

## Running the Application

1. Start the backend server:
```bash
cd server
npm run dev
```

2. In a new terminal, start the frontend development server:
```bash
npm run dev
```

3. Open your browser and navigate to `http://localhost:7778`

## Development

### Adding New Compositions

To add new compositions, modify the `compositions` array in `server/index.js`. Each composition should follow this structure:

```javascript
{
  id: number,
  title: string,
  tracks: [
    {
      url: string,
      markers: [
        {
          start: number,
          end: number,
          label: string
        }
      ]
    }
  ]
}
```

### Player Customization

The AudioPlayer component can be customized by modifying:
- Waveform colors and dimensions
- Player controls and layout
- Marker visualization
- Loop region behavior

## Browser Support
- Modern browsers with Web Audio API support
- Chrome/Edge (recommended for best performance)
- Firefox
- Safari

## Dependencies
- Svelte
- TypeScript
- WaveSurfer.js
- Express
- CORS
