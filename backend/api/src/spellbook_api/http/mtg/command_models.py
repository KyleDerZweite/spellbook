"""Closed HTTP command models; optional input keys stay absent without defaults."""

from typing import Annotated, Literal, NotRequired, TypedDict

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, with_config

_INPUT_CONFIG = ConfigDict(strict=True, extra="forbid", allow_inf_nan=False)


@with_config(_INPUT_CONFIG)
class InventoryAddInput(TypedDict):
    requestId: str
    catalogCardId: str
    finish: str
    condition: str
    quantity: int | float
    notes: NotRequired[str]
    notesRevision: NotRequired[str]


@with_config(_INPUT_CONFIG)
class InventoryPatchInput(TypedDict):
    requestId: str
    entryId: str
    quantity: NotRequired[int | float]
    delta: NotRequired[int | float]
    notes: NotRequired[str]
    notesRevision: NotRequired[str]


@with_config(_INPUT_CONFIG)
class InventoryRemoveInput(TypedDict):
    requestId: str
    entryId: str
    expectedQuantity: int | float


@with_config(_INPUT_CONFIG)
class DeckCreateInput(TypedDict):
    game: Literal["mtg"]
    name: str
    description: str
    format: str


@with_config(_INPUT_CONFIG)
class DeckAddInput(TypedDict):
    deckId: str
    catalogCardId: str
    quantity: int | float
    role: str
    requestId: str


@with_config(_INPUT_CONFIG)
class DeckChangePrintingInput(TypedDict):
    entryId: str
    catalogCardId: str
    quantity: int | float
    role: str
    requestId: str
    categoryPreview: NotRequired[str]


@with_config(_INPUT_CONFIG)
class DeckUpdateInput(TypedDict):
    entryId: str
    quantity: NotRequired[int | float]
    role: NotRequired[str]
    requestId: str
    delta: NotRequired[int | float]
    categoryPreview: NotRequired[str]


@with_config(_INPUT_CONFIG)
class DeckRemoveInput(TypedDict):
    entryId: str
    requestId: str


@with_config(_INPUT_CONFIG)
class DeckImportInput(TypedDict):
    deckId: str
    text: str
    requestId: str


class InventoryAddCommand(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    operation: Literal["inventory.add"]
    input: InventoryAddInput


class InventoryPatchCommand(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    operation: Literal["inventory.patchEntry"]
    input: InventoryPatchInput


class InventoryRemoveCommand(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    operation: Literal["inventory.remove"]
    input: InventoryRemoveInput


class DeckCreateCommand(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    operation: Literal["decks.createRecord"]
    input: DeckCreateInput


class DeckAddCommand(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    operation: Literal["decks.addCatalogCard"]
    input: DeckAddInput


class DeckChangePrintingCommand(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    operation: Literal["decks.changePrinting"]
    input: DeckChangePrintingInput


class DeckUpdateCommand(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    operation: Literal["decks.updateCard"]
    input: DeckUpdateInput


class DeckRemoveCommand(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    operation: Literal["decks.removeCard"]
    input: DeckRemoveInput


class DeckImportCommand(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    operation: Literal["decks.importInto"]
    input: DeckImportInput


type WebCommand = Annotated[
    InventoryAddCommand
    | InventoryPatchCommand
    | InventoryRemoveCommand
    | DeckCreateCommand
    | DeckAddCommand
    | DeckChangePrintingCommand
    | DeckUpdateCommand
    | DeckRemoveCommand
    | DeckImportCommand,
    Field(discriminator="operation"),
]

COMMAND = TypeAdapter[WebCommand](WebCommand)
