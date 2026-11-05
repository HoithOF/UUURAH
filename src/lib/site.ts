// Public-facing names used on the landing page and legal pages. Set these before launch.
export const site = {
  name: process.env.SITE_NAME ?? "UUURAH",
  legalName: process.env.COMPANY_LEGAL_NAME ?? "[Company legal name]",
  contactEmail: process.env.CONTACT_EMAIL ?? "privacy@example.com",
  address: process.env.COMPANY_ADDRESS ?? "[Company mailing address]",
  governingLaw: process.env.GOVERNING_LAW ?? "[State], United States",
  legalUpdated: "November 5, 2026",
};
