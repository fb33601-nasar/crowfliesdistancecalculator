// The visible FAQ and the FAQPage schema are both built from this list, so they always match.
export const homeFaqs: { q: string; a: string }[] = [
  {
    q: 'Is as the crow flies the same as straight line distance?',
    a: 'Yes. Both mean the shortest distance between two points with roads, rivers and borders ignored. On the curved Earth that shortest path is an arc called a great circle or geodesic, which is why it can look bent on a flat map.',
  },
  {
    q: 'How accurate is the as the crow flies distance calculator?',
    a: 'The maths is accurate to a fraction of an inch because it uses Vincenty’s formulae on the WGS 84 ellipsoid. In practice the result is only as exact as the two points: a city name is measured from the city center, so type a street address or coordinates when a few miles matter.',
  },
  {
    q: 'Can I measure the distance from my current location?',
    a: 'Yes. Click the From box and choose Use my location, then allow the browser to share it. The location stays on your device and is used only to place point A.',
  },
  {
    q: 'Can I enter GPS coordinates instead of a place name?',
    a: 'Yes. Type latitude then longitude in decimal degrees, such as 40.7128, -74.0060, in either box. You can also use compass letters, such as 51.5074 N 0.1278 W.',
  },
  {
    q: 'Is flight distance the same as the distance as the crow flies?',
    a: 'Not quite. The straight line is the shortest a flight could be, but aircraft follow air routes, avoid weather and restricted airspace, and circle before landing, so the distance flown is usually somewhat longer.',
  },
  {
    q: 'What is the longest possible distance as the crow flies?',
    a: 'About 12,430 miles (20,004 km), which is halfway around the world. Two places cannot be farther apart than that, because beyond halfway it becomes shorter to go the other way.',
  },
  {
    q: 'Why does the straight line look curved on the street map?',
    a: 'Flat maps stretch the Earth more the farther you get from the equator, so the true shortest path is drawn as a curve that bows toward the nearest pole. Switch to the Globe view to see the same path as a direct run over the surface.',
  },
  {
    q: 'Does the calculator work for short distances?',
    a: 'Yes. For two points less than about a mile apart it also shows the result in meters and feet. Use the street map and drag the pins to place each end exactly.',
  },
  {
    q: 'Is the calculator free, and does it keep my searches?',
    a: 'It is free and needs no account. The distance is worked out in your browser, and the only thing sent out is the text you type into a place box, which goes to the place search service to find matches.',
  },
];
