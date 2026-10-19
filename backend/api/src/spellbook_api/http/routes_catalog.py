"""Public bounded singleton Printing lookup."""

from spellbook_core.catalog import Catalog
from spellbook_core.errors import CatalogPrintingNotFoundError
from starlette.requests import Request
from starlette.responses import Response

from spellbook_api.http.errors import HttpError, json_response
from spellbook_api.http.parsing import decode_parameter, require_uuid


async def get_printing(request: Request, printing_id: str, catalog: Catalog) -> Response:
    """printing_id is the raw named segment from the shared registry."""
    try:
        printing = await catalog.get_catalog_printing(
            require_uuid(decode_parameter(printing_id), "printingId")
        )
    except CatalogPrintingNotFoundError as cause:
        raise HttpError(404, str(cause)) from None
    return json_response(printing, headers={"Cache-Control": "no-store"})
