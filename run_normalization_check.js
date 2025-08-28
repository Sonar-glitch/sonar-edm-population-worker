// Simple normalization check for coordinates
const samples = [
  { coords: ['-73.980673','40.779925'] },
  { coords: [-73.980673,40.779925] },
  { coords: ['nan','40.77'] },
  { coords: null }
];

for (const s of samples) {
  const coords = s.coords;
  if (coords && Array.isArray(coords) && coords.length === 2) {
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    console.log('input',coords,'->',Number.isFinite(lon),lon,lat);
  } else {
    console.log('input',coords,'-> invalid');
  }
}

console.log('done');
