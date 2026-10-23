"""Public JSON DTOs corresponding to contracts/src category contracts.

SQL JSONB is decoded at the persistence boundary; incoming rule trees are
validated before they can become one of these immutable version snapshots.
"""

from typing import Literal, NotRequired, TypedDict

from .rules import Truth

type CategoryRole = Literal["main", "commander", "sideboard", "companion"]
type CategoryScope = Literal["entry", "deck"]
type StarterOrigin = Literal[
    "lands", "board-wipes", "counterspells", "removal", "ramp", "draw", "protection", "recursion"
]


class EntryGroup(TypedDict):
    op: Literal["all", "any"]
    children: list[EntryRule]


class EntryNot(TypedDict):
    op: Literal["not"]
    child: EntryRule


class TraitRule(TypedDict):
    op: Literal["type", "keyword"]
    value: str


class OracleTagRule(TypedDict):
    op: Literal["oracleTag"]
    tagId: str
    includeDescendants: bool


class MappedTraitRule(TypedDict):
    op: Literal["mappedTrait"]
    traitId: StarterOrigin
    mappingVersion: int


class CanonicalCardsRule(TypedDict):
    op: Literal["canonicalCards"]
    oracleIds: list[str]


class ComboParticipantRule(TypedDict):
    op: Literal["comboParticipant"]
    outcomeId: str
    policyVersion: Literal["ingredients-v1"]


type EntryRule = (
    EntryGroup
    | EntryNot
    | TraitRule
    | OracleTagRule
    | MappedTraitRule
    | CanonicalCardsRule
    | ComboParticipantRule
)


class DeckGroup(TypedDict):
    op: Literal["all", "any"]
    children: list[DeckRule]


class DeckNot(TypedDict):
    op: Literal["not"]
    child: DeckRule


class MinimumRule(TypedDict):
    op: Literal["minimumCopies", "minimumDistinct"]
    predicate: EntryRule
    minimum: int


class PercentageRule(TypedDict):
    op: Literal["percentage"]
    predicate: EntryRule
    basisPoints: int
    denominator: Literal["all-cards", "nonland"]


class ComboOutcomeRule(TypedDict):
    op: Literal["comboOutcome"]
    outcomeId: str
    policyVersion: Literal["ingredients-v1"]


type DeckRule = DeckGroup | DeckNot | MinimumRule | PercentageRule | ComboOutcomeRule


class DefinitionVersion(TypedDict):
    id: str
    originId: str
    scope: CategoryScope
    version: int
    name: str
    meaning: str
    priority: int
    displayOrder: int
    roles: list[CategoryRole]
    rule: EntryRule | DeckRule
    createdAt: str


class LibraryDefinition(TypedDict):
    originId: str
    archived: bool
    current: DefinitionVersion


class LibraryDefinitionDetail(LibraryDefinition):
    libraryRevision: str


class CategoryLibrary(TypedDict):
    revision: str
    definitions: list[LibraryDefinition]


class CategoryLibraryPage(CategoryLibrary):
    total: int
    offset: int
    limit: int


class LibraryAcknowledgement(TypedDict):
    requestId: str
    libraryRevision: str
    originId: str
    versionId: str
    changed: bool


class ComboSourceToken(TypedDict):
    enabled: bool
    publicationId: str | None
    policyVersion: Literal["ingredients-v1"]


class RefreshStatus(TypedDict):
    kind: Literal["NeverAttempted", "Succeeded", "Failed"]
    attemptedAt: NotRequired[str]
    error: NotRequired[str]


class ComboSource(ComboSourceToken):
    availability: Literal["Disabled", "Unavailable", "Available"]
    refreshStatus: RefreshStatus
    sourceTime: str | None
    sourceVersion: str | None
    payloadDigest: str | None
    decodedDigest: str | None
    parserVersion: int | None


class ComboIngredient(TypedDict):
    oracleId: str | None
    name: str
    quantity: str
    mustBeCommander: bool
    zones: list[str]
    usedFace: int | None
    states: dict[str, str]


class ComboTemplate(TypedDict):
    id: str
    name: str
    query: str | None
    quantity: str
    zones: list[str]
    states: dict[str, str]
    mustBeCommander: bool
    usedFace: int | None


class ComboProducedOutcome(TypedDict):
    id: str
    name: str
    status: str
    uncountable: bool
    quantity: str


class ComboVariant(TypedDict):
    id: str
    status: str
    ingredients: list[ComboIngredient]
    outcomeIds: list[str]
    unsupportedReasons: list[str]
    mana: str
    prerequisites: str
    steps: str
    notes: str
    templates: list[ComboTemplate]
    producedOutcomes: list[ComboProducedOutcome]


class ComboProof(TypedDict):
    variant: ComboVariant
    publicationId: str
    outcomeId: str
    roles: list[CategoryRole]
    policyVersion: Literal["ingredients-v1"]
    parserVersion: int


class ParticipantWitness(TypedDict):
    proof: ComboProof
    entryIds: list[str]


class ComboEvaluationEvidence(TypedDict):
    outcomeId: str
    roles: list[CategoryRole]
    truth: Truth
    proof: ComboProof | None
    participantTruth: NotRequired[Truth]
    participantWitnesses: NotRequired[list[ParticipantWitness]]


class ComboEvidence(TypedDict):
    source: ComboSource
    evaluations: list[ComboEvaluationEvidence]


class EntryDefinition(TypedDict):
    id: str
    origin: StarterOrigin | Literal["custom"]
    originId: NotRequired[str]
    definitionVersionId: NotRequired[str]
    meaning: NotRequired[str]
    rule: NotRequired[EntryRule]
    automaticEligible: NotRequired[bool]
    definitionSnapshot: NotRequired[DefinitionVersion]
    name: str
    version: int
    policyVersion: int
    mappingVersion: int
    priority: int
    displayOrder: int
    rootId: str | None
    descendants: bool
    excludeLand: bool


class PredicateEvidence(TypedDict):
    origin: StarterOrigin | Literal["custom"]
    definitionId: NotRequired[str]
    definitionName: NotRequired[str]
    definitionVersion: NotRequired[int]
    result: Truth
    matchedTagIds: list[str]


class CategoryEvidence(TypedDict):
    combo: NotRequired[ComboEvidence]
    predicates: list[PredicateEvidence]
    catalogGenerationId: str | None
    oraclePublicationId: str | None
    sourceTime: str | None
    payloadDigest: str | None
    parserVersion: int | None
    printingId: str
    rawOracleId: str | None
    types: list[str] | None
    transformVersion: int | None


class EntryCategoryDecision(TypedDict):
    entryId: str
    categoryId: str | None
    state: Literal["Automatic", "Manual", "Pending"]
    revision: str
    evidence: CategoryEvidence | None
    definitionSnapshot: NotRequired[DefinitionVersion | EntryDefinition | None]
    previousEvaluation: NotRequired[CategoryEvidence | None]


class SourceStatus(TypedDict):
    kind: Literal["NeverAttempted", "Succeeded", "Failed"]
    sourceTime: str | None


class SuppressedOrigin(TypedDict):
    originId: str
    name: str


class DeckEntryCategories(TypedDict):
    deckId: str
    initialized: bool
    decisionRevision: str
    definitions: list[EntryDefinition]
    libraryRevision: NotRequired[str]
    wholeDeckDefinitions: NotRequired[list[DefinitionVersion]]
    suppressedOrigins: NotRequired[list[SuppressedOrigin]]
    decisions: list[EntryCategoryDecision]
    sourceStatus: SourceStatus


class CategoryAcknowledgement(TypedDict):
    requestId: str
    deckId: str
    decisionRevision: str
    entryIds: list[str]


class CategorySourceTokens(TypedDict):
    catalogGenerationId: str | None
    oraclePublicationId: str | None
    policy: str
    combo: NotRequired[ComboSourceToken]


class CategoryMergePreview(TypedDict):
    required: bool
    token: str
    source: EntryCategoryDecision | None
    destination: EntryCategoryDecision | None
    destinationEntryId: str | None
    resultingQuantity: int
    compositionRevision: str
    decisionRevision: str
    sourceTokens: CategorySourceTokens


class WholeRuleEvidence(TypedDict):
    op: Literal[
        "all", "any", "not", "minimumCopies", "minimumDistinct", "percentage", "comboOutcome"
    ]
    truth: Truth
    lower: NotRequired[str]
    upper: NotRequired[str]
    denominatorLower: NotRequired[str]
    denominatorUpper: NotRequired[str]
    nonemptyContributionLower: NotRequired[str | None]
    nonemptyContributionUpper: NotRequired[str | None]
    emptyDenominatorPossible: NotRequired[bool]
    children: NotRequired[list[WholeRuleEvidence]]


class WholeCategoryEvidence(TypedDict):
    combo: NotRequired[ComboEvidence]
    definitionVersionId: str
    rule: EntryRule | DeckRule
    roles: list[CategoryRole]
    compositionRevision: str
    attemptedTruth: Truth
    bounds: WholeRuleEvidence
    catalogGenerationId: str | None
    oraclePublicationId: str | None
    sourceTime: str | None
    payloadDigest: str | None
    parserVersion: int | None
    transformVersions: list[int]


class WholeCategoryDecision(TypedDict):
    versionId: str
    state: Literal["Automatic", "Pending", "Manual"]
    manual: Literal["Include", "Exclude"] | None
    truth: Literal["True", "False"] | None
    attemptedTruth: Truth | None
    revision: str
    evidence: WholeCategoryEvidence | None
    previousEvaluation: WholeCategoryEvidence | None


class WholeCategory(TypedDict):
    versionId: str
    originId: str
    definition: DefinitionVersion
    name: str
    displayOrder: int
    suppressed: bool
    automaticActive: bool
    decision: WholeCategoryDecision | None


class DeckWholeCategories(TypedDict):
    deckId: str
    initialized: bool
    decisionRevision: str
    categories: list[WholeCategory]


class WholeCategoryAcknowledgement(TypedDict):
    requestId: str
    deckId: str
    scope: Literal["deck"]
    decisionRevision: str
    versionIds: list[str]
    changed: bool


class CategoryDifference(TypedDict):
    kind: Literal[
        "DefinitionAdded",
        "DefinitionChanged",
        "DefinitionRemoved",
        "RetainedManual",
        "EntryChanged",
        "EntryPreserved",
        "DeckChanged",
        "DeckPreserved",
        "OriginRestored",
        "NameConflict",
    ]
    entityId: str
    message: str
    before: NotRequired[EntryDefinition | EntryCategoryDecision | WholeCategory | None]
    after: NotRequired[EntryDefinition | EntryCategoryDecision | WholeCategory | None]


class CategoryPreview(TypedDict):
    id: str
    deckId: str
    scope: CategoryScope
    mode: Literal["Review", "Reset"]
    status: Literal["Ready", "BlockedByNameConflict", "Expired", "Committed", "Unsupported"]
    expiresAt: str
    total: int
    offset: int
    limit: int
    differences: list[CategoryDifference]
    acknowledgement: CategoryAcknowledgement | WholeCategoryAcknowledgement | None


class Choice(TypedDict):
    id: str
    name: str


class CardChoice(TypedDict):
    oracleId: str
    name: str


class ComboChoices(TypedDict):
    source: ComboSource
    outcomes: list[Choice]
    selectedOutcomes: list[Choice]


class CategoryRuleChoices(TypedDict):
    tags: list[Choice]
    cards: list[CardChoice]
    combo: NotRequired[ComboChoices]


class CategoryMergeInput(TypedDict):
    deckId: str
    entryId: str
    catalogCardId: str
    role: CategoryRole
    quantity: int


class CategoryChangeIntent(TypedDict):
    requestId: str
    deckId: str
    scope: CategoryScope
    mode: Literal["Review", "Reset"]
    restoreOriginIds: list[str]


class SaveDefinitionInput(TypedDict):
    requestId: str
    originId: str | None
    expectedLibraryRevision: str
    scope: CategoryScope
    name: str
    meaning: str
    priority: int
    displayOrder: int
    roles: list[CategoryRole]
    rule: EntryRule | DeckRule
    confirmRetainedRule: bool
