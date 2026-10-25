"""Starlette parsing with complete-body rejection and owned file cleanup."""

from starlette.datastructures import FormData
from starlette.formparsers import MultiPartException, MultiPartParser


class CompleteMultipartParser(MultiPartParser):
    _complete = False

    def on_end(self) -> None:
        self._complete = True

    async def parse(self) -> FormData:
        try:
            form = await super().parse()
            if not self._complete:
                raise MultiPartException("Incomplete multipart upload")
            return form
        except BaseException:
            for file in self._files_to_close_on_error:
                file.close()
            raise
