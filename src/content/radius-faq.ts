export const radiusFaqs: { q: string; a: string }[] = [
  {
    q: 'How do I draw a radius on a map?',
    a: 'Type an address, city, ZIP code or coordinates in the Center box, enter the radius and pick a unit. The tool draws the circle on a street map straight away. Drag the center dot to move it, or drag the white handle on the edge to resize it.',
  },
  {
    q: 'Is the radius measured as the crow flies or by road?',
    a: 'As the crow flies. Every point on the edge is the same straight line distance from the center over the Earth’s surface. Roads are usually longer: in our sample of 18 city pairs the road route was a median 1.19 times the straight line.',
  },
  {
    q: 'How many square miles is a 10-mile radius?',
    a: 'A 10-mile radius covers about 314 square miles, or 814 square kilometers. A 25-mile radius covers about 1,963 square miles, a 50-mile radius about 7,854 square miles and a 100-mile radius about 31,414 square miles.',
  },
  {
    q: 'Can I draw more than one circle on the map?',
    a: 'Yes. Press Add a circle and click the map where it should go. You can draw up to five circles, each with its own center, radius and color, and the shared link keeps all of them.',
  },
  {
    q: 'How do I check if an address is within a certain radius?',
    a: 'Draw the circle, then type the address in the “Is this place inside the circle?” box. The tool says whether it is inside or outside, how far it is from the center and how far it sits from the edge.',
  },
  {
    q: 'Can I draw a radius around a ZIP code?',
    a: 'Yes. Type the ZIP code or postcode in the Center box. The circle starts from the point the geocoder holds for that code, usually near its middle, so for an exact rule it is better to center it on the full address.',
  },
  {
    q: 'Does Google Maps have a radius tool?',
    a: 'No. Google Maps can measure a straight line between points with Measure distance, but it cannot draw a circle. You can draw the circle here and copy the link, download the map as an image or print it.',
  },
  {
    q: 'Why does my circle look like an oval?',
    a: 'Online street maps use the Web Mercator projection, which stretches distances away from the equator by about 1 ÷ cos(latitude). A large circle far north or south is stretched more at its far edge than its near edge, so it looks taller than it is wide. Switch to Globe view to see its true shape.',
  },
  {
    q: 'How do I print a radius map?',
    a: 'Frame the map the way you want it, then press Print. The page is cut down to the map and the figures. Choose Save as PDF in the print dialog to keep a file, or press Download image for a PNG.',
  },
  {
    q: 'What is a 150 air-mile radius?',
    a: 'An air mile is a nautical mile, 1.852 km or about 1.15 ordinary miles. A 150 air-mile radius reaches about 173 statute miles from the center. It is the distance used in the US short-haul exception for truck drivers’ hours of service.',
  },
];
