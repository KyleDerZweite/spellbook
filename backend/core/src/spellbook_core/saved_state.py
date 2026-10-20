"""Bounded SavedState subscriptions. API lifetime owns the PostgreSQL listener."""

import asyncio
import json
from collections.abc import Callable, Coroutine
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal, TypedDict

from .auth import SessionAuth
from .errors import ActorError
from .models import Actor, SessionInfo

SAVED_STATE_CHANNEL = "spellbook_saved_state"
SAVED_STATE_TOPICS = ("profile", "inventory", "decks", "scan", "values")
SAVED_STATE_SETUP_SECONDS = 5.0
SAVED_STATE_REVALIDATE_SECONDS = 10.0
SAVED_STATE_SLOW_SECONDS = 30.0
SAVED_STATE_MAX_SUBSCRIBERS = 32
ListenerFailure = Literal["connect", "consumer", "auth_check", "barrier", "shutdown"]
EventName = Literal["reset", "recovering", "auth-expired", "invalidate"]


class Cancellation:
    """Synchronous transport-independent cancellation, with removable listeners."""

    def __init__(self) -> None:
        self._aborted = False
        self._listeners: set[Callable[[], None]] = set()

    @property
    def aborted(self) -> bool:
        return self._aborted

    def on_abort(self, listener: Callable[[], None]) -> Callable[[], None]:
        if self._aborted:
            listener()
        else:
            self._listeners.add(listener)
        return lambda: self._listeners.discard(listener)

    def abort(self) -> None:
        if self._aborted:
            return
        self._aborted = True
        for listener in tuple(self._listeners):
            listener()
        self._listeners.clear()


@dataclass(frozen=True, eq=False, slots=True)
class SavedStateEvent:
    """Immutable event. Only its issuing subscription can authorize its delivery."""

    event: EventName
    topics: tuple[str, ...] = ()

    def to_dto(self) -> dict[str, object]:
        return {"event": self.event, "data": {"topics": list(self.topics)} if self.topics else {}}


class SavedStateDiagnostics(TypedDict):
    subscribers: int
    ready: bool
    queuedEvents: int
    reservedEvents: int
    authorityTasks: int
    backgroundTasks: int
    heldSubscriptions: int
    expiryTimers: int
    slowTimers: int
    pendingAccounts: int
    generation: int | None
    epoch: int


class SavedStateUnavailable(Exception):
    def __init__(self) -> None:
        super().__init__("Saved state temporarily unavailable")


@dataclass(frozen=True, slots=True)
class _AuthorityRead:
    task: asyncio.Task[SessionInfo]
    generation: int | None
    epoch: int


class Subscription:
    def __init__(self, runtime: SavedState, actor: Actor) -> None:
        self._runtime = runtime
        self._actor = actor
        self.account_id = actor.account_id
        self._stopped = False
        self._queue: list[SavedStateEvent] = []
        self._issued: tuple[SavedStateEvent, int, int | None] | None = None
        self._wake = asyncio.Event()
        self._validation: _AuthorityRead | None = None
        self._fresh: _AuthorityRead | None = None
        self._reads: set[asyncio.Task[SessionInfo]] = set()
        self._expiry: asyncio.TimerHandle | None = None
        self._slow: asyncio.TimerHandle | None = None
        self._periodic: asyncio.Task[None] | None = None
        self._remove_abort: Callable[[], None] = lambda: None
        self._pulling = False

    def _session(self, session: SessionInfo) -> None:
        if self._expiry:
            self._expiry.cancel()
        seconds = (datetime.fromisoformat(session.expires_at) - datetime.now(UTC)).total_seconds()
        self._expiry = asyncio.get_running_loop().call_later(max(0, seconds), self._expire)

    def _offer(self, event: SavedStateEvent) -> None:
        if self._stopped:
            return
        if event.event in {"reset", "recovering"}:
            self._queue.clear()
        if event.event == "invalidate":
            for index, previous in enumerate(self._queue):
                if previous.event == "invalidate":
                    topics = tuple(dict.fromkeys((*previous.topics, *event.topics)))
                    self._queue[index] = SavedStateEvent("invalidate", topics)
                    return
        self._queue.append(event)
        if not self._slow:
            self._slow = asyncio.get_running_loop().call_later(
                SAVED_STATE_SLOW_SECONDS, self.close
            )
        self._wake.set()

    def _drained(self) -> None:
        if not self._queue and self._issued is None and self._slow:
            self._slow.cancel()
            self._slow = None

    def _control(self) -> SavedStateEvent | None:
        if self._queue and self._queue[0].event in {"recovering", "auth-expired"}:
            event = self._queue.pop(0)
            self._drained()
            return event
        return None

    async def next(self) -> SavedStateEvent | None:
        if self._pulling or self._issued is not None:
            raise RuntimeError("Saved state already has a pending reservation")
        self._pulling = True
        try:
            while True:
                if not self._queue:
                    if self._stopped:
                        return None
                    self._wake.clear()
                    await self._wake.wait()
                    continue
                event = self._queue.pop(0)
                epoch, generation = self._runtime._epoch, self._runtime._generation
                if event.event in {"reset", "invalidate"}:
                    if not await self._runtime._validate(self):
                        control = self._control()
                        if control is None:
                            self._drained()
                            if self._stopped:
                                return None
                            continue
                        event = control
                    elif not self._runtime._current(generation, epoch, ready=True):
                        continue
                self._issued = (event, self._runtime._epoch, self._runtime._generation)
                return event
        finally:
            self._pulling = False

    async def deliver(self, event: SavedStateEvent) -> SavedStateEvent | None:
        issued = self._issued
        if issued is None or issued[0] is not event:
            return None
        self._issued = None
        if event.event in {"recovering", "auth-expired"}:
            self._drained()
            if event.event == "recovering" and (
                self._runtime._epoch != issued[1]
                or self._runtime._generation != issued[2]
                or self._runtime._closing
            ):
                return await self._replacement()
            return event
        if not self._runtime._current(issued[2], issued[1], ready=True):
            self._drained()
            return await self._replacement()
        valid = await self._runtime._validate(self, fresh=True)
        self._drained()
        if valid and self._runtime._current(issued[2], issued[1], ready=True):
            return event
        return await self._replacement()

    async def _replacement(self) -> SavedStateEvent | None:
        control = self._control()
        if control is not None:
            return control
        if self._queue and self._runtime._ready and not self._stopped:
            event = await self.next()
            if event is not None:
                return await self.deliver(event)
        return None

    def _dispose(self) -> None:
        self._stopped = True
        self._remove_abort()
        self._remove_abort = lambda: None
        self._runtime._subscribers.discard(self)
        for timer in (self._expiry, self._slow):
            if timer:
                timer.cancel()
        self._expiry = self._slow = None
        current = asyncio.current_task()
        if self._periodic and self._periodic is not current:
            self._periodic.cancel()
        for read in self._reads:
            if not read.cancelling():
                read.cancel()
        self._wake.set()
        self._runtime._changed.set()
        self._runtime._release(self)

    def _expire(self) -> None:
        if self._stopped:
            return
        self._queue = [SavedStateEvent("auth-expired")]
        self._dispose()

    def close(self) -> None:
        self._issued = None
        self._queue.clear()
        self._dispose()


class SavedState:
    def __init__(
        self,
        auth: SessionAuth,
        *,
        ensure_listener: Callable[[], None],
        request_listener_recovery: Callable[[int, ListenerFailure], None],
    ) -> None:
        self._auth = auth
        self._ensure_listener = ensure_listener
        self._request_recovery = request_listener_recovery
        self._subscribers: set[Subscription] = set()
        # Retain an admission slot until cancelled queries actually settle.
        self._all: set[Subscription] = set()
        self._background: set[asyncio.Task[None]] = set()
        self._queries: set[asyncio.Task[SessionInfo]] = set()
        self._pending: dict[str, dict[str, None]] = {}
        self._dispatch = asyncio.Event()
        self._changed = asyncio.Event()
        self._generation: int | None = None
        self._epoch = 0
        self._live = False
        self._ready = False
        self._closing = False
        self._started = False
        self._barrier = False

    def start(self) -> None:
        if not self._started and not self._closing:
            self._started = True
            self._background_task(self._dispatcher())

    def _background_task(self, coroutine: Coroutine[object, object, None]) -> asyncio.Task[None]:
        task = asyncio.create_task(coroutine, name="saved-state-background")
        self._background.add(task)

        def settled(done: asyncio.Task[None]) -> None:
            self._background.discard(done)
            if not done.cancelled():
                done.exception()

        task.add_done_callback(settled)
        return task

    def _current(self, generation: int | None, epoch: int, *, ready: bool = False) -> bool:
        return (
            not self._closing
            and self._generation == generation
            and self._epoch == epoch
            and (generation is None or self._live)
            and (not ready or self._ready)
        )

    def listener_starting(self, generation: int) -> bool:
        if (
            self._closing
            or isinstance(generation, bool)
            or generation < 1
            or (self._generation is not None and generation <= self._generation)
        ):
            return False
        if self._live and self._generation is not None:
            self.listener_lost(self._generation, "consumer")
        self._generation = generation
        self._live = True
        self._ready = False
        self._epoch += 1
        self._changed.set()
        return True

    def listener_lost(self, generation: int, reason: ListenerFailure) -> bool:
        if self._closing or generation != self._generation or not self._live:
            return False
        self._live = self._ready = False
        self._epoch += 1
        self._pending.clear()
        for sub in self._subscribers:
            sub._offer(SavedStateEvent("recovering"))
        self._changed.set()
        return True

    def _failure(self, generation: int | None, reason: ListenerFailure) -> None:
        if generation is not None and self.listener_lost(generation, reason):
            self._request_recovery(generation, reason)

    async def listener_ready(self, generation: int) -> bool:
        epoch = self._epoch
        if self._barrier or not self._current(generation, epoch) or generation is None:
            return False
        if self._ready:
            return True
        self._barrier = True
        checked: set[Subscription] = set()
        used: set[asyncio.Task[SessionInfo]] = set()
        try:
            async with asyncio.timeout(SAVED_STATE_SETUP_SECONDS):
                while self._current(generation, epoch):
                    remaining = self._subscribers - checked
                    if not remaining:
                        # No await between the final membership check, ready and reset.
                        self._ready = True
                        for sub in self._subscribers:
                            sub._offer(SavedStateEvent("reset"))
                        self._changed.set()
                        return True
                    for sub in remaining:
                        await self._validate(sub, used=used)
                        if not self._current(generation, epoch):
                            return False
                        checked.add(sub)
            return False
        except TimeoutError:
            self._failure(generation, "barrier")
            return False
        except asyncio.CancelledError:
            self._failure(generation, "barrier")
            raise
        finally:
            self._barrier = False
            if used:
                await asyncio.gather(*used, return_exceptions=True)

    def _release(self, sub: Subscription) -> None:
        if sub._stopped and not sub._reads and (not sub._periodic or sub._periodic.done()):
            self._all.discard(sub)

    def _query(self, sub: Subscription, *, fresh: bool) -> _AuthorityRead:
        existing = sub._fresh if fresh else sub._validation
        if existing is not None:
            return existing
        query = asyncio.create_task(
            self._auth.actor_session(sub._actor), name="saved-state-authority"
        )
        self._queries.add(query)
        sub._reads.add(query)
        read = _AuthorityRead(query, self._generation, self._epoch)
        if fresh:
            sub._fresh = read
        else:
            sub._validation = read

        def settled(task: asyncio.Task[SessionInfo]) -> None:
            self._queries.discard(task)
            sub._reads.discard(task)
            if sub._validation is not None and sub._validation.task is task:
                sub._validation = None
            if sub._fresh is not None and sub._fresh.task is task:
                sub._fresh = None
            if not task.cancelled():
                task.exception()
            self._release(sub)

        query.add_done_callback(settled)
        return read

    async def _validate(
        self,
        sub: Subscription,
        *,
        fresh: bool = False,
        used: set[asyncio.Task[SessionInfo]] | None = None,
    ) -> bool:
        if sub._stopped or self._closing:
            return False
        epoch, generation = self._epoch, self._generation
        if generation is not None and not self._live:
            return False
        # A final read is never shared with an earlier final delivery.
        if fresh and sub._fresh is not None:
            return False
        query: asyncio.Task[SessionInfo] | None = None
        loop = asyncio.get_running_loop()
        deadline = loop.time() + SAVED_STATE_SETUP_SECONDS
        try:
            while True:
                read = self._query(sub, fresh=fresh)
                query = read.task
                if used is not None:
                    used.add(query)
                done, _ = await asyncio.wait({query}, timeout=max(0, deadline - loop.time()))
                if not done:
                    if not query.cancelling():
                        query.cancel()
                    raise SavedStateUnavailable()
                if sub._stopped or not self._current(generation, epoch):
                    return False
                if (read.generation, read.epoch) != (generation, epoch):
                    # Settlement frees the old reservation, but its result confers
                    # no authority on a replacement generation. Issue a new read.
                    continue
                session = query.result()
                break
        except asyncio.CancelledError:
            current = asyncio.current_task()
            if current is not None and current.cancelling():
                if query is not None and not query.cancelling():
                    query.cancel()
                raise
            if not sub._stopped:
                self._failure(generation, "auth_check")
            return False
        except ActorError:
            if self._current(generation, epoch) and not sub._stopped:
                sub._expire()
            return False
        except Exception:
            self._failure(generation, "auth_check")
            return False
        if sub._stopped or not self._current(generation, epoch):
            return False
        if session.user.account_id != sub.account_id:
            sub._expire()
            return False
        sub._session(session)
        return True

    async def _periodic(self, sub: Subscription) -> None:
        loop = asyncio.get_running_loop()
        due = loop.time() + SAVED_STATE_REVALIDATE_SECONDS
        while not sub._stopped and not self._closing:
            await asyncio.sleep(max(0, due - loop.time()))
            due = loop.time() + SAVED_STATE_REVALIDATE_SECONDS
            await self._validate(sub)

    async def subscribe(
        self, actor: Actor, cancellation: Cancellation | None = None
    ) -> Subscription:
        if self._closing or not self._started or (cancellation and cancellation.aborted):
            raise SavedStateUnavailable()
        if len(self._all) >= SAVED_STATE_MAX_SUBSCRIBERS:
            raise SavedStateUnavailable()
        sub = Subscription(self, actor)
        self._all.add(sub)
        if cancellation:
            sub._remove_abort = cancellation.on_abort(sub.close)
        try:
            async with asyncio.timeout(SAVED_STATE_SETUP_SECONDS):
                if not await self._validate(sub):
                    if sub._stopped and sub._queue:
                        raise ActorError()
                    raise SavedStateUnavailable()
                if self._closing or sub._stopped:
                    raise SavedStateUnavailable()
                self._subscribers.add(sub)
                sub._periodic = self._background_task(self._periodic(sub))
                sub._periodic.add_done_callback(lambda _: self._release(sub))
                self._ensure_listener()
                while not self._ready:
                    if sub._stopped and sub._queue and sub._queue[0].event == "auth-expired":
                        raise ActorError()
                    if self._closing or sub._stopped:
                        raise SavedStateUnavailable()
                    self._changed.clear()
                    # Closing the subscription must also wake setup waiters.
                    await self._changed.wait()
                if not await self._validate(sub) or sub._stopped or self._closing:
                    if sub._queue and sub._queue[0].event == "auth-expired":
                        raise ActorError()
                    raise SavedStateUnavailable()
                if not self._ready:
                    raise SavedStateUnavailable()
                if not any(event.event == "reset" for event in sub._queue):
                    sub._offer(SavedStateEvent("reset"))
                return sub
        except BaseException:
            sub.close()
            raise

    def receive_notification(self, generation: int, payload: str) -> None:
        if not self._ready or not self._live or self._closing or generation != self._generation:
            return
        try:
            value: object = json.loads(payload)
        except ValueError, RecursionError:
            return
        if not isinstance(value, dict):
            return
        topic = value.get("topic")
        if value.get("public") is True and topic == "values" and len(value) == 2:
            accounts = {sub.account_id for sub in self._subscribers}
        elif (
            "public" not in value
            and isinstance(value.get("accountId"), str)
            and isinstance(topic, str)
            and topic in (*SAVED_STATE_TOPICS, "auth")
        ):
            accounts = {value["accountId"]}
        else:
            return
        for account in accounts:
            if any(sub.account_id == account for sub in self._subscribers):
                self._pending.setdefault(account, {})[topic] = None
        self._dispatch.set()

    async def _dispatcher(self) -> None:
        while not self._closing:
            await self._dispatch.wait()
            self._dispatch.clear()
            while self._ready and self._pending:
                account = next(iter(self._pending))
                topics = self._pending.pop(account)
                epoch, generation = self._epoch, self._generation
                for sub in tuple(self._subscribers):
                    if sub.account_id != account:
                        continue
                    if await self._validate(sub) and self._current(generation, epoch, ready=True):
                        protected = tuple(topic for topic in topics if topic != "auth")
                        if protected:
                            sub._offer(SavedStateEvent("invalidate", protected))
                    if not self._current(generation, epoch, ready=True):
                        break

    def close_admission(self) -> None:
        if self._closing:
            return
        self._closing = True
        self._ready = self._live = False
        self._epoch += 1
        self._pending.clear()
        self._changed.set()

    async def close(self) -> None:
        self.close_admission()
        for sub in tuple(self._all):
            sub.close()
        tasks = (*self._background, *self._queries)
        for task in tasks:
            if not task.cancelling():
                task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    def diagnostics(self) -> SavedStateDiagnostics:
        return {
            "subscribers": len(self._subscribers),
            "ready": self._ready,
            "queuedEvents": sum(len(sub._queue) for sub in self._all),
            "reservedEvents": sum(sub._issued is not None for sub in self._all),
            "authorityTasks": len(self._queries),
            "backgroundTasks": len(self._background),
            "heldSubscriptions": len(self._all),
            "expiryTimers": sum(sub._expiry is not None for sub in self._all),
            "slowTimers": sum(sub._slow is not None for sub in self._all),
            "pendingAccounts": len(self._pending),
            "generation": self._generation,
            "epoch": self._epoch,
        }


def create_saved_state(
    auth: SessionAuth,
    *,
    ensure_listener: Callable[[], None],
    request_listener_recovery: Callable[[int, ListenerFailure], None],
) -> SavedState:
    return SavedState(
        auth, ensure_listener=ensure_listener, request_listener_recovery=request_listener_recovery
    )
