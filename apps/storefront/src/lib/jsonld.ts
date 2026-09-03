/** Serialises JSON-LD safely for a <script type="application/ld+json"> tag. */
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
