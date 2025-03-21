<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import WaveSurfer from 'wavesurfer.js';
  import type { Track } from './types';

  export let title: string;
  export let tracks: Track[];

  const playerId = `player_${title.replace(/\s+/g, '_')}_${Date.now().toString(36)}`;
  
  let wavesurfers: WaveSurfer[] = [];
  let trackStates = tracks.map(() => ({ isPlaying: false, position: 0 }));
  let activeTrackIndex = -1;
  let startPosition = 0;
  let locks = { seeking: false, scrolling: false };
  let scrollListeners: {element: HTMLElement, handler: EventListener}[] = [];
  
  // Add state for active marker tracking
  let activeMarker: { trackIndex: number, start: number, end: number } | null = null;
  
  const maxZoom = 500;
  const minZoom = 5;
  const defaultZoom = 20;
  
  let zoomLevel = defaultZoom;
  let markerCounter = 0;
  let tempMarkerStart: { trackIndex: number, time: number } | null = null;
  
  let markersAdded = tracks.map(() => false);
  let originalMarkerData = tracks.map(track => 
    track.markers ? [...track.markers.map(m => ({...m}))] : []
  );
  let originalSegmentData = tracks.map(track => 
    track.segments ? [...track.segments.map(s => ({...s}))] : []
  );
  let trackDurations = tracks.map(track => track.duration || 0);
  
  const markerColors = [
    { bg: 'rgba(74, 158, 255, 0.2)', border: 'transparent', label: '#2980b9' },
    { bg: 'rgba(255, 87, 87, 0.2)', border: 'transparent', label: '#c0392b' },
    { bg: 'rgba(103, 230, 103, 0.2)', border: 'transparent', label: '#27ae60' }
  ];
  
  const getContainerId = (index: number) => `waveform-${playerId}-${index}`;
  const getStorageId = (index: number) => `pos_${title.replace(/\s+/g, '_')}_track${index}`;
  const getTrackName = (index: number) => tracks[index]?.title || `Track ${index + 1}`;
  
  function savePosition(position: number, index: number = activeTrackIndex) {
    if (position <= 0) return;
    try {
      sessionStorage.setItem(getStorageId(index >= 0 ? index : 0), position.toString());
    } catch (e) {}
  }
  
  function loadPosition(index: number = -1): number {
    try {
      const saved = sessionStorage.getItem(getStorageId(index >= 0 ? index : 0));
      return saved ? parseFloat(saved) : 0;
    } catch (e) {
      return 0;
    }
  }

  function syncTracks(time: number, sourceIndex: number, isPausing: boolean = false) {
    if (isPausing) return;
    
    // First sync all playheads
    wavesurfers.forEach((ws, idx) => {
      if (ws && idx !== sourceIndex) {
        ws.setTime(time);
        trackStates[idx].position = time;
        savePosition(time, idx);
      }
    });
    trackStates = [...trackStates];
    
    
      const sourceWavesurfer = wavesurfers[sourceIndex];
      if (sourceWavesurfer) {
        const scroll = sourceWavesurfer.getScroll();
        syncScroll(sourceIndex, scroll, true);
      }
   
  }

  function playTrack(index: number) {
    const wavesurfer = wavesurfers[index >= 0 ? index : 0];
    if (!wavesurfer) return;

    if (activeTrackIndex === index && trackStates[index].isPlaying) {
      wavesurfer.pause();
      trackStates[index].position = wavesurfer.getCurrentTime();
      trackStates[index].isPlaying = false;
      activeTrackIndex = -1;
    } else {
      // Stop any currently playing track
      wavesurfers.forEach((ws, i) => {
        if (ws && trackStates[i].isPlaying) {
          trackStates[i].position = ws.getCurrentTime();
          ws.pause();
          trackStates[i].isPlaying = false;
        }
      });

      // If there is an active marker on another track, use its range
      if (activeMarker && activeMarker.trackIndex !== index) {
        startPosition = activeMarker.start;
        const endPosition = activeMarker.end;

        // Sync all tracks to the start position
        wavesurfers.forEach((ws, i) => {
          if (ws && i !== index) {
            ws.setTime(startPosition);
            trackStates[i].position = startPosition;
            savePosition(startPosition, i);
          }
        });

        // Start playback on the selected track
        wavesurfer.setTime(startPosition);
        trackStates[index].position = startPosition;

        // Play until the end of the marker range
        wavesurfer.play();
        trackStates[index].isPlaying = true;
        activeTrackIndex = index;

        // Stop playback at the end of the marker range
        const checkEnd = () => {
          if (wavesurfer.getCurrentTime() >= endPosition) {
            wavesurfer.pause();
            trackStates[index].isPlaying = false;
            activeTrackIndex = -1;
            
            // Rewind all tracks to the start of the marker
            wavesurfers.forEach((ws, i) => {
              if (ws) {
                ws.setTime(startPosition);
                trackStates[i].position = startPosition;
                savePosition(startPosition, i);
              }
            });
            
            wavesurfer.un('audioprocess', checkEnd);
          }
        };
        wavesurfer.on('audioprocess', checkEnd);
      } else {
        // Default behavior if no active marker on another track
        startPosition = Math.max(...[
          wavesurfer.getCurrentTime(), 
          trackStates[index].position,
          loadPosition(index)
        ].filter(pos => pos > 0)) || 0;

        // Sync all tracks to the start position
        wavesurfers.forEach((ws, i) => {
          if (ws && i !== index) {
            ws.setTime(startPosition);
            trackStates[i].position = startPosition;
            savePosition(startPosition, i);
          }
        });

        // Start playback on the selected track
        wavesurfer.setTime(startPosition);
        trackStates[index].position = startPosition;

        // Small delay before playing to ensure all tracks are synced
        wavesurfer.play();
        trackStates[index].isPlaying = true;
        activeTrackIndex = index;
      }
    }
    
    trackStates = [...trackStates];
  }

  function rewindTrack(index: number) {
    const wavesurfer = wavesurfers[index >= 0 ? index : 0];
    if (!wavesurfer) return;
    
    wavesurfer.setTime(startPosition);
    trackStates[index].position = startPosition;
    syncTracks(startPosition, index, false);
    savePosition(startPosition, index);
    
    if (trackStates[index].isPlaying) {
      wavesurfer.pause();
      trackStates[index].isPlaying = false;
      if (activeTrackIndex === index) activeTrackIndex = -1;
      trackStates = [...trackStates];
    }
  }

  function findScrollableParent(element: HTMLElement): HTMLElement | null {
    if (!element) return null;
    if (element.scrollWidth > element.clientWidth) return element;
    return element.parentElement ? findScrollableParent(element.parentElement) : null;
  }
  
  function syncScroll(sourceIndex: number, scrollLeft: number, force: boolean = false) {
    if (!force && locks.scrolling) return;
    locks.scrolling = true;
    
    const sourceWavesurfer = wavesurfers[sourceIndex];
    if (!sourceWavesurfer) {
      locks.scrolling = false;
      return;
    }

    // Get the scroll position from the source wavesurfer
    const scroll = sourceWavesurfer.getScroll();
    
    // Sync all wavesurfers and markers directly
    wavesurfers.forEach((ws, index) => {
      if (ws && index !== sourceIndex) {
        ws.setScroll(scroll);
      }
      const container = document.getElementById(getContainerId(index));
      if (container) {
        updateMarkersForScroll(container, scrollLeft);
      }
    });
    
    locks.scrolling = false;
  }
  
  function updateMarkersForScroll(container: HTMLElement, scrollLeft: number) {
    const markersContainer = container.querySelector('.markers-container') as HTMLElement;
    if (markersContainer) {
      markersContainer.style.transform = `translateX(-${scrollLeft}px)`;
    }
  }

  function setZoom(newZoom: number) {
    zoomLevel = Math.max(minZoom, Math.min(maxZoom, newZoom));
    
    wavesurfers.forEach((ws, index) => {
      if (ws) {
        const currentTime = ws.getCurrentTime();
        ws.zoom(zoomLevel);
        ws.setTime(currentTime);
        redrawMarkers(ws, index);
      }
    });
  }
  
  function zoomIn() { setZoom(zoomLevel * 1.5); }
  function zoomOut() { setZoom(zoomLevel / 1.5); }
  function resetZoom() { setZoom(defaultZoom); }
  
  function redrawMarkers(wavesurfer: WaveSurfer, index: number) {
    const trackMarkers = originalMarkerData[index];
    const container = document.getElementById(getContainerId(index));
    if (!trackMarkers?.length || !container) return;
    
    const duration = trackDurations[index] || wavesurfer.getDuration();
    if (!duration || isNaN(duration) || duration <= 0) return;
    
    const wrapper = wavesurfer.getWrapper();
    if (!wrapper) return;
    
    let markersContainer = container.querySelector('.markers-container') as HTMLElement;
    if (!markersContainer) {
        markersContainer = document.createElement('div');
        markersContainer.className = 'markers-container';
        container.appendChild(markersContainer);
    }
    
    // Update markers container width to match the zoomed width
    markersContainer.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: ${wrapper.scrollWidth}px;
        height: calc(100% - 17px);
        pointer-events: none;
    `;
    
    markersContainer.innerHTML = '';
    
    const labelColorMap = new Map();
    
    trackMarkers.forEach((marker, markerIndex) => {
        const zoomAdjustedStartPx = (marker.start / duration) * wrapper.scrollWidth;
        const zoomAdjustedWidthPx = ((marker.end - marker.start) / duration) * wrapper.scrollWidth;
        
        let colorIndex = labelColorMap.get(marker.label);
        if (colorIndex === undefined) {
            colorIndex = markerIndex % markerColors.length;
            labelColorMap.set(marker.label, colorIndex);
        }
        
        const color = markerColors[colorIndex];
        const markerEl = createMarkerElement(marker, zoomAdjustedStartPx, zoomAdjustedWidthPx, color);
        const labelEl = createLabelElement(marker.label, color.label);
        
        markerEl.appendChild(labelEl);
        markersContainer.appendChild(markerEl);
        
        setupMarkerEventListeners(markerEl, labelEl, marker, wavesurfer, index);
    });

    // Update markers position after redraw
    const scroll = wavesurfer.getScroll();
    updateMarkersForScroll(container, scroll);
  }

  function createMarkerElement(marker: any, startPx: number, widthPx: number, color: any) {
    const markerEl = document.createElement('div');
    markerEl.className = 'waveform-marker';
    markerEl.dataset.label = marker.label;
    markerEl.dataset.start = marker.start.toString();
    markerEl.dataset.end = marker.end.toString();
    markerEl.style.cssText = `
      position: absolute;
      left: ${startPx}px;
      width: ${widthPx}px;
      height: 100%;
      background: ${color.bg};
      border-left: 3px solid ${color.border};
      border-right: 3px solid ${color.border};
      box-sizing: border-box;
      z-index: 5;
      pointer-events: auto;
      cursor: pointer;
    `;
    markerEl.title = `${marker.label} (${marker.start}s - ${marker.end}s)`;
    return markerEl;
  }

  function createLabelElement(label: string, color: string) {
    const labelEl = document.createElement('div');
    labelEl.className = 'marker-label';
    labelEl.textContent = label;
    labelEl.style.cssText = `
      position: absolute;
      padding: 2px 4px;
      background: ${color};
      color: white;
      font-size: 12px;
      font-weight: bold;
      border-radius: 2px;
      z-index: 6;
      white-space: nowrap;
      pointer-events: auto;
      cursor: pointer;
      top: 5px;
      left: 4px;
      max-width: calc(100% - 8px);
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    return labelEl;
  }

  function setupMarkerEventListeners(markerEl: HTMLElement, labelEl: HTMLElement, marker: any, wavesurfer: WaveSurfer, index: number) {
    markerEl.addEventListener('click', (e) => {
      e.stopPropagation();
      
      if (e.target === markerEl) {
        const rect = markerEl.getBoundingClientRect();
        const relativeX = (e.clientX - rect.left) / rect.width;
        const time = marker.start + (marker.end - marker.start) * relativeX;
        
        // Don't set active marker when clicking on marker region
        activeMarker = null;
        
        setTrackTime(wavesurfer, time, index);
      }
    });

    labelEl.addEventListener('click', (e) => {
      e.stopPropagation();
      
      const originalBg = markerEl.style.background;
      markerEl.style.background = 'rgba(255, 255, 0, 0.3)';
      setTimeout(() => markerEl.style.background = originalBg, 500);
      
      // Only set active marker when clicking on label
      activeMarker = {
        trackIndex: index,
        start: marker.start,
        end: marker.end
      };
      
      setTrackTime(wavesurfer, marker.start, index);
    });
    
    // Add touch event handling for markers
    markerEl.addEventListener('touchstart', (e: TouchEvent) => {
      e.stopPropagation();
    }, { passive: true });
    
    labelEl.addEventListener('touchstart', (e: TouchEvent) => {
      e.stopPropagation();
    }, { passive: true });
  }

  function setTrackTime(wavesurfer: WaveSurfer, time: number, index: number) {
    wavesurfer.setTime(time);
    trackStates[index].position = time;
    savePosition(time, index);
    syncTracks(time, index, false);
    
    if (trackStates[index].isPlaying) wavesurfer.play();
  }

  function addMarkers(wavesurfer: WaveSurfer, index: number) {
    const trackMarkers = originalMarkerData[index];
    const container = document.getElementById(getContainerId(index));
    
    if (!trackMarkers?.length || !container) return;
    
    const checkDuration = () => {
      let duration = wavesurfer.getDuration();
      if (!duration || isNaN(duration) || duration <= 0) {
        setTimeout(checkDuration, 500);
        return;
      }
      
      wavesurfer.on('zoom', () => setTimeout(() => redrawMarkers(wavesurfer, index), 50));
      
      const wrapper = wavesurfer.getWrapper();
      if (wrapper) wrapper.classList.add('wavesurfer-wrapper');
      
      trackDurations[index] = tracks[index]?.duration && 
        Math.abs(tracks[index].duration - duration) > 1 ? 
        tracks[index].duration : duration;
      
      if (!container.querySelector('.markers-container')) {
        const markersContainer = document.createElement('div');
        markersContainer.className = 'markers-container';
        markersContainer.style.cssText = `
          position: absolute;
          top: 0;
          left: 0;
          width: ${wrapper.scrollWidth}px;
          height: calc(100% - 17px);
          pointer-events: none;
        `;
        
        const scrollLeft = wavesurfer.getScroll();
        if (scrollLeft > 0) {
          markersContainer.style.setProperty('--scroll-offset', `-${scrollLeft}px`);
        }
        
        container.appendChild(markersContainer);
      }
      
      redrawMarkers(wavesurfer, index);
      markersAdded[index] = true;
      
      // Don't automatically zoom to markers anymore since we're using a fixed zoom
      if (index === 0 && originalMarkerData.some(markers => markers?.length > 0)) {
        setTimeout(() => {
          wavesurfers.forEach((ws, index) => {
            if (ws) {
              ws.setTime(0);
              trackStates[index].position = 0;
              savePosition(0, index);
              redrawMarkers(ws, index);
            }
          });
        }, 500);
      }
    };
    
    checkDuration();
  }

  function initializeWaveSurfer(container: HTMLElement, track: Track, index: number) {
    const wavesurfer = WaveSurfer.create({
      container,
      waveColor: '#4a9eff',
      progressColor: '#4a9eff',
      cursorColor: '#ff0000',
      height: 120,
      normalize: true,
      minPxPerSec: zoomLevel,
      backend: 'WebAudio',
      barWidth: 3,
      barGap: 1,
      barRadius: 0,
      barHeight: 1,
      fillParent: false,
      interact: true,
      autoScroll: true,
      dragToSeek: true,
      hideScrollbar: false,
    });

    // Throttle scroll events
    let scrollTimeout: number;
    let lastScrollTime = 0;
    const SCROLL_THROTTLE = 16; // ~60fps

    wavesurfer.on('scroll', () => {
      if (!locks.scrolling) {
        const now = Date.now();
        if (now - lastScrollTime >= SCROLL_THROTTLE) {
          if (scrollTimeout) {
            clearTimeout(scrollTimeout);
          }
          lastScrollTime = now;
          const scroll = wavesurfer.getScroll();
          syncScroll(index, scroll, true);
        } else {
          if (scrollTimeout) {
            clearTimeout(scrollTimeout);
          }
          scrollTimeout = setTimeout(() => {
            lastScrollTime = Date.now();
            const scroll = wavesurfer.getScroll();
            syncScroll(index, scroll, true);
          }, SCROLL_THROTTLE);
        }
      }
    });

    wavesurfer.on('ready', () => {
      const duration = wavesurfer.getDuration();
    });

    setupScrollSync(container, index);
    setupEventHandlers(wavesurfer, index);
    wavesurfer.load(track.url);
    
    return wavesurfer;
  }
  
  function setupScrollSync(container: HTMLElement, index: number) {
    const wavesurfer = wavesurfers[index];
    if (!wavesurfer) return;
    
    const wrapper = wavesurfer.getWrapper();
    if (!wrapper) return;
    
    wrapper.classList.add('wavesurfer-wrapper');
    
    wavesurfer.on('scroll', () => {
      if (!locks.scrolling) {
        const scrollLeft = wavesurfer.getScroll();
         
        updateMarkersForScroll(container, scrollLeft);
        syncScroll(index, scrollLeft);
      }
    });
    
    const scrollableParent = findScrollableParent(container);
    if (scrollableParent) {
      const scrollHandler = () => {
        if (!locks.scrolling) {
          const scrollLeft = scrollableParent.scrollLeft;
          
          wavesurfer.setScroll(scrollLeft);
          updateMarkersForScroll(container, scrollLeft);
          syncScroll(index, scrollLeft);
        }
      };
      
      scrollableParent.addEventListener('scroll', scrollHandler, { passive: true });
      scrollListeners.push({ element: scrollableParent, handler: scrollHandler });
    }
    
    // Add touch event handling for waveform container
    let touchStartX = 0;
    let scrollStartX = 0;
    let isTouchDragging = false;
    
    const waveformContainer = container.closest('.waveform-container') as HTMLElement;
    if (waveformContainer) {
      waveformContainer.addEventListener('touchstart', (e: TouchEvent) => {
        if (e.touches.length === 1) {
          touchStartX = e.touches[0].clientX;
          scrollStartX = waveformContainer.scrollLeft;
          isTouchDragging = false;
        }
      }, { passive: true });
      
      waveformContainer.addEventListener('touchmove', (e: TouchEvent) => {
        if (e.touches.length === 1) {
          isTouchDragging = true;
          const touchCurrentX = e.touches[0].clientX;
          const diff = touchStartX - touchCurrentX;
          
          if (Math.abs(diff) > 5) {
            if (scrollableParent) {
              const newScrollLeft = scrollStartX + diff;
              scrollableParent.scrollLeft = newScrollLeft;
            }
          }
        }
      }, { passive: true });
      
      waveformContainer.addEventListener('touchend', (e: TouchEvent) => {
        if (isTouchDragging) {
          e.preventDefault();
        }
        isTouchDragging = false;
      }, { passive: false });
    }
  }
  
  function setupEventHandlers(wavesurfer: WaveSurfer, index: number) {
    const handleTimeUpdate = () => {
      if (locks.seeking || activeTrackIndex !== index) return;
      
      const newPosition = wavesurfer.getCurrentTime();
      if (Math.abs(newPosition - trackStates[index].position) > 0.1) {
        trackStates[index].position = newPosition;
        trackStates = [...trackStates];
        
        // Check if we need to stop at marker end and rewind
        if (activeMarker && activeMarker.trackIndex === index && newPosition >= activeMarker.end) {
          wavesurfer.pause();
          trackStates[index].isPlaying = false;
          activeTrackIndex = -1;
          // Rewind to marker start
          
          wavesurfer.setTime(activeMarker!.start);
          trackStates[index].position = activeMarker!.start;
          savePosition(activeMarker!.start, index);
          syncTracks(activeMarker!.start, index, false);
        
          trackStates = [...trackStates];
          return;
        }

        // Sync other tracks during playback
        if (trackStates[index].isPlaying) {
          syncTracks(newPosition, index, false);
        }

        if (Math.floor(newPosition) > Math.floor(trackStates[index].position)) {
          savePosition(newPosition, index);
        }

        // Sync scroll position during time updates
        const scrollLeft = wavesurfer.getScroll();
        syncScroll(index, scrollLeft, true);
      }
    };

    

    const handleClick = (relativeX: number) => {
      if (locks.seeking) return;
      locks.seeking = true;
      
      try {
        const newTime = relativeX * wavesurfer.getDuration();
        trackStates[index].position = newTime;
        savePosition(newTime, index);
        
        // Clear active marker when seeking
        activeMarker = null;
        
        wavesurfer.setTime(newTime);
        syncTracks(newTime, index, false);
        
        if (activeTrackIndex === index && trackStates[index].isPlaying) {
          setTimeout(() => wavesurfer.play(), 50);
        }
      } finally {
        setTimeout(() => locks.seeking = false, 100);
      }
    };

    const handleFinish = () => {
      if (activeTrackIndex === index) {
        wavesurfer.setTime(0);
        trackStates[index].position = 0;
        savePosition(0, index);
        trackStates[index].isPlaying = false;
        activeTrackIndex = -1;
        trackStates = [...trackStates];
      }
    };

    wavesurfer.on('scroll', () => {
      if (!locks.scrolling) {
        const scroll = wavesurfer.getScroll();
        syncScroll(index, scroll, true);
      }
    });

    wavesurfer.on('timeupdate', handleTimeUpdate);
    wavesurfer.on('click', handleClick);
    wavesurfer.on('finish', handleFinish);

    wavesurfer.on('ready', () => {
      const duration = wavesurfer.getDuration();
      
      if (duration > 0) {
        trackDurations[index] = tracks[index]?.duration && 
          Math.abs(tracks[index].duration - duration) > 1 ? 
          tracks[index].duration : duration;
      }
      
      const savedPosition = loadPosition(index);
      if (savedPosition > 0) {
        wavesurfer.setTime(savedPosition);
        if (index === 0 || index === activeTrackIndex) {
          trackStates[index].position = savedPosition;
        }
      }

      if (!markersAdded[index] && originalMarkerData[index]?.length > 0) {
        addMarkers(wavesurfer, index);
      }

      wavesurfer.on('finish', handleFinish);
    });
  }

  function stopTrack(index: number) {
    const wavesurfer = wavesurfers[index >= 0 ? index : 0];
    if (!wavesurfer) return;
    
    wavesurfer.stop();
    trackStates[index].position = 0;
    trackStates[index].isPlaying = false;
    if (activeTrackIndex === index) activeTrackIndex = -1;
    trackStates = [...trackStates];
  }

  function addNewMarkerStart(index: number) {
    const wavesurfer = wavesurfers[index];
    if (!wavesurfer) return;
    
    const time = wavesurfer.getCurrentTime();
    tempMarkerStart = { trackIndex: index, time };
  }

  function addNewMarkerEnd(index: number) {
    const wavesurfer = wavesurfers[index];
    if (!wavesurfer || !tempMarkerStart || tempMarkerStart.trackIndex !== index) return;
    
    const endTime = wavesurfer.getCurrentTime();
    if (endTime <= tempMarkerStart.time) return;
    
    markerCounter++;
    const newMarker = {
      start: tempMarkerStart.time,
      end: endTime,
      label: `Marker ${markerCounter}`
    };
    
    if (!originalMarkerData[index]) {
      originalMarkerData[index] = [];
    }
    originalMarkerData[index].push(newMarker);
    redrawMarkers(wavesurfer, index);
    tempMarkerStart = null;
  }

  function findMarkerByLabel(index: number, label: string) {
    return originalMarkerData[index]?.find(marker => marker.label === label);
  }

  function playSegment(index: number, label: string) {
    const marker = findMarkerByLabel(index, label);
    if (!marker) return;

    const wavesurfer = wavesurfers[index];
    if (!wavesurfer) return;

    // Set as active marker
    activeMarker = {
      trackIndex: index,
      start: marker.start,
      end: marker.end
    };

    // Set time to marker start
    wavesurfer.setTime(marker.start);
    trackStates[index].position = marker.start;
    savePosition(marker.start, index);
    
    // Sync other tracks
    syncTracks(marker.start, index, false);
    
    // Start playback
    wavesurfer.play();
    trackStates[index].isPlaying = true;
    activeTrackIndex = index;
    trackStates = [...trackStates];
  }

  onMount(() => {
    tracks.forEach((track, index) => {
      const container = document.getElementById(getContainerId(index));
      if (!container) {
        return;
      }
      container.innerHTML = '';
      wavesurfers[index] = initializeWaveSurfer(container, track, index);
    });
  });

  onDestroy(() => {
    wavesurfers.forEach(ws => ws?.destroy());
    scrollListeners.forEach(({ element, handler }) => {
      element.removeEventListener('scroll', handler);
    });
  });
</script>

<div class="audio-player">
  <div class="header-bar">
    <h2>{title}</h2>
    <div class="zoom-controls">
      <button on:click={zoomOut} class="zoom-button" title="Zoom Out">
        -
      </button>
      <button on:click={resetZoom} class="zoom-button" title="Reset Zoom">
        Reset
      </button>
      <button on:click={zoomIn} class="zoom-button" title="Zoom In">
        +
      </button>
    </div>
  </div>
  
  <div class="tracks-container">
    {#each tracks as track, i}
      <div class="track">
        <div class="track-info">
          <div class="track-header">
            <span class="track-name">{getTrackName(i)}</span>
            <div class="track-controls">
              <button 
                on:click={() => rewindTrack(i)} 
                class="track-control-button" 
                title="Rewind Track"
              >
                Rewind
              </button>
              <button 
                on:click={() => playTrack(i)} 
                class="track-control-button" 
                title="Play/Pause Track"
              >
                {trackStates[i].isPlaying ? 'Pause' : 'Play'}
              </button>
              <button 
                on:click={() => addNewMarkerStart(i)} 
                class="track-control-button" 
                title="Start Marker"
              >
                [
              </button>
              <button 
                on:click={() => addNewMarkerEnd(i)} 
                class="track-control-button" 
                title="End Marker"
              >
                ]
              </button>
            </div>
          </div>
        </div>
        
        <div class="waveform-container">
          <div id="{getContainerId(i)}" class="waveform"></div>
        </div>
        
        {#if originalSegmentData[i]?.length > 0}
          <div class="segments-table">
            <table>
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Phi4</th>
                  <th>Whisper3</th>
                  <th>Nemo</th>
                </tr>
              </thead>
              <tbody>
                {#each originalSegmentData[i] as segment}
                  <tr>
                    <td>
                      <span 
                        class="segment-label" 
                        class:active={activeMarker && findMarkerByLabel(i, segment.label)?.start === activeMarker.start}
                        on:click={() => playSegment(i, segment.label)}
                        on:keydown={(e) => e.key === 'Enter' && playSegment(i, segment.label)}
                        tabindex="0"
                        role="button"
                        aria-label={`Play segment: ${segment.label}`}
                      >
                        {segment.label}
                      </span>
                    </td>
                    <td>{@html segment.phi4_text}</td>
                    <td>{@html segment.whisper3_text}</td>
                    <td>{@html segment.nemo_text}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .audio-player {
    background: #ffffff;
    padding: 10px;
    margin: 10px 0;
  }

  .header-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  h2 {
    margin: 0;
    color: #333;
    font-size: 1.2em;
    text-align: left;
  }
  
  .zoom-controls {
    display: flex;
    gap: 10px;
  }

  .zoom-button {
    padding: 5px 15px;
    background: #f5f5f5;
    border: 1px solid #ccc;
    border-radius: 2px;
    font-size: 14px;
    cursor: pointer;
    min-width: 40px;
    text-align: center;
  }

  .zoom-button:hover {
    background: #e5e5e5;
  }

  .tracks-container {
    display: flex;
    flex-direction: column;
    gap: 0;
    width: 100%;
  }

  .track {
    background: transparent;
    padding: 5px;
    display: flex;
    flex-direction: column;
    gap: 0;
    width: 100%;
    border: none;
  }

  .track-info {
    display: flex;
    margin-bottom: 5px;
    padding: 5px;
    background: #f5f5f5;
    border-radius: 4px;
  }

  .track-header {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .track-name {
    font-weight: normal;
    color: #4a9eff;
    font-size: 0.9em;
    text-align: left;
    width: 100%;
  }

  .track-controls {
    display: flex;
    gap: 5px;
    align-items: center;
  }

  .track-control-button {
    padding: 3px 10px;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 3px;
    font-size: 12px;
    cursor: pointer;
    color: #666;
    transition: all 0.2s ease;
  }

  .track-control-button:hover {
    background: #4a9eff;
    color: #fff;
    border-color: #4a9eff;
  }

  .waveform-container {
    position: relative;
    cursor: pointer;
    border: none;
    min-height: 120px;
    width: 100%;
    background: #fff;
    overflow: hidden;
  }

  .waveform {
    width: 100%;
    height: 100%;
    position: relative;
    background-image: 
      linear-gradient(to right, rgba(200, 200, 200, 0.15) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(200, 200, 200, 0.15) 1px, transparent 1px),
      linear-gradient(to right, rgba(200, 200, 200, 0.1) 0.5px, transparent 0.5px),
      linear-gradient(to bottom, rgba(200, 200, 200, 0.1) 0.5px, transparent 0.5px);
    background-size: 50px 50px, 50px 50px, 10px 10px, 10px 10px;
    background-color: #fafafa;
  }
  
  :global(.wavesurfer-wrapper) {
    background: transparent;
  }
  
  :global(.markers-container) {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 5;
    pointer-events: none;
    transform: translateX(0);
    will-change: transform;
    backface-visibility: hidden;
    transform-style: preserve-3d;
  }
  
  :global(.waveform-marker) {
    opacity: 1;
    position: absolute;
    height: 100%;
    box-sizing: border-box;
    border: none !important;
    background-color: var(--marker-bg-color, rgba(200, 180, 150, 0.3));
  }
  
  :global(.marker-label) {
    opacity: 1;
    z-index: 10;
    padding: 2px 6px;
    font-size: 0.8em;
    background: transparent;
    color: #666;
    box-shadow: none;
    top: 5px;
    left: 5px;
    font-family: monospace;
  }

  .segments-table {
    margin-top: 20px;
    width: 100%;
    overflow-x: auto;
  }
  
  .segments-table table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  
  .segments-table th:first-child,
  .segments-table td:first-child {
    width: 80px;
    min-width: 80px;
    max-width: 80px;
  }
  
  .segments-table th:not(:first-child),
  .segments-table td:not(:first-child) {
    width: 33.3%;
  }
  
  .segments-table th,
  .segments-table td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid #eee;
    font-size: 14px;
    word-break: break-word;
  }
  
  .segments-table th {
    background: #f5f5f5;
    font-weight: 600;
    color: #333;
  }
  
  .segments-table td {
    color: #666;
  }
  
  .segments-table tr:hover {
    background: #f9f9f9;
  }
  
  .segments-table tr:last-child td {
    border-bottom: none;
  }

  .segment-label {
    cursor: pointer;
    color: #4a9eff;
    transition: color 0.2s ease;
  }

  .segment-label:hover {
    color: #2980b9;
    text-decoration: underline;
  }

  .segment-label.active {
    font-weight: bold;
    color: #2980b9;
  }
</style>  