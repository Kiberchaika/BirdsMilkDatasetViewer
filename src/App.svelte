<script lang="ts">
  import { onMount } from 'svelte';
  import AudioPlayer from './lib/AudioPlayer.svelte';
  import type { Composition } from './lib/types';

  const apiPort = '7779';

  interface Track {
    url: string;
    markers: {
      start: number;
      end: number;
      label: string;
    }[];
    segments: {
      label: string;
      phi4_text: string;
      whisper3_text: string;
      nemo_text: string;
    }[];
  }

  let compositions: Composition[] = [];
  let pagination = {
    total: 0,
    currentPage: 1,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false
  };

  async function fetchCompositions(page: number = 1) {
    try {
      const apiHost = window.location.hostname === 'localhost' 
        ? `localhost:${apiPort}` 
        : `${window.location.hostname}:${apiPort}`;
      
      const apiUrl = `http://${apiHost}/api/compositions?page=${page}&limit=4`;
      console.log('[App] Fetching compositions from:', apiUrl);
      
      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const contentType = response.headers.get("content-type");
      console.log('[App] Content-Type:', contentType);
      
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error('[App] Non-JSON response received:', text);
        throw new TypeError(`Expected JSON response but got ${contentType || 'unknown content type'}`);
      }
      
      const data = await response.json();
      
      data.compositions = data.compositions.map((comp: Composition) => ({
        ...comp,
        tracks: comp.tracks.map((track: Track) => ({
          ...track,
          url: track.url.replace(/http:\/\/[^\/]+/, `http://${apiHost}`)
        }))
      }));
      
      compositions = data.compositions;
      pagination = data.pagination;
      console.log('[App] Loaded compositions:', compositions.length);
      compositions.forEach((comp, i) => {
        console.log(`[App] Composition ${i}: ${comp.title} with ${comp.tracks.length} tracks`);
        comp.tracks.forEach((track, j) => {
          console.log(`[App] Track ${j} URL: ${track.url}`);
        });
      });
    } catch (error) {
      console.error('[App] Error fetching compositions:', error);
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        console.error(`[App] Could not connect to the API server. Please ensure the backend server is running on ${apiPort}`);
      }
      compositions = [];
      pagination = {
        total: 0,
        currentPage: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false
      };
    }
  }

  function nextPage() {
    if (pagination.hasNextPage) {
      fetchCompositions(pagination.currentPage + 1);
    }
  }

  function prevPage() {
    if (pagination.hasPrevPage) {
      fetchCompositions(pagination.currentPage - 1);
    }
  }

  onMount(() => {
    fetchCompositions();
  });
</script>

<main>
  {#if compositions.length === 0}
    <p>Loading compositions...</p>
  {:else}
    <div class="compositions-container">
      {#each compositions as composition (composition.id)}
        <div class="composition-wrapper">
          <AudioPlayer
            title={composition.title}
            tracks={composition.tracks}
          />
        </div>
      {/each}
      
      <div class="pagination-controls">
        <button 
          on:click={prevPage} 
          disabled={!pagination.hasPrevPage}
          class="pagination-button"
        >
          Previous
        </button>
        <span class="pagination-info">
          Page {pagination.currentPage} of {pagination.totalPages}
        </span>
        <button 
          on:click={nextPage} 
          disabled={!pagination.hasNextPage}
          class="pagination-button"
        >
          Next
        </button>
      </div>
    </div>
  {/if}
</main>

<style>
  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
  }

  h1 {
    color: #333;
    text-align: left;
    margin-bottom: 40px;
  }

  p {
    text-align: left;
    color: #666;
  }

  .compositions-container {
    display: flex;
    flex-direction: column;
    gap: 40px;
  }

  .composition-wrapper {
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    padding: 20px;
    background: white;
  }

  .pagination-controls {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 20px;
    margin-top: 20px;
    padding: 20px 0;
  }

  .pagination-button {
    padding: 8px 16px;
    background: #4a9eff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.2s;
  }

  .pagination-button:hover:not(:disabled) {
    background: #2980b9;
  }

  .pagination-button:disabled {
    background: #cccccc;
    cursor: not-allowed;
  }

  .pagination-info {
    color: #666;
    font-size: 14px;
  }
</style>
