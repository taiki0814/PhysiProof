// Test script for OSRM Match API responses
// Run with: node scripts/test_osrm_match.js

const samples = [
  {
    name: 'simple-rectangle-loop',
    route: [
      [35.7120, 139.7610],
      [35.7125, 139.7620],
      [35.7130, 139.7615],
      [35.7125, 139.7605],
      [35.7120, 139.7610]
    ]
  },
  {
    name: 'concave-shape',
    route: [
      [35.7122, 139.7607],
      [35.7128, 139.7611],
      [35.7132, 139.7616],
      [35.7129, 139.7620],
      [35.7124, 139.7618],
      [35.7120, 139.7612]
    ]
  },
  {
    name: 'along-road-simulated',
    route: [
      [35.7112,139.7600],
      [35.7116,139.7605],
      [35.7120,139.7609],
      [35.7125,139.7613],
      [35.7130,139.7618],
      [35.7135,139.7622]
    ]
  }
];

async function testSample(sample) {
  const coordsParam = sample.route.map(p => `${p[1]},${p[0]}`).join(';');
  const url = `https://router.project-osrm.org/match/v1/driving/${coordsParam}?overview=full&geometries=geojson`;
  console.log(`\n--- ${sample.name} ---`);
  console.log('Request URL:', url);
  try {
    const res = await fetch(url);
    console.log('HTTP status:', res.status);
    const data = await res.json();
    console.log('OSRM code:', data.code);
    if (data.matchings && data.matchings.length > 0) {
      console.log('matchings count:', data.matchings.length);
      data.matchings.forEach((m, idx) => {
        const coords = m.geometry && m.geometry.coordinates ? m.geometry.coordinates : [];
        console.log(` matching[${idx}] coords length:`, coords.length);
        console.log('  first coords sample:', coords.slice(0,3).map(c => `[${c[1].toFixed(6)}, ${c[0].toFixed(6)}]`).join(', '));
        const first = coords[0];
        const last = coords[coords.length-1];
        if (first && last) {
          const closed = Math.abs(first[0]-last[0]) < 1e-6 && Math.abs(first[1]-last[1]) < 1e-6;
          console.log('  closed (first==last):', closed);
        }
      });
      // If no matchings geometry, try tracepoints
    } else {
      console.log('No matchings returned. tracepoints:', (data.tracepoints || []).length);
    }
  } catch (e) {
    console.error('Fetch error:', e.message);
  }
}

(async () => {
  if (typeof fetch !== 'function') {
    console.error('Global fetch not available in this Node. Requires Node 18+.');
    process.exit(1);
  }
  for (const s of samples) {
    await testSample(s);
  }
})();
