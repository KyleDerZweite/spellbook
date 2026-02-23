"""
Import/Export Service for Spellbook v2.0

Handles bulk import and export of collections in various formats.
"""

import asyncio
import csv
import json
import logging
from io import StringIO, BytesIO
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from uuid import UUID
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.card_index import CardIndex
from app.models.card import Card, CardStorageReason
from app.models.collection import Collection, CollectionCard
from app.services.card_service import card_service
from app.core.exceptions import ValidationError

logger = logging.getLogger(__name__)


class ImportExportService:
    """
    Service for importing and exporting collections.

    Supported formats:
    - CSV (generic format)
    - Deckbox export format
    - Moxfield export format
    - MTG Arena format
    - JSON (Spellbook native format)
    """

    # Column mappings for different formats
    DECKBOX_COLUMNS = {
        "Count": "quantity",
        "Name": "name",
        "Edition": "set_name",
        "Edition Code": "set_code",
        "Card Number": "collector_number",
        "Condition": "condition",
        "Foil": "foil",
        "Language": "language",
    }

    MOXFIELD_COLUMNS = {
        "Quantity": "quantity",
        "Name": "name",
        "Set Code": "set_code",
        "Set Name": "set_name",
        "Collector Number": "collector_number",
        "Condition": "condition",
        "Foil": "foil",
        "Language": "language",
        "Purchase Price": "purchase_price",
    }

    CONDITION_MAP = {
        "mint": "mint",
        "m": "mint",
        "near mint": "near_mint",
        "nm": "near_mint",
        "excellent": "excellent",
        "ex": "excellent",
        "good": "good",
        "gd": "good",
        "light played": "lightly_played",
        "lp": "lightly_played",
        "played": "played",
        "mp": "moderately_played",
        "moderately played": "moderately_played",
        "heavily played": "heavily_played",
        "hp": "heavily_played",
        "damaged": "damaged",
        "dmg": "damaged",
    }

    async def import_csv(
        self,
        file_content: str,
        user_id: UUID,
        collection_id: UUID,
        session: AsyncSession,
        format_hint: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Import cards from CSV file.

        Args:
            file_content: Raw CSV content
            user_id: Owner of the collection
            collection_id: Target collection
            session: Database session
            format_hint: Optional format hint (deckbox, moxfield, generic)

        Returns:
            Import result with success/failure counts
        """
        # Parse CSV
        reader = csv.DictReader(StringIO(file_content))
        headers = reader.fieldnames or []

        # Detect format
        format_type = format_hint or self._detect_format(headers)
        column_map = self._get_column_map(format_type)

        results = {
            "format_detected": format_type,
            "total_lines": 0,
            "successful": 0,
            "failed": 0,
            "skipped": 0,
            "errors": [],
            "cards_added": [],
        }

        for line_num, row in enumerate(reader, start=2):
            results["total_lines"] += 1

            try:
                card_data = self._normalize_row(row, column_map)

                if not card_data.get("name"):
                    results["skipped"] += 1
                    continue

                # Find matching card
                card_match = await self._find_card(
                    name=card_data["name"],
                    set_code=card_data.get("set_code"),
                    collector_number=card_data.get("collector_number"),
                    session=session,
                )

                if not card_match:
                    results["failed"] += 1
                    results["errors"].append(
                        {
                            "line": line_num,
                            "name": card_data["name"],
                            "error": "Card not found in database",
                        }
                    )
                    continue

                # Add to collection
                await self._add_to_collection(
                    scryfall_id=card_match["scryfall_id"],
                    collection_id=collection_id,
                    user_id=user_id,
                    quantity=card_data.get("quantity", 1),
                    condition=card_data.get("condition"),
                    session=session,
                )

                results["successful"] += 1
                results["cards_added"].append(
                    {
                        "name": card_data["name"],
                        "quantity": card_data.get("quantity", 1),
                        "set_code": card_match["set_code"],
                    }
                )

            except Exception as e:
                results["failed"] += 1
                results["errors"].append(
                    {
                        "line": line_num,
                        "name": row.get("Name", row.get("name", "Unknown")),
                        "error": str(e),
                    }
                )

        logger.info(
            f"Import completed: {results['successful']}/{results['total_lines']} successful"
        )
        return results

    async def import_arena(
        self,
        file_content: str,
        user_id: UUID,
        collection_id: UUID,
        session: AsyncSession,
    ) -> Dict[str, Any]:
        """
        Import from MTG Arena deck format.

        Format: "4 Lightning Bolt (2ED) 123"
        """
        results = {
            "format_detected": "arena",
            "total_lines": 0,
            "successful": 0,
            "failed": 0,
            "skipped": 0,
            "errors": [],
            "cards_added": [],
        }

        # Arena format regex: quantity name (set) collector_number
        pattern = r"^(\d+)\s+(.+?)(?:\s+\(([A-Z0-9]+)\))?(?:\s+(\d+))?$"

        for line_num, line in enumerate(file_content.strip().split("\n"), start=1):
            line = line.strip()

            if not line or line.startswith("//") or line.startswith("#"):
                continue

            # Skip section headers
            if line in ["Deck", "Sideboard", "Commander", "Companion"]:
                continue

            results["total_lines"] += 1

            match = re.match(pattern, line)
            if not match:
                results["skipped"] += 1
                continue

            try:
                quantity = int(match.group(1))
                name = match.group(2).strip()
                set_code = match.group(3)
                collector_num = match.group(4)

                # Find card
                card_match = await self._find_card(
                    name=name,
                    set_code=set_code,
                    collector_number=collector_num,
                    session=session,
                )

                if not card_match:
                    results["failed"] += 1
                    results["errors"].append(
                        {"line": line_num, "name": name, "error": "Card not found"}
                    )
                    continue

                await self._add_to_collection(
                    scryfall_id=card_match["scryfall_id"],
                    collection_id=collection_id,
                    user_id=user_id,
                    quantity=quantity,
                    session=session,
                )

                results["successful"] += 1
                results["cards_added"].append(
                    {
                        "name": name,
                        "quantity": quantity,
                        "set_code": set_code or card_match["set_code"],
                    }
                )

            except Exception as e:
                results["failed"] += 1
                results["errors"].append(
                    {"line": line_num, "name": line, "error": str(e)}
                )

        return results

    async def import_json(
        self,
        file_content: str,
        user_id: UUID,
        collection_id: UUID,
        session: AsyncSession,
    ) -> Dict[str, Any]:
        """
        Import from Spellbook JSON format.
        """
        results = {
            "format_detected": "json",
            "total_lines": 0,
            "successful": 0,
            "failed": 0,
            "skipped": 0,
            "errors": [],
            "cards_added": [],
        }

        try:
            data = json.loads(file_content)
            cards = data.get("cards", data) if isinstance(data, dict) else data

            if not isinstance(cards, list):
                raise ValidationError("Invalid JSON format")

            for idx, card_data in enumerate(cards):
                results["total_lines"] += 1

                try:
                    scryfall_id = card_data.get("scryfall_id")
                    name = card_data.get("name")

                    if scryfall_id:
                        # Direct import by ID
                        await self._add_to_collection(
                            scryfall_id=UUID(scryfall_id),
                            collection_id=collection_id,
                            user_id=user_id,
                            quantity=card_data.get("quantity", 1),
                            condition=card_data.get("condition"),
                            session=session,
                        )
                        results["successful"] += 1
                        results["cards_added"].append(card_data)
                    elif name:
                        # Find by name
                        card_match = await self._find_card(
                            name=name,
                            set_code=card_data.get("set_code"),
                            session=session,
                        )

                        if card_match:
                            await self._add_to_collection(
                                scryfall_id=card_match["scryfall_id"],
                                collection_id=collection_id,
                                user_id=user_id,
                                quantity=card_data.get("quantity", 1),
                                condition=card_data.get("condition"),
                                session=session,
                            )
                            results["successful"] += 1
                            results["cards_added"].append(card_data)
                        else:
                            results["failed"] += 1
                            results["errors"].append(
                                {"index": idx, "name": name, "error": "Card not found"}
                            )
                    else:
                        results["skipped"] += 1

                except Exception as e:
                    results["failed"] += 1
                    results["errors"].append({"index": idx, "error": str(e)})

        except json.JSONDecodeError as e:
            raise ValidationError(f"Invalid JSON: {e}")

        return results

    async def export_csv(
        self,
        collection_id: UUID,
        user_id: UUID,
        session: AsyncSession,
        include_prices: bool = True,
    ) -> str:
        """
        Export collection to CSV format.
        """
        # Get collection cards with details
        from sqlalchemy.orm import selectinload

        result = await session.execute(
            select(CollectionCard)
            .options(selectinload(CollectionCard.card))
            .join(Collection)
            .where(Collection.id == collection_id, Collection.user_id == user_id)
        )
        collection_cards = result.scalars().all()

        # Build CSV
        output = StringIO()
        fieldnames = [
            "Quantity",
            "Name",
            "Set Code",
            "Collector Number",
            "Condition",
            "Foil",
            "Language",
        ]

        if include_prices:
            fieldnames.extend(["Price USD", "Price EUR"])

        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()

        for cc in collection_cards:
            if not cc.card:
                continue

            row = {
                "Quantity": cc.quantity,
                "Name": cc.card.name,
                "Set Code": cc.card.extra_data.get("set_info", {}).get("code", ""),
                "Collector Number": cc.card.collector_number or "",
                "Condition": cc.condition or "",
                "Foil": (
                    "Yes" if cc.condition and "foil" in cc.condition.lower() else "No"
                ),
                "Language": "en",
            }

            if include_prices and cc.card.prices:
                row["Price USD"] = cc.card.prices.get("usd", "")
                row["Price EUR"] = cc.card.prices.get("eur", "")

            writer.writerow(row)

        return output.getvalue()

    async def export_json(
        self,
        collection_id: UUID,
        user_id: UUID,
        session: AsyncSession,
        include_full_details: bool = False,
    ) -> str:
        """
        Export collection to JSON format.
        """
        from sqlalchemy.orm import selectinload

        result = await session.execute(
            select(CollectionCard)
            .options(selectinload(CollectionCard.card))
            .join(Collection)
            .where(Collection.id == collection_id, Collection.user_id == user_id)
        )
        collection_cards = result.scalars().all()

        cards = []
        for cc in collection_cards:
            if not cc.card:
                continue

            card_data = {
                "scryfall_id": (
                    str(cc.card.scryfall_id) if cc.card.scryfall_id else None
                ),
                "oracle_id": str(cc.card.oracle_id) if cc.card.oracle_id else None,
                "name": cc.card.name,
                "set_code": cc.card.extra_data.get("set_info", {}).get("code", ""),
                "collector_number": cc.card.collector_number,
                "quantity": cc.quantity,
                "condition": cc.condition,
            }

            if include_full_details:
                card_data.update(
                    {
                        "mana_cost": cc.card.mana_cost,
                        "type_line": cc.card.type_line,
                        "oracle_text": cc.card.oracle_text,
                        "colors": cc.card.colors,
                        "rarity": cc.card.rarity,
                        "prices": cc.card.prices,
                        "image_uris": cc.card.image_uris,
                    }
                )

            cards.append(card_data)

        export_data = {
            "format": "spellbook",
            "version": "2.0",
            "exported_at": datetime.utcnow().isoformat(),
            "card_count": len(cards),
            "cards": cards,
        }

        return json.dumps(export_data, indent=2)

    async def export_arena(
        self, collection_id: UUID, user_id: UUID, session: AsyncSession
    ) -> str:
        """
        Export collection in MTG Arena format.
        """
        from sqlalchemy.orm import selectinload

        result = await session.execute(
            select(CollectionCard)
            .options(selectinload(CollectionCard.card))
            .join(Collection)
            .where(Collection.id == collection_id, Collection.user_id == user_id)
        )
        collection_cards = result.scalars().all()

        lines = []
        for cc in collection_cards:
            if not cc.card:
                continue

            set_code = cc.card.extra_data.get("set_info", {}).get("code", "")
            collector_num = cc.card.collector_number or ""

            if set_code and collector_num:
                line = f"{cc.quantity} {cc.card.name} ({set_code}) {collector_num}"
            elif set_code:
                line = f"{cc.quantity} {cc.card.name} ({set_code})"
            else:
                line = f"{cc.quantity} {cc.card.name}"

            lines.append(line)

        return "\n".join(lines)

    # ==================== Private Methods ====================

    def _detect_format(self, headers: List[str]) -> str:
        """Detect the import format from headers"""
        headers_lower = [h.lower() for h in headers]

        if "edition code" in headers_lower:
            return "deckbox"
        elif "set code" in headers_lower and "purchase price" in headers_lower:
            return "moxfield"
        else:
            return "generic"

    def _get_column_map(self, format_type: str) -> Dict[str, str]:
        """Get column mapping for format"""
        if format_type == "deckbox":
            return self.DECKBOX_COLUMNS
        elif format_type == "moxfield":
            return self.MOXFIELD_COLUMNS
        else:
            return {
                "Quantity": "quantity",
                "Count": "quantity",
                "Name": "name",
                "Card Name": "name",
                "Set": "set_code",
                "Set Code": "set_code",
                "Edition": "set_name",
                "Number": "collector_number",
                "Collector Number": "collector_number",
                "Condition": "condition",
            }

    def _normalize_row(
        self, row: Dict[str, str], column_map: Dict[str, str]
    ) -> Dict[str, Any]:
        """Normalize a row using column mapping"""
        normalized = {}

        for csv_col, internal_col in column_map.items():
            if csv_col in row:
                value = row[csv_col].strip()

                if internal_col == "quantity":
                    normalized[internal_col] = int(value) if value else 1
                elif internal_col == "condition":
                    normalized[internal_col] = self.CONDITION_MAP.get(
                        value.lower(), value
                    )
                elif internal_col == "foil":
                    normalized[internal_col] = value.lower() in (
                        "yes",
                        "true",
                        "1",
                        "foil",
                    )
                else:
                    normalized[internal_col] = value if value else None

        return normalized

    async def _find_card(
        self,
        name: str,
        set_code: Optional[str],
        collector_number: Optional[str] = None,
        session: AsyncSession = None,
    ) -> Optional[Dict[str, Any]]:
        """Find a card in the database"""

        query = select(CardIndex).where(CardIndex.name.ilike(name))

        if set_code:
            query = query.where(CardIndex.set_code == set_code.upper())

        if collector_number:
            query = query.where(CardIndex.collector_number == collector_number)

        query = query.limit(1)

        result = await session.execute(query)
        card = result.scalar_one_or_none()

        if card:
            return {
                "scryfall_id": card.scryfall_id,
                "oracle_id": card.oracle_id,
                "name": card.name,
                "set_code": card.set_code,
            }

        return None

    async def _add_to_collection(
        self,
        scryfall_id: UUID,
        collection_id: UUID,
        user_id: UUID,
        quantity: int,
        session: AsyncSession,
        condition: Optional[str] = None,
    ):
        """Add a card to collection"""

        # Ensure card is in our database
        card = await card_service.get_card_details(scryfall_id, session)
        if card:
            await card_service.make_card_permanent(
                scryfall_id, CardStorageReason.USER_COLLECTION, session, user_id
            )

        # Check if already in collection
        result = await session.execute(
            select(CollectionCard).where(
                CollectionCard.collection_id == collection_id,
                CollectionCard.card_scryfall_id == scryfall_id,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.quantity += quantity
        else:
            collection_card = CollectionCard(
                collection_id=collection_id,
                card_scryfall_id=scryfall_id,
                quantity=quantity,
                condition=condition,
            )
            session.add(collection_card)

        await session.commit()


# Global service instance
import_export_service = ImportExportService()
