const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs').promises;

const app = express();
const port = 7779;
const host = '0.0.0.0'; // Listen on all network interfaces

app.use(cors());
app.use(express.json());
app.use('/audio', express.static(path.join(__dirname, 'audio')));

// Add default route for root path
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`
     Server is running
  `);
});

async function readJsonFile(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    // Handle case where the file contains a direct array of markers
    if (Array.isArray(parsed)) {
      return { markers: parsed }; 
    }
    return parsed;
  } catch (error) {
    console.log(`Could not read marker file: ${filePath}. ${error.message}`);
    return { markers: [] }; // Return empty markers if file doesn't exist or is invalid
  }
}

async function scanAudioFolder() {
  const audioDir = path.join(__dirname, 'audio');
  const files = await fs.readdir(audioDir);
  
  console.log('Found files in audio directory:', files);
  
  const compositionMap = new Map();
  
  for (const file of files) {
    if (!file.endsWith('.opus')) continue;
    
    // Extract base title and track number
    const fileNameWithoutExt = file.replace('.opus', '');
    const trackMatch = fileNameWithoutExt.match(/_track(\d+)$/);
    
    const baseTitle = trackMatch 
      ? fileNameWithoutExt.replace(/_track\d+$/, '') 
      : fileNameWithoutExt;
    const trackNumber = trackMatch ? parseInt(trackMatch[1]) : 1;
    
    console.log(`Processing file: ${file} -> Base title: ${baseTitle}, Track number: ${trackNumber}`);
    
    // Initialize composition if it doesn't exist
    if (!compositionMap.has(baseTitle)) {
      compositionMap.set(baseTitle, {
        id: compositionMap.size + 1,
        title: baseTitle,
        tracks: []
      });
    }
    
    const composition = compositionMap.get(baseTitle);
    const trackPath = path.join(audioDir, file);
    const markerPath = trackPath.replace('.opus', '.json');
    
    // Check if marker file exists
    let markerFileExists = false;
    try {
      await fs.access(markerPath);
      markerFileExists = true;
      console.log(`Found marker file: ${markerPath}`);
    } catch (error) {
      console.log(`No marker file found for track: ${file}`);
    }
    
    // Read marker data
    const markerData = markerFileExists ? await readJsonFile(markerPath) : { markers: [] };
    
    // Ensure tracks array has enough slots and add track at the correct position
    while (composition.tracks.length < trackNumber) {
      composition.tracks.push(null);
    }
    
    // Use relative URL for audio files
    composition.tracks[trackNumber - 1] = {
      title: 'Audio',
      type: 'audio',
      url: `http://localhost:${port}/audio/${file}`,  // Use absolute URL with localhost
      markers: markerData.markers || []
    };
    
    console.log(`Added track ${trackNumber} to composition: ${baseTitle} with ${markerData.markers ? markerData.markers.length : 0} markers`);
  }
  
  // Clean up compositions and convert to array
  for (const [title, composition] of compositionMap) {
    composition.tracks = composition.tracks.filter(track => track !== null);
    if (composition.tracks.length === 0) {
      compositionMap.delete(title);
    }
  }
  
  const compositions = Array.from(compositionMap.values());
  
  // Log composition details
  console.log('\nComposition details:');
  compositions.forEach(comp => {
    console.log(`\nComposition: ${comp.title} (ID: ${comp.id})`);
    console.log(`Number of tracks: ${comp.tracks.length}`);
    comp.tracks.forEach((track, index) => {
      console.log(`  Track ${index + 1}: ${track.url}`);
      console.log(`    Markers: ${track.markers.length}`);
    });
  });
  
  return compositions;
}

let compositions = [];

// Initialize compositions on startup
scanAudioFolder().then(result => {
  compositions = result;
  console.log(`\nLoaded ${compositions.length} compositions successfully`);
  console.log('Server is ready');
}).catch(error => {
  console.error('Error scanning audio folder:', error);
});

app.get('/api/compositions', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 5;
  
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  
  const paginatedResults = {
    compositions: compositions.slice(startIndex, endIndex),
    pagination: {
      total: compositions.length,
      currentPage: page,
      totalPages: Math.ceil(compositions.length / limit),
      hasNextPage: endIndex < compositions.length,
      hasPrevPage: page > 1
    }
  };
  
  res.json(paginatedResults);
});

app.get('/api/compositions/:id', (req, res) => {
  const composition = compositions.find(c => c.id === parseInt(req.params.id));
  if (!composition) {
    return res.status(404).json({ error: 'Composition not found' });
  }
  res.json(composition);
});

// Endpoint to force rescan of audio folder
app.post('/api/rescan', async (req, res) => {
  try {
    compositions = await scanAudioFolder();
    res.json({ message: 'Audio folder rescanned successfully', count: compositions.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to rescan audio folder' });
  }
});

app.listen(port, host, () => {
  console.log(`Server running at http://${host}:${port}`);
  console.log('Available endpoints:');
  console.log(`  - Home page: http://${host}:${port}/`);
  console.log(`  - API: http://${host}:${port}/api/compositions`);
  console.log(`  - Audio files: http://${host}:${port}/audio`);
}); 