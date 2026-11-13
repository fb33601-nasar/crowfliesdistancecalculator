export const bearingFaqs: { q: string; a: string }[] = [
  {
    q: 'How do I calculate the bearing between two points?',
    a: 'Enter the start and destination as places or coordinates. The calculator gives the initial bearing in degrees clockwise from true north, plus the final bearing, back bearing, magnetic bearing and rhumb line bearing, and the same angle in other formats.',
  },
  {
    q: 'What is the difference between a bearing and an azimuth?',
    a: 'In everyday navigation they mean the same thing: an angle from 0° to 360° measured clockwise from north. Some fields use bearing for quadrant notation such as N 45° E and azimuth for the 0–360° form.',
  },
  {
    q: 'Why is the final bearing different from the initial bearing?',
    a: 'The shortest path over a round Earth is a great circle, and the compass direction along it changes as you travel. From New York to London you set off at about 51° and arrive heading about 108°.',
  },
  {
    q: 'How do I convert a true bearing to a magnetic bearing?',
    a: 'Subtract east declination or add west declination. The calculator works out the declination at your start point for today from the World Magnetic Model 2025 and shows the magnetic bearing for you.',
  },
  {
    q: 'What is a back bearing?',
    a: 'The bearing from the destination back to the start. Over short distances it is the forward bearing plus or minus 180°. Over long distances it differs, so the calculator gives the true back bearing along the great circle.',
  },
  {
    q: 'What is a rhumb line bearing?',
    a: 'The single compass heading that takes you from start to destination without turning. It is easier to steer but longer than the great circle: about 4% longer from New York to London.',
  },
  {
    q: 'Can I find a location from a bearing and distance?',
    a: 'Yes. Choose Point from a bearing, enter a start, a bearing such as 45 or N45E, and a distance. The calculator gives the latitude and longitude of the point you would reach and shows it on the map.',
  },
  {
    q: 'How do I read a quadrant bearing like S 60° E?',
    a: 'Face the first direction, south, then turn 60° toward the second, east. S 60° E is the same as a bearing of 120°.',
  },
];
