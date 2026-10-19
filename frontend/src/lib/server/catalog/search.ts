import { application } from '#lib/server/composition.ts';
export const { searchCatalogRequest, searchCatalog, getPrintings, getCatalogPrinting } =
	application.catalog;
