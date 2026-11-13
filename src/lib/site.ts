export const SITE = {
  name: 'Crow Flies Distance Calculator',
  shortName: 'Crow Flies',
  tagline: 'Straight line distance between any two places',
  url: 'https://crowfliesdistancecalculator.com',
  locale: 'en_US',
  lang: 'en',
  themeColor: '#161b3d',
} as const;

export const abs = (path: string) => new URL(path, SITE.url).toString();
