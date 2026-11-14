export const pointsFaqs: { q: string; a: string }[] = [
  {
    q: 'How do I calculate the distance between two GPS coordinates?',
    a: 'Enter the latitude and longitude of both points in decimal degrees or degrees-minutes-seconds. The calculator gives the distance on the WGS 84 ellipsoid, the model GPS uses, and compares it with the haversine and other formulas.',
  },
  {
    q: 'What is the formula for the distance between two points?',
    a: 'On a flat graph it is d = √((x₂ − x₁)² + (y₂ − y₁)²). For latitude and longitude on the Earth, the haversine formula is common: a = sin²(Δφ/2) + cos φ1 · cos φ2 · sin²(Δλ/2), c = 2 · asin(√a), d = R · c with R = 6,371 km.',
  },
  {
    q: 'How accurate is the haversine formula?',
    a: 'Haversine treats the Earth as a sphere and is within about 0.5% of the more exact ellipsoid result anywhere. Between New York and London it gives 5,570 km against 5,585 km on the WGS 84 ellipsoid.',
  },
  {
    q: 'Can I enter coordinates in degrees, minutes and seconds?',
    a: 'Yes. The calculator reads decimal degrees, degrees and decimal minutes, and degrees-minutes-seconds such as 40°42′46″N 74°00′22″W, with or without N, S, E and W letters. It shows how it read each point so you can check.',
  },
  {
    q: 'How do I find the distance between two points on a graph?',
    a: 'Choose the x, y coordinates tab and enter both points. The calculator works through the distance formula step by step and gives the answer as a decimal and in simplest radical form, plus the midpoint and the slope.',
  },
  {
    q: 'Can I calculate distances for a whole list of coordinates?',
    a: 'Yes. On the Many pairs tab, paste up to 500 lines of lat1, lon1, lat2, lon2 and download the results as a CSV file. The calculation runs in your browser, so nothing is uploaded.',
  },
  {
    q: 'How do I calculate distance between coordinates in Excel?',
    a: 'With lat1, lon1, lat2, lon2 in columns A to D, use =2*6371*ASIN(SQRT(SIN(RADIANS(C2-A2)/2)^2+COS(RADIANS(A2))*COS(RADIANS(C2))*SIN(RADIANS(D2-B2)/2)^2)) for kilometers. Use 3958.8 instead of 6371 for miles.',
  },
  {
    q: 'How far is one degree of latitude or longitude?',
    a: 'One degree of latitude is about 111 km (69 miles) everywhere. One degree of longitude is about 111 km at the equator, 85 km at 40° latitude and only 56 km at 60°, because lines of longitude meet at the poles.',
  },
];
