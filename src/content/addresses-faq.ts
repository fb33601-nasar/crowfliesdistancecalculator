export const addressFaqs: { q: string; a: string }[] = [
  {
    q: 'How do I find the distance between two addresses?',
    a: 'Type the first address in the From box and the second in the To box, picking each from the list of matches. The calculator shows the straight line distance straight away and the driving, walking and cycling distances a moment later, with a travel time for each.',
  },
  {
    q: 'What is the difference between driving distance and straight line distance?',
    a: 'Straight line distance is the shortest path over the Earth between the two points, ignoring roads. Driving distance is the length of the fastest road route. In our sample of 18 city pairs the road was a median 1.19 times the straight line.',
  },
  {
    q: 'Why is the driving distance longer than the walking distance?',
    a: 'In a city, one-way streets, turn bans and car-free areas send drivers around the block, while walkers can cut through parks, squares and footpaths. Over short trips that often makes the drive the longer route, even though it is much quicker.',
  },
  {
    q: 'How accurate is the travel time?',
    a: 'Travel times assume free-flowing traffic and no stops, so treat them as the best case. Rush hour, roadworks, parking and traffic lights can add a lot to a drive, especially in town.',
  },
  {
    q: 'Can I use the calculator to work out mileage for reimbursement?',
    a: 'Yes. The calculator shows the driving distance and its value at the IRS business rate of 76 cents a mile and the HMRC rate of 55p a mile. Check your employer’s policy, because the official rates are maximums and many employers set their own.',
  },
  {
    q: 'Can I enter a ZIP code or postcode instead of a full address?',
    a: 'Yes. A ZIP code or postcode usually works, but it is measured from a single point inside the postal area, so the result can be off by a few miles in a large rural ZIP code. Use the full street address when the exact figure matters.',
  },
  {
    q: 'Can I measure between GPS coordinates instead of addresses?',
    a: 'Yes. Type the latitude and longitude in decimal degrees, such as 40.7484, -73.9857, in either box. You can also click Pick point on the map and place the pin by hand.',
  },
  {
    q: 'Is there a limit on how far apart the addresses can be?',
    a: 'No for driving and straight line distance. Walking and cycling routes are only calculated when the two addresses are within about 155 miles (250 km) of each other, because longer trips on foot or by bike are rarely planned this way.',
  },
  {
    q: 'Are the addresses I enter stored?',
    a: 'No. The distance is calculated in your browser. The text you type goes to the address search service to find matches, and the coordinates go to the routing service to plan the routes, but this site keeps no record of them.',
  },
];
