export interface PageConfig {
  url: string;
  category: string;
  selectors: string[];
  exclude: string[];
}

export const PAGES: PageConfig[] = [
  {
    url: 'https://rupeezy.in/authorized-person',
    category: 'ap_program',
    selectors: ['main', 'section', 'h2', 'h3', 'p', 'li', '.faq'],
    exclude: ['footer', 'nav', '.legal-disclaimer', 'header'],
  },
  {
    url: 'https://rupeezy.in/pricing',
    category: 'brokerage_charges',
    selectors: ['table', 'h2', 'h3', 'p', '.pricing-card'],
    exclude: ['footer', 'nav', 'header'],
  },
  {
    url: 'https://rupeezy.in/about-us',
    category: 'trust_signals',
    selectors: ['main', 'section', 'h1', 'h2', 'p', 'li'],
    exclude: ['footer', 'nav', 'header'],
  },
  {
    url: 'https://rupeezy.in/mutual-fund-distributor',
    category: 'mfd_program',
    selectors: ['main', 'section', 'h2', 'h3', 'p', 'li', 'table'],
    exclude: ['footer', 'nav', 'header'],
  },
  {
    url: 'https://support.rupeezy.in/support/solutions/articles/2100044891-how-do-i-open-an-account-with-rupeezy-',
    category: 'faq',
    selectors: ['main', 'section', 'h2', 'h3', 'p', 'li', 'table'],
    exclude: ['footer', 'nav', 'header'],
  },
  {
    url: 'https://support.rupeezy.in/support/solutions/articles/2100044892-how-long-does-it-take-to-open-an-account-with-rupeezy-',
    category: 'faq',
    selectors: ['main', 'section', 'h2', 'h3', 'p', 'li', 'table'],
    exclude: ['footer', 'nav', 'header'],
  },
  {
    url: 'https://support.rupeezy.in/support/solutions/articles/2100044893-what-all-documents-are-required-for-paperless-account-opening-with-rupeezy-',
    category: 'faq',
    selectors: ['main', 'section', 'h2', 'h3', 'p', 'li', 'table'],
    exclude: ['footer', 'nav', 'header'],
  },
  {
    url: 'https://support.rupeezy.in/support/solutions/articles/2100044895-can-an-nri-nro-resident-open-an-account-',
    category: 'faq',
    selectors: ['main', 'section', 'h2', 'h3', 'p', 'li', 'table'],
    exclude: ['footer', 'nav', 'header'],
  },
  {
    url: 'https://support.rupeezy.in/support/solutions/articles/2100044896-how-do-i-know-if-my-trading-account-is-opened-with-rupeezy-',
    category: 'faq',
    selectors: ['main', 'section', 'h2', 'h3', 'p', 'li', 'table'],
    exclude: ['footer', 'nav', 'header'],
  },
  {
    url: 'https://support.rupeezy.in/support/solutions/articles/2100044899-how-to-check-account-opening-status-',
    category: 'faq',
    selectors: ['main', 'section', 'h2', 'h3', 'p', 'li', 'table'],
    exclude: ['footer', 'nav', 'header'],
  },
  {
    url: 'https://support.rupeezy.in/support/solutions/articles/2100044888-can-i-call-and-trade',
    category: 'faq',
    selectors: ['main', 'section', 'h2', 'h3', 'p', 'li', 'table'],
    exclude: ['footer', 'nav', 'header'],
  },
  {
    url: 'https://support.rupeezy.in/support/solutions/articles/2100044888-can-i-call-and-trade',
    category: 'faq',
    selectors: ['main', 'section', 'h2', 'h3', 'p', 'li', 'table'],
    exclude: ['footer', 'nav', 'header'],
  }
];
