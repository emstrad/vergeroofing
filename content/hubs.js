// A hub exists so the nav and the breadcrumbs point at a real page rather than
// an anchor on the home page. An anchor tells a crawler that the detail pages
// hang off nothing; a hub gives them a parent, and it has to be worth reading
// in its own right.
export const hubs = {
  services: {
    href: '/services',
    title: 'What we do',
    description: 'Re-roofs, repairs, flat roofing, leadwork, guttering, storm damage, maintenance and commercial work across London and the South East.',
    h1: 'What we do',
    intro: 'Every job here is priced after somebody has been out and looked at it. These pages set out how we approach each kind of work, what usually turns out to be the cause, and what moves the price.',
    sections: [
      {
        h2: 'Repairs and replacement are different decisions',
        paragraphs: [
          'Most of what we are called to is a repair: one failed detail, in one place, on a roof with years left in it. A smaller share is a roof that has genuinely reached the end, where every patch is a deposit on the same problem. The two want different conversations, and the mistake that costs people most is having the second conversation about the first situation.',
          'Where both are viable we price both, so the decision is yours with the numbers in front of you.'
        ]
      },
      {
        h2: 'What every job includes',
        paragraphs: [
          'Photographs of the defect, sent with the quote, before anything is touched, so you are buying a repair you can see rather than one you are told about. Materials named in the quote rather than described as like for like. Scaffolding and waste inside the quoted figure. Completion photographs and a written workmanship guarantee at handover.',
          'The quoted figure is fixed. The only variation is something neither of us could see until the roof was open, and that is shown to you, discussed and agreed before any extra work happens rather than appearing on the invoice.'
        ]
      },
      {
        h2: 'Residential, commercial and managed property',
        paragraphs: [
          'About half of what we do is domestic: a leak somebody cannot trace, a roof at the end of its life, a flat roof over an extension that has stopped working. The rest is commercial units, managed blocks, schools and let portfolios, where a failure costs occupancy as well as repair and the work has to be programmed around the people using the building.',
          'For agents and trustees the useful document is usually not a quote at all but a costed condition report: defects ranked by urgency with figures against each, in a form that can go into a service charge forecast or a board paper.'
        ]
      },
      {
        h2: 'What happens after you send the form',
        paragraphs: [
          'We reply the same day, and sooner if water is actively coming in. We come out and look properly, at no charge, including the loft side of the deck where there is access. Within 48 hours you get photographs of what we found and one fixed written price. Nobody chases you afterwards.'
        ]
      }
    ]
  },

  guides: {
    href: '/guides',
    title: 'Guides',
    description: 'Straight answers to the questions people ask before they are ready to book: what drives the cost, repair or replace, and how to read a quote.',
    h1: 'Guides',
    intro: 'Written to be useful before you have decided anything, including whether to use us. Several of these pages will tell you that you do not need the work yet.',
    sections: [
      {
        h2: 'Why there is no price list',
        paragraphs: [
          'Every roof is priced after somebody has looked at it, so a published tariff would be a number that does not survive contact with your house. Publishing one anyway is how a trade ends up with figures that are quietly abandoned at the first site visit, which costs more trust than having no figure at all.',
          'What we can publish is the basis: what moves the figure up and down, what should always be included, what should never be added afterwards, and what a fair quote states. A reader holding two quotes and wondering why they are thousands apart will find the answer in these pages more often than in either quote.'
        ]
      },
      {
        h2: 'The pages that will cost us a sale',
        paragraphs: [
          'Some of what follows argues against work. The guide on repairing versus replacing exists to stop people buying a roof they did not need for another decade, and the one on what to look for spends as much time on things that are harmless as on things that are not.',
          'That is deliberate. A page that tells somebody their roof has five years left is the page that gets the call when it does not, and we would rather be the firm that said so.'
        ]
      },
      {
        h2: 'Send photographs with your enquiry',
        paragraphs: [
          'If you are trying to work out what you are dealing with, a photograph is worth more than a paragraph. A picture of the roof, the stain, or the previous quote often means we can give you a price over the phone, and it always makes us quicker when we do come out.'
        ]
      }
    ]
  },

  areas: {
    href: '/roofing-in',
    title: 'Areas we cover',
    description: 'Roofing across London, Kent, Surrey, Essex, Hertfordshire, Sussex and Berkshire, and what the building stock does in each.',
    h1: 'Areas we cover',
    intro: 'These pages exist because the building decides the problem. A Victorian butterfly roof in Hackney and a postwar interlocking tile in Basildon fail in different ways, and a quote that does not know which one it is looking at is a guess.',
    sections: [
      {
        h2: 'Why the building matters more than the town',
        paragraphs: [
          'A page that differs only by swapping a town name is worth nothing to a reader and is treated as a doorway page by search engines, so we have not written any. These pages exist where the housing stock genuinely changes what goes wrong.',
          'The inner terraces have butterfly roofs draining through a single parapet gutter, and Welsh slate whose nails fail long before the slate does. The interwar suburbs have steep gables, hips, bay roofs and tall redundant chimney stacks. The postwar estates have interlocking concrete tile reaching the end of its life all at once, and large rear extensions where the leak is usually the abutment rather than the flat roof everyone blames. Exposed estuary and coastal positions change the fixing specification outright.'
        ]
      },
      {
        h2: 'Where we work',
        paragraphs: [
          'Greater London across all postcode districts, north and west Kent, north Surrey, south Essex, south Hertfordshire, and selected parts of Sussex and Berkshire. Teams work across the region, so a quote is usually days away rather than weeks.'
        ]
      },
      {
        h2: 'If your postcode is not listed',
        paragraphs: [
          'Send it anyway. We will confirm cover the same day rather than leaving you wondering, and if we are genuinely not the right people for your postcode we will say so straight away instead of quoting a job we cannot service properly.'
        ]
      }
    ]
  }
}
