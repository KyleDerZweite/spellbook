"""Direct ASGI SSE delivery, with one retained pull and awaited downstream sends."""

import asyncio
import json
from collections.abc import Callable

from spellbook_core.models import Actor
from spellbook_core.saved_state import Cancellation, SavedState, SavedStateEvent, Subscription
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import Receive, Scope, Send

SAVED_STATE_HEARTBEAT_SECONDS = 15.0
SAVED_STATE_SEND_SECONDS = 30.0


class SavedStateResponse(Response):
    """Own setup, disconnect, pull and body tasks, including before ASGI starts.

    The registry must await close() when discarding this response for HEAD.
    Pre-drain close_streams() also closes responses never invoked by ASGI.
    """

    def __init__(self, request: Request, on_close: Callable[[], None]) -> None:
        super().__init__(
            headers={
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-store",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            }
        )
        self.raw_headers = [
            (key, value) for key, value in self.raw_headers if key != b"content-length"
        ]
        self._request = request
        self._on_close = on_close
        self._cancellation = Cancellation()
        self._subscription: Subscription | None = None
        self._setup: asyncio.Task[Subscription] | None = None
        self._pull: asyncio.Task[SavedStateEvent | None] | None = None
        self._body: asyncio.Task[None] | None = None
        self._disconnect: asyncio.Task[None] | None = None
        self._closed = False
        self._notified = False
        self._called = False

    async def open(self, saved_state: SavedState, actor: Actor) -> None:
        self._disconnect = asyncio.create_task(self._watch(), name="saved-state-disconnect")
        self._setup = asyncio.create_task(
            saved_state.subscribe(actor, self._cancellation), name="saved-state-setup"
        )
        self._subscription = await self._setup
        if self._closed or self._cancellation.aborted:
            self._subscription.close()
            raise RuntimeError("Saved state setup closed")

    async def _watch(self) -> None:
        while True:
            message = await self._request.receive()
            if message["type"] == "http.disconnect":
                self._cancellation.abort()
                return

    async def close(self) -> None:
        if not self._closed:
            self._closed = True
            self._cancellation.abort()
            if self._subscription:
                self._subscription.close()
        current = asyncio.current_task()
        tasks = tuple(
            task
            for task in (self._setup, self._pull, self._body, self._disconnect)
            if task is not None and task is not current
        )
        for task in tasks:
            if not task.done() and not task.cancelling():
                task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        if not self._notified:
            self._notified = True
            self._on_close()

    async def _send(self, send: Send, message: dict[str, object]) -> None:
        async with asyncio.timeout(SAVED_STATE_SEND_SECONDS):
            await send(message)

    async def _stream(self, send: Send) -> None:
        subscription = self._subscription
        if subscription is None:
            raise RuntimeError("Saved state response has not completed setup")
        await self._send(
            send, {"type": "http.response.start", "status": 200, "headers": self.raw_headers}
        )
        while not self._closed and not self._cancellation.aborted:
            if self._pull is None:
                self._pull = asyncio.create_task(subscription.next(), name="saved-state-pull")
            done, _ = await asyncio.wait({self._pull}, timeout=SAVED_STATE_HEARTBEAT_SECONDS)
            if not done:
                await self._send(
                    send,
                    {"type": "http.response.body", "body": b": heartbeat\n\n", "more_body": True},
                )
                continue
            event = self._pull.result()
            self._pull = None
            if event is None:
                break
            # There is no await between authorization and the corresponding send.
            delivery = await subscription.deliver(event)
            if self._closed or self._cancellation.aborted or delivery is None:
                break
            data = delivery.to_dto()["data"]
            frame = f"event: {delivery.event}\ndata: {json.dumps(data, separators=(',', ':'))}\n\n"
            await self._send(
                send, {"type": "http.response.body", "body": frame.encode(), "more_body": True}
            )
            if delivery.event == "auth-expired":
                break
        if not self._closed and not self._cancellation.aborted:
            await self._send(send, {"type": "http.response.body", "body": b"", "more_body": False})

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if self._called or self._closed:
            return
        self._called = True
        self._body = asyncio.create_task(self._stream(send), name="saved-state-body")
        assert self._disconnect is not None
        try:
            await asyncio.wait({self._body, self._disconnect}, return_when=asyncio.FIRST_COMPLETED)
            if self._body.done() and not self._body.cancelled():
                self._body.result()
            if self._disconnect.done() and not self._disconnect.cancelled():
                self._disconnect.result()
        finally:
            await self.close()
