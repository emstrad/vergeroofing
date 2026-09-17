// Every business fact the site states, in one place. A page that wants the
// phone number reads it from here rather than carrying its own copy, so there
// is one edit when it changes and no page quietly left on the old one.
export const site = {
  name: 'Verge Roofing',
  slogan: 'Higher standards.',
  domain: 'https://vergeroofing.com',
  email: 'team@vergeroofing.com',

  // Not yet issued. The build refuses to write a page while this is null, so a
  // placeholder number cannot ship and send customers to a stranger.
  phone: null,
  phoneDisplay: null,

  // The signal tying the website to the map listing, which is what wins "near
  // me" searches. Until it is set, the home page carries no sameAs at all
  // rather than a guess.
  googleBusinessProfile: null,

  schemaType: 'RoofingContractor',
  companiesHouse: null,

  // Nothing is claimed that the business does not hold. There are no trade
  // accreditations here on purpose: what is said instead is time served, which
  // is true and checkable.
  accreditations: [],
  experienceClaim: '30 years in the trade',

  // Written into copy in one place, because it is a promise and a promise that
  // appears in three wordings is three different promises.
  quoteTurnaround: '48 hours',
  visitIsFree: true,

  areas: {
    'Greater London': ['All postcode districts'],
    Kent: ['Bromley', 'Dartford', 'Sevenoaks', 'Tunbridge Wells', 'Maidstone', 'Medway', 'Gravesend'],
    Surrey: ['Croydon', 'Kingston', 'Sutton', 'Epsom', 'Guildford', 'Woking', 'Reigate'],
    Essex: ['Romford', 'Brentwood', 'Basildon', 'Chelmsford', 'Southend', 'Ilford', 'Grays'],
    Hertfordshire: ['Watford', 'St Albans', 'Hemel Hempstead', 'Borehamwood', 'Hatfield', 'Enfield'],
    'Sussex and Berkshire': ['Crawley', 'Horsham', 'Brighton', 'Slough', 'Windsor', 'Reading']
  }
}

// The money model, as agreed. Stored here as the default a new job takes; a job
// keeps the rates it was agreed at, so changing a figure here never rewrites
// what anyone earned last month.
export const money = {
  taxPercent: 20,
  leadFeePercent: 15,
  // Taken on the post-tax figure. On a 1,000 pound job that is 15% of 800,
  // which is 120 rather than 150.
  leadFeeTo: 'scott',
  partners: ['tom', 'steve', 'ben', 'scott']
}
