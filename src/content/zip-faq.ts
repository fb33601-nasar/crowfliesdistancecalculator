export const zipFaqs: { q: string; a: string }[] = [
  {
    q: 'How do I find all ZIP codes within a radius?',
    a: 'Enter a center ZIP code or address and a radius in miles or kilometers. The tool lists every US ZIP code whose center point is inside the radius, nearest first, and lets you copy the list or download it as a CSV.',
  },
  {
    q: 'How many ZIP codes are within 25 miles?',
    a: 'It varies hugely. Around downtown ZIPs in big cities a 25-mile radius can hold several hundred ZIP codes, while in rural areas it may hold fewer than ten. The table on this page shows counts for ten US cities.',
  },
  {
    q: 'Is the radius measured by road?',
    a: 'No. The distance is a straight line between the center and each ZIP code’s center point. Driving distances are usually longer.',
  },
  {
    q: 'Can I export the ZIP codes to a spreadsheet?',
    a: 'Yes. Download CSV saves every ZIP code in the radius with its place, state, county, distance, direction and coordinates. Copy ZIP list gives a comma-separated list for pasting into forms and ad tools.',
  },
  {
    q: 'Can I search around an address instead of a ZIP code?',
    a: 'Yes. Type a street address, city or landmark in Or center on an address, and the radius is drawn from that exact point.',
  },
  {
    q: 'How do I check whether one ZIP code is inside the radius?',
    a: 'Type it in the Is this ZIP inside the radius box. The tool shows whether it is inside or outside and how far its center is from yours.',
  },
  {
    q: 'Where does the ZIP code data come from?',
    a: 'From the GeoNames postal code database, which lists about 41,000 US ZIP codes with a center point for each. It is published under a Creative Commons Attribution 4.0 license.',
  },
];
