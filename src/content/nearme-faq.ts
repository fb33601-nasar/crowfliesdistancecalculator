export const nearMeFaqs: { q: string; a: string }[] = [
  {
    q: 'How do I see a mile radius from my current location?',
    a: 'Press Use my current location and allow your browser to share it. Then type a distance or press a preset such as 10, 25 or 50 miles. The circle appears on the map around you, with the towns inside it listed underneath.',
  },
  {
    q: 'What is 50 miles from me?',
    a: 'Set the radius to 50 miles after sharing your location. Under “Places about 50 mi away” the tool names the biggest town near the edge of the circle in each of eight directions, so you can see what lies about 50 miles north, east, south and west of you.',
  },
  {
    q: 'Is the radius measured by road or in a straight line?',
    a: 'In a straight line, as the crow flies. Driving distances are usually longer: in our sample of 18 city pairs the road route was a median 1.19 times the straight line.',
  },
  {
    q: 'Can I draw a radius by travel time, like 2 hours from me?',
    a: 'Yes. Switch to Travel time, pick the length of the trip and whether you are driving, cycling or walking. The tool draws an estimated circle from average speeds (3 mph on foot, 10 mph by bike, and 30 to 60 mph by car depending on trip length) and a route 19% longer than the straight line. Two hours by car comes out at about 84 miles.',
  },
  {
    q: 'Why is my location wrong?',
    a: 'Browsers locate you from GPS, Wi-Fi, phone masts or your internet address. A desktop on a wired connection often only has the internet address, which can be several kilometers off. Check the accuracy figure under the button, and drag the center dot to the right spot or type your address instead.',
  },
  {
    q: 'Is my location stored or shared?',
    a: 'No. The tool names your position from a town list that runs in your browser, so the coordinates are not sent to us or to a search service. They only go into a link if you press Copy link and share it.',
  },
  {
    q: 'How many square miles is a 25-mile radius?',
    a: 'A 25-mile radius covers about 1,963 square miles, or 5,085 square kilometers. A 10-mile radius covers about 314 square miles and a 50-mile radius about 7,854 square miles.',
  },
  {
    q: 'Can I use a radius from a ZIP code instead of my location?',
    a: 'Yes. Type the ZIP code, postcode or any address in the “Or start from a place” box. The circle is drawn from the point the place search holds for it, which is usually near the middle of the area.',
  },
  {
    q: 'Does it work on iPhone and Android?',
    a: 'Yes. On iPhone, Location Services must be on with Safari Websites allowed. On Android, the phone’s location must be on and the site allowed under Chrome’s site settings. Phones usually give the most exact fix because they can use GPS.',
  },
];
